"""Real-time event bus abstraction with Redis Streams and in-memory asyncio fallback."""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from collections.abc import AsyncGenerator
from typing import Any, Protocol, runtime_checkable

from app.schemas.events import NormalizedEvent

logger = logging.getLogger("sentinel_flow.pipeline.event_bus")

STREAM_NAME = "events:raw"
DEFAULT_CONSUMER_GROUPS = ["feature-builder", "detector", "alerter", "ws-fanout"]


class DeduplicationCache:
    """Sliding-window idempotency cache ensuring at-least-once deduplication."""

    def __init__(self, ttl_seconds: float = 60.0, max_size: int = 50000) -> None:
        self.ttl_seconds = ttl_seconds
        self.max_size = max_size
        self._entries: dict[str, float] = {}
        self._order: deque[str] = deque()

    def is_duplicate(self, key: str) -> bool:
        if not key:
            return False
        now = time.monotonic()
        self._prune(now)

        if key in self._entries:
            return True

        self._entries[key] = now
        self._order.append(key)
        if len(self._entries) > self.max_size:
            evicted = self._order.popleft()
            self._entries.pop(evicted, None)
        return False

    def _prune(self, now: float) -> None:
        cutoff = now - self.ttl_seconds
        while self._order and self._entries.get(self._order[0], 0) < cutoff:
            evicted = self._order.popleft()
            self._entries.pop(evicted, None)


@runtime_checkable
class EventBus(Protocol):
    """Protocol for event publishing, subscription, and lag metrics."""

    async def publish(self, event: NormalizedEvent) -> bool:
        """Publish normalized event to stream. Returns False if duplicate."""
        ...

    async def subscribe(
        self, consumer_group: str, consumer_name: str
    ) -> AsyncGenerator[NormalizedEvent, None]:
        """Subscribe to a consumer group stream partition."""
        ...

    async def ack(self, consumer_group: str, event_id: str) -> None:
        """Acknowledge successful consumption of event."""
        ...

    async def get_metrics(self) -> dict[str, Any]:
        """Return lag, throughput, and queue depth metrics."""
        ...

    async def close(self) -> None:
        """Cleanly close bus and network connections."""
        ...


class InMemoryEventBus:
    """In-process multi-consumer asyncio.Queue bus matching Redis Streams semantics."""

    def __init__(self, consumer_groups: list[str] | None = None) -> None:
        self.consumer_groups = consumer_groups or DEFAULT_CONSUMER_GROUPS
        self._queues: dict[str, asyncio.Queue[NormalizedEvent]] = {
            group: asyncio.Queue(maxsize=10000) for group in self.consumer_groups
        }
        self._dedupe = DeduplicationCache(ttl_seconds=60.0)
        self._published_count = 0
        self._deduped_count = 0
        self._start_time = time.monotonic()
        self._is_closed = False

    async def publish(self, event: NormalizedEvent) -> bool:
        if self._is_closed:
            return False

        if event.idempotency_key and self._dedupe.is_duplicate(event.idempotency_key):
            self._deduped_count += 1
            return False

        self._published_count += 1
        for queue in self._queues.values():
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # Drop oldest item in queue to maintain bounded memory and fresh latency
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                queue.put_nowait(event)
        return True

    async def subscribe(
        self, consumer_group: str, consumer_name: str
    ) -> AsyncGenerator[NormalizedEvent, None]:
        if consumer_group not in self._queues:
            self._queues[consumer_group] = asyncio.Queue(maxsize=10000)
        queue = self._queues[consumer_group]

        while not self._is_closed:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=0.5)
                yield event
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def ack(self, consumer_group: str, event_id: str) -> None:
        pass

    async def get_metrics(self) -> dict[str, Any]:
        elapsed = max(0.001, time.monotonic() - self._start_time)
        lag = sum(q.qsize() for q in self._queues.values())
        return {
            "backend": "in_memory",
            "connected": True,
            "published_total": self._published_count,
            "deduped_total": self._deduped_count,
            "throughput_events_per_sec": round(self._published_count / elapsed, 2),
            "total_lag": lag,
            "queues": {grp: q.qsize() for grp, q in self._queues.items()},
        }

    async def close(self) -> None:
        self._is_closed = True


