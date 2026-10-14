"""End-to-End Test Suite for Sentinel Flow Classroom & SOC Demonstration Loop.
Tests sessions, participants, telemetry ingestion, stress burst, detection, and academic benchmarks using FastAPI TestClient.
"""

import time
import pytest
from fastapi.testclient import TestClient
from app.main import app


def test_end_to_end_classroom_flow():
    with TestClient(app) as client:
        # 1. Health and overview
        health_res = client.get("/api/health")
        assert health_res.status_code == 200
        assert health_res.json()["status"] == "ok"

        overview_res = client.get("/api/overview")
        assert overview_res.status_code == 200
        overview = overview_res.json()
        assert "threat_level" in overview

        # 2. Creating fresh demonstration session
        sess_res = client.post("/api/sessions")
        assert sess_res.status_code == 200
        sess = sess_res.json()
        join_code = sess["join_code"]
        assert len(join_code) >= 4

        # 3. Joining 3 classroom participants (Harsha, Maya, Bob)
        p1 = client.post("/api/sessions/join", json={"join_code": join_code, "alias": "Harsha"}).json()
        p2 = client.post("/api/sessions/join", json={"join_code": join_code, "alias": "Maya"}).json()
        p3 = client.post("/api/sessions/join", json={"join_code": join_code, "alias": "Bob"}).json()
        assert p1["alias"] == "Harsha"
        assert p2["alias"] == "Maya"
        assert p3["alias"] == "Bob"

        # 4. Generating normal baseline traffic
        for p in [p1, p2, p3]:
            for action in ["fetch_status", "query_records", "view_profile"]:
                res = client.post("/api/activity", json={
                    "device_id": p["device_id"],
                    "action": action,
                    "is_burst": False,
                    "bytes_in": 128,
                    "bytes_out": 1400
                })
                assert res.status_code == 200

        status = client.get("/api/detection/status").json()
        assert "threat_level" in status

        # 5. Set Bob as controlled stress target
        target_res = client.post("/api/sessions/controlled-target", json={"device_id": p3["device_id"]}).json()
        assert target_res["controlled_target"] == p3["device_id"]

        # 6. Bob executes controlled stress burst
        burst_res = None
        for _ in range(20):
            burst_res = client.post("/api/activity", json={
                "device_id": p3["device_id"],
                "action": "stress_burst",
                "is_burst": True,
                "bytes_in": 2048,
                "bytes_out": 8192
            })
            assert burst_res.status_code == 200

        assert burst_res is not None
        eval_bob = burst_res.json()["assessment"]
        assert "threat_score" in eval_bob or "anomaly_score" in eval_bob
        assert "is_threat" in eval_bob or "state" in eval_bob

        # 7. Recovery phase
        rec_res = client.post("/api/activity", json={
            "device_id": p3["device_id"],
            "action": "dashboard_view",
            "is_burst": False,
            "bytes_in": 100,
            "bytes_out": 1000
        })
        assert rec_res.status_code == 200

        # 8. Verifying Academic Model status and benchmark
        ac_status = client.get("/api/academic-model/status").json()
        assert "algorithm" in ac_status or "ready" in ac_status

        ac_bench = client.get("/api/academic-model/benchmark").json()
        assert "benchmark" in ac_bench
        assert len(ac_bench["benchmark"]) >= 1

        # 9. Verifying telemetry timeseries and history
        ts = client.get("/api/telemetry/timeseries").json()
        assert "timeseries" in ts

        hist = client.get("/api/history").json()
        assert "history" in hist


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
