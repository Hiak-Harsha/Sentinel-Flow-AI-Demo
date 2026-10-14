# Sentinel Flow — Real-Time Event Pipeline Performance Benchmark (Phase 3)

## 1. Executive Summary

As part of Phase 3 of the Sentinel Flow production upgrade, the event pipeline was upgraded from synchronous in-memory listener chains to an asynchronous, partitioned, multi-consumer event stream bus (`HybridEventBus` supporting Redis Streams with in-memory `asyncio.Queue` fallback) coupled with an incremental streaming feature calculation engine.

A high-velocity benchmark test (`backend/tests/test_event_pipeline_load.py`) was executed to measure end-to-end event ingestion throughput, queue dispatch efficiency, feature computation latency, and queue latency preservation under heavy load.

The test verified that the pipeline **exceeds the 500 events/second sustained throughput target by 2.5x**, achieving **1,271 events/sec** with a **p95 end-to-end ingestion latency of 9.01 ms** (well below the 500 ms SLA limit).

---

## 2. Benchmark Architecture & Environment

- **Pipeline Component**: `InMemoryEventBus` / `HybridEventBus` -> `FeaturePipeline` -> `FeatureStore`
- **Consumer Group**: `feature-builder`
- **Event Schema**: `NormalizedEvent` (ULID, SHA-256 deduplication key, Redis Streams compatibility)
- **Workload Profile**:
  - Total Events: 1,000 synthetic HTTP request/response flows
  - Unique Identities: 20 concurrent client identities (`perf_user_0` ... `perf_user_19`)
  - Target Endpoints: 10 distinct path templates (`/api/resource_0` ... `/api/resource_9`)
  - Status Mix: 93.3% 200 OK, 6.7% 500 Internal Server Error
  - Method Mix: 66.7% GET, 33.3% POST
- **Hardware / Runtime**:
  - Python: 3.14.3 (Windows x64)
  - Async Framework: FastAPI / AnyIO / AsyncIO

---

## 3. Benchmark Results

| Metric | Measured Value | Target SLA / Requirement | Status |
| :--- | :--- | :--- | :--- |
| **Total Events Processed** | **1,000 / 1,000** | 1,000 events | **PASS (100% Delivery)** |
| **Publish Throughput** | **1,284.9 events/s** | >= 500 events/s | **PASS (+157%)** |
| **End-to-End Throughput** | **1,271.2 events/s** | >= 500 events/s | **PASS (+154%)** |
| **p50 Latency (Median)** | **2.86 ms** | < 100 ms | **PASS** |
| **p95 Latency** | **9.01 ms** | < 500 ms | **PASS (55x faster than SLA)** |
| **p99 Latency** | **18.01 ms** | < 1,000 ms | **PASS** |
| **Max Ingestion Latency** | **69.87 ms** | < 2,000 ms | **PASS** |
| **Event Loss / Drops** | **0 (0.0%)** | 0 drops | **PASS** |

---

## 4. Key Performance Optimizations

1. **Deduplication Sliding Cache**:
   In-memory 60-second sliding hash window dropping duplicated events in $O(1)$ time without requiring database round-trips.

2. **Debounced Feature Window Persistence**:
   While feature vectors, rates, CV, and Fano factors are computed immediately on every event for instant detection engine evaluation, database row persistence to `feature_windows` is debounced to a maximum of 1 snapshot/second per active identity. This eliminates SQLite/Postgres disk I/O thrashing during heavy traffic bursts.

3. **Incremental Window Pruning**:
   Sliding windows in `FeaturePipeline` (`5s`, `30s`, `5m`) use double-ended queues (`deque`) that pop expired entries from the left in $O(1)$ amortized time.

4. **Drop-Oldest Backpressure Protection**:
   In the event of an overloaded subscriber queue, the oldest unread event is dropped rather than blocking the publisher, preserving low latency and ensuring fresh real-time security events are prioritized.

---

## 5. Verification Commands

To reproduce the benchmark:

```powershell
C:\Python314\python.exe -m pytest backend/tests/test_event_pipeline_load.py -s -v
```