class RedisEventBus:
    """Redis Streams implementation with persistent consumer groups and acknowledgments."""

    def __init__(self, redis_url: str, consumer_groups: list[str] | None = None) -> None:
        self.redis_url = redis_url
        self.consumer_groups = consumer_groups or DEFAULT_CONSUMER_GROUPS
        self._client: Any = None
        self._dedupe = DeduplicationCache(ttl_seconds=60.0)
        self._published_count = 0
        self._deduped_count = 0
        self._start_time = time.monotonic()
        self._is_closed = False

    async def _get_client(self):
        if self._client is None:
            import redis.asyncio as aioredis

            self._client = aioredis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=False,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
            )
            # Create consumer groups on stream
            for group in self.consumer_groups:
                try:
                    await self._client.xgroup_create(STREAM_NAME, group, id="0", mkstream=True)
                except Exception as e:
                    if "BUSYGROUP" not in str(e):
                        logger.debug("Group creation notice: %s", e)
        return self._client

    async def publish(self, event: NormalizedEvent) -> bool:
        if self._is_closed:
            return False

        if event.idempotency_key and self._dedupe.is_duplicate(event.idempotency_key):
            self._deduped_count += 1
            return False

        client = await self._get_client()
        await client.xadd(STREAM_NAME, event.to_stream_dict(), maxlen=100000, approximate=True)
        self._published_count += 1
        return True

    async def subscribe(
        self, consumer_group: str, consumer_name: str
    ) -> AsyncGenerator[NormalizedEvent, None]:
        client = await self._get_client()
        while not self._is_closed:
            try:
                entries = await client.xreadgroup(
                    consumer_group,
                    consumer_name,
                    streams={STREAM_NAME: ">"},
                    count=20,
                    block=500,
                )
                if not entries:
                    continue

                for _, messages in entries:
                    for msg_id, fields in messages:
                        try:
                            event = NormalizedEvent.from_stream_dict(fields)
                            yield event
                        except Exception:
                            logger.exception("Failed deserializing event from stream")
                        finally:
                            await client.xack(STREAM_NAME, consumer_group, msg_id)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning("Redis stream read error: %s", e)
                await asyncio.sleep(0.5)

    async def ack(self, consumer_group: str, event_id: str) -> None:
        try:
            client = await self._get_client()
            await client.xack(STREAM_NAME, consumer_group, event_id)
        except Exception:
            pass

    async def get_metrics(self) -> dict[str, Any]:
        elapsed = max(0.001, time.monotonic() - self._start_time)
        try:
            client = await self._get_client()
            info = await client.xinfo_stream(STREAM_NAME)
            stream_length = info.get("length", 0) if isinstance(info, dict) else 0
        except Exception:
            stream_length = 0

        return {
            "backend": "redis_streams",
            "connected": True,
            "published_total": self._published_count,
            "deduped_total": self._deduped_count,
            "throughput_events_per_sec": round(self._published_count / elapsed, 2),
            "stream_length": stream_length,
        }

    async def close(self) -> None:
        self._is_closed = True
        if self._client:
            await self._client.aclose()
            self._client = None


class HybridEventBus:
    """Production-grade event bus with automatic fallback from Redis Streams to In-Memory."""

    def __init__(
        self,
        redis_url: str | None = None,
        consumer_groups: list[str] | None = None,
    ) -> None:
        self.redis_url = redis_url
        self.consumer_groups = consumer_groups or DEFAULT_CONSUMER_GROUPS
        self._active_bus: EventBus | None = None
        self._is_redis_active = False

    async def initialize(self) -> EventBus:
        """Attempt connection to Redis Streams; fallback cleanly to InMemoryEventBus if unavailable."""
        if self.redis_url:
            try:
                import redis.asyncio as aioredis

                test_client = aioredis.from_url(
                    self.redis_url,
                    socket_timeout=1.0,
                    socket_connect_timeout=1.0,
                )
                await test_client.ping()
                await test_client.aclose()

                self._active_bus = RedisEventBus(self.redis_url, self.consumer_groups)
                self._is_redis_active = True
                logger.info("Initialized high-throughput Redis Streams EventBus on %s", self.redis_url)
                return self._active_bus
            except Exception as e:
                logger.info(
                    "Redis unavailable (%s); smoothly falling back to In-Memory EventBus",
                    e,
                )

        self._active_bus = InMemoryEventBus(self.consumer_groups)
        self._is_redis_active = False
        logger.info("Initialized in-process In-Memory EventBus")
        return self._active_bus

    @property
    def bus(self) -> EventBus:
        if self._active_bus is None:
            self._active_bus = InMemoryEventBus(self.consumer_groups)
        return self._active_bus

    async def publish(self, event: NormalizedEvent) -> bool:
        try:
            return await self.bus.publish(event)
        except Exception as e:
            if self._is_redis_active:
                logger.warning("Redis publish failed (%s); degrading dynamically to In-Memory bus", e)
                fallback = InMemoryEventBus(self.consumer_groups)
                self._active_bus = fallback
                self._is_redis_active = False
                return await fallback.publish(event)
            return False

    async def subscribe(
        self, consumer_group: str, consumer_name: str
    ) -> AsyncGenerator[NormalizedEvent, None]:
        async for event in self.bus.subscribe(consumer_group, consumer_name):
            yield event

    async def ack(self, consumer_group: str, event_id: str) -> None:
        await self.bus.ack(consumer_group, event_id)

    async def get_metrics(self) -> dict[str, Any]:
        return await self.bus.get_metrics()

    async def close(self) -> None:
        if self._active_bus:
            await self._active_bus.close()
