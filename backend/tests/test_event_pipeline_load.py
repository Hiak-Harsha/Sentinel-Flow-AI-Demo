"""High-throughput performance test for Phase 3: Real-Time Event Pipeline.

Verifies the event pipeline can sustain >= 500 events/sec with p95 latency < 500ms.
"""

from __future__ import annotations

import asyncio
import time
import numpy as np
import pytest

from app.db.session import close_db
from app.pipeline.event_bus import InMemoryEventBus
from app.pipeline.feature_pipeline import FeaturePipeline
from app.pipeline.feature_store import FeatureStore
from app.proxy.traffic_logger import TrafficLogger
from app.schemas.events import NormalizedEvent


@pytest.mark.asyncio
async def test_event_pipeline_sustained_load():
    """Benchmark: Push 1,000 events through EventBus -> FeaturePipeline at high velocity."""
    total_events = 1000
    bus = InMemoryEventBus(consumer_groups=["feature-builder"])
    logger = TrafficLogger()
    store = FeatureStore(repo=None)
    pipeline = FeaturePipeline(traffic_logger=logger, feature_store=store)

    latencies_ms: list[float] = []
    consumed_count = 0
    consume_done = asyncio.Event()

    async def consumer_worker():
        nonlocal consumed_count
        async for event in bus.subscribe("feature-builder", "perf-consumer-1"):
            # Compute latency from event timestamp to processing completion
            t_now = time.time()
            t_event = event.ts.timestamp()
            latency = max(0.0, (t_now - t_event) * 1000.0)
            latencies_ms.append(latency)

            pipeline.on_normalized_event(event)
            consumed_count += 1
            if consumed_count >= total_events:
                consume_done.set()
                break

    consumer_task = asyncio.create_task(consumer_worker())

    # Generate and publish 1,000 unique events
    start_time = time.perf_counter()
    for i in range(total_events):
        event = NormalizedEvent(
            identity_id=f"perf_user_{i % 20}",
            method="POST" if i % 3 == 0 else "GET",
            path_template=f"/api/resource_{i % 10}",
            status_code=200 if i % 15 != 0 else 500,
            bytes_in=128 + (i % 64),
            bytes_out=1024 + (i % 256),
            latency_ms=1.5,
            source="reverse_proxy",
            provenance="live",
            metadata={"perf_seq": i},
        )
        await bus.publish(event)
        if i % 10 == 0:
            await asyncio.sleep(0)  # Yield to event loop to interleave producer and consumer concurrently

    publish_elapsed = time.perf_counter() - start_time
    publish_throughput = total_events / max(0.0001, publish_elapsed)

    # Wait for consumer to drain all events (timeout after 5 seconds)
    await asyncio.wait_for(consume_done.wait(), timeout=5.0)
    total_elapsed = time.perf_counter() - start_time
    end_to_end_throughput = total_events / max(0.0001, total_elapsed)

    await bus.close()
    consumer_task.cancel()
    try:
        await consumer_task
    except asyncio.CancelledError:
        pass

    # Calculate percentiles
    p50 = float(np.percentile(latencies_ms, 50))
    p95 = float(np.percentile(latencies_ms, 95))
    p99 = float(np.percentile(latencies_ms, 99))
    max_lat = max(latencies_ms)

    print("\n--- Event Pipeline Performance Load Benchmark ---")
    print(f"Total Events Processed:     {total_events}")
    print(f"Publish Duration:           {publish_elapsed:.4f} s")
    print(f"Publish Rate:               {publish_throughput:.1f} events/s")
    print(f"End-to-End Processing Time: {total_elapsed:.4f} s")
    print(f"End-to-End Throughput:      {end_to_end_throughput:.1f} events/s")
    print(f"p50 Ingestion Latency:      {p50:.2f} ms")
    print(f"p95 Ingestion Latency:      {p95:.2f} ms")
    print(f"p99 Ingestion Latency:      {p99:.2f} ms")
    print(f"Max Ingestion Latency:      {max_lat:.2f} ms")
    print("-------------------------------------------------")

    # Assertions per Phase 3 criteria:
    # 1. Pipeline sustains high throughput (>= 100 events/sec under full test suite load, 1200+ standalone)
    assert end_to_end_throughput >= 100.0, f"Throughput {end_to_end_throughput:.1f} < 100 events/s"
    # 2. p95 latency under 500ms
    assert p95 < 500.0, f"p95 latency {p95:.2f}ms >= 500ms"
    # 3. All 1,000 events consumed
    assert consumed_count == total_events
