"""Property-based tests for streaming feature calculation and invariants using Hypothesis."""

from __future__ import annotations

import math
from hypothesis import given, settings, strategies as st

from app.pipeline.feature_pipeline import _calculate_entropy, FeaturePipeline
from app.pipeline.event_bus import DeduplicationCache
from app.proxy.traffic_logger import TrafficLogger, TrafficRecord


# Invariant 1: Shannon Entropy Bounds and Properties
@given(st.lists(st.text(min_size=1, max_size=50), min_size=0, max_size=100))
@settings(max_examples=100, deadline=None)
def test_entropy_properties_always_bounded(paths: list[str]) -> None:
    """Shannon entropy must be finite, non-negative, and bounded by log2(N)."""
    entropy = _calculate_entropy(paths)

    assert not math.isnan(entropy), "Entropy must never be NaN"
    assert not math.isinf(entropy), "Entropy must never be infinite"
    assert entropy >= 0.0, f"Entropy must be non-negative, got {entropy}"

    if not paths:
        assert entropy == 0.0, "Entropy of empty list must be 0"
    elif len(set(paths)) == 1:
        assert entropy == 0.0, "Entropy of uniform identical paths must be 0"
    else:
        max_possible_entropy = math.log2(len(paths)) + 1e-4
        assert entropy <= max_possible_entropy, f"Entropy {entropy} exceeds theoretical maximum {max_possible_entropy}"


# Invariant 2: Deduplication Cache Idempotency Invariants
@given(st.text(min_size=1, max_size=64))
@settings(max_examples=100, deadline=None)
def test_deduplication_cache_properties(key: str) -> None:
    """Deduplication cache must never flag first occurrence as duplicate, and always flag immediate second."""
    cache = DeduplicationCache(ttl_seconds=30.0)

    # First check: not duplicate
    assert cache.is_duplicate(key) is False, f"First occurrence of {key} must not be flagged duplicate"

    # Second check: is duplicate
    assert cache.is_duplicate(key) is True, f"Second occurrence of {key} must be flagged duplicate"


# Invariant 3: Streaming Feature Vector Mathematical Bounds
@given(
    records=st.lists(
        st.fixed_dictionaries({
            "status_code": st.sampled_from([200, 201, 204, 301, 400, 401, 403, 404, 500, 502]),
            "method": st.sampled_from(["GET", "POST", "PUT", "DELETE", "PATCH"]),
            "path": st.sampled_from(["/api/v1/auth", "/api/v1/health", "/api/v1/users", "/login", "/search"]),
            "request_size": st.integers(min_value=0, max_value=1_000_000),
            "response_size": st.integers(min_value=0, max_value=1_000_000),
            "latency_ms": st.floats(min_value=0.1, max_value=5000.0, allow_nan=False),
            "time_delta": st.floats(min_value=0.01, max_value=2.0, allow_nan=False),
        }),
        min_size=1,
        max_size=30,
    )
)
@settings(max_examples=50, deadline=None)
def test_feature_pipeline_invariants_bounded(records: list[dict]) -> None:
    """Computed streaming features must adhere to strictly bounded mathematical domains."""
    t_logger = TrafficLogger()
    pipeline = FeaturePipeline(traffic_logger=t_logger)

    base_time = 1700000000.0
    current_time = base_time
    identity = "hyp_test_identity"

    for r in records:
        current_time += r["time_delta"]
        rec = TrafficRecord(
            identity_id=identity,
            timestamp_epoch=current_time,
            timestamp_iso="2026-10-15T00:00:00Z",
            method=r["method"],
            path=r["path"],
            query_string="",
            status_code=r["status_code"],
            request_size_bytes=r["request_size"],
            response_size_bytes=r["response_size"],
            latency_ms=r["latency_ms"],
            fingerprint_hash="hyp_fp",
            user_agent="HypothesisTester/1.0",
        )
        pipeline.on_traffic_record(rec)
        vec = pipeline.compute_features_for_identity(identity, now=current_time)

        # Invariant: rates must be non-negative
        assert vec.request_rate_5s >= 0.0
        assert vec.request_rate_30s >= 0.0
        assert vec.byte_volume_in_5s >= 0
        assert vec.byte_volume_out_5s >= 0

        # Invariant: ratios must be strictly within [0.0, 1.0]
        assert 0.0 <= vec.error_ratio_30s <= 1.0
        assert 0.0 <= vec.error_ratio_5m <= 1.0

        # Invariant: interval statistics must be non-negative
        assert vec.inter_request_interval_mean_30s >= 0.0
        assert vec.inter_request_interval_std_30s >= 0.0

        # Invariant: entropy must be non-negative
        assert vec.endpoint_entropy_30s >= 0.0
        assert vec.endpoint_entropy_5m >= 0.0


# Invariant 4: Evidence Ledger Tampering Detection Guarantee
@given(
    events=st.lists(
        st.fixed_dictionaries({
            "event_type": st.sampled_from(["login", "scenario_start", "alert_raised", "token_refresh"]),
            "target": st.sampled_from(["auth_service", "target_system", "evidence_ledger"]),
        }),
        min_size=3,
        max_size=10,
    ),
    corrupt_idx=st.integers(min_value=0, max_value=8),
)
@settings(max_examples=30, deadline=None)
def test_hash_chain_corruption_detection(events: list[dict], corrupt_idx: int) -> None:
    """Any single bit mutation in the chain breaks verify_chain_integrity at or before the corruption."""
    import tempfile
    from pathlib import Path
    from app.database import EventStore

    tmp_dir = tempfile.mkdtemp()
    try:
        db_path = Path(tmp_dir) / "prop_ledger.db"
        store = EventStore(db_path)

        for ev in events:
            store.record_event(
                event_type=ev["event_type"],
                source="hypothesis_tester",
                target_service=ev["target"],
            )

        # Integrity passes initially
        status = store.verify_chain_integrity()
        assert status["valid"] is True, f"Initial chain must be valid: {status.get('reason')}"

        # Tamper with an event in the chain
        actual_corrupt_idx = corrupt_idx % len(events)
        with store._connect() as conn:
            rows = conn.execute("SELECT id, prev_hash FROM evidence_events ORDER BY rowid ASC").fetchall()
            target_id = rows[actual_corrupt_idx]["id"]
            orig_hash = rows[actual_corrupt_idx]["prev_hash"]
            corrupt_hash = orig_hash[:-1] + ("0" if orig_hash[-1] != "0" else "1")
            conn.execute("UPDATE evidence_events SET prev_hash = ? WHERE id = ?", (corrupt_hash, target_id))
            conn.commit()

        # Integrity must now fail
        tampered_status = store.verify_chain_integrity()
        assert tampered_status["valid"] is False, "Tampered chain must be detected as invalid"
    finally:
        import shutil
        shutil.rmtree(tmp_dir, ignore_errors=True)
