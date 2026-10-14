"""Unit and integration tests for Phase 4: Model Verification & Detection Modernization."""

from __future__ import annotations

import json
from pathlib import Path
import pytest
from httpx import ASGITransport, AsyncClient

from app.config import ARTIFACT_DIR
from app.detection.engine import DetectionEngine
from app.detection.supervised_model import SupervisedClassifier
from app.feature_schema import FEATURE_SCHEMA_VERSION, LIVE_FEATURE_NAMES
from app.main import app
from app.ml.registry import ModelRegistry
from app.pipeline.feature_store import IdentityFeatureVector
from scripts.collect_lab_dataset import LabDatasetCollector


# ---------------------------------------------------------------------------
# 1. Lab Dataset Generator & Schema Alignment
# ---------------------------------------------------------------------------


def test_lab_dataset_collector_schema_and_labels():
    """Verify lab dataset collector produces genuine schema v2.0.0 features with ground truth."""
    collector = LabDatasetCollector(seed=123)
    # Collect small batch (6 runs, 1 of each scenario)
    df = collector.collect(num_runs=6)

    assert len(df) > 30
    assert set(df["is_attack"].unique()).issubset({0, 1})
    assert df["run_id"].nunique() == 6
    assert (df["feature_schema_version"] == FEATURE_SCHEMA_VERSION).all()

    # All 35 live features must be present with no NaNs
    for feat in LIVE_FEATURE_NAMES:
        assert feat in df.columns
        assert not df[feat].isna().any()

    # Scenario distributions
    scenarios = set(df["scenario_name"].unique())
    assert "benign_browsing" in scenarios
    assert "credential_stuffing" in scenarios
    assert "endpoint_scan" in scenarios


# ---------------------------------------------------------------------------
# 2. Evaluation Artifacts and Calibration Verification
# ---------------------------------------------------------------------------


def test_evaluation_artifacts_integrity():
    """Verify production evaluation artifacts contain genuine computed metrics, CIs, and ECE."""
    eval_path = ARTIFACT_DIR / "evaluation.json"
    comp_path = ARTIFACT_DIR / "model_comparison.json"
    meta_path = ARTIFACT_DIR / "model_metadata.json"
    model_path = ARTIFACT_DIR / "production_model.joblib"

    assert eval_path.exists(), "evaluation.json must exist"
    assert comp_path.exists(), "model_comparison.json must exist"
    assert meta_path.exists(), "model_metadata.json must exist"
    assert model_path.exists(), "production_model.joblib must exist"

    eval_data = json.loads(eval_path.read_text(encoding="utf-8"))
    metrics = eval_data["metrics"]

    # Verify metrics ranges
    assert 0.0 <= metrics["brier_score"] <= 0.1
    assert 0.0 <= metrics["ece"] <= 0.1
    assert 0.80 <= metrics["roc_auc"] <= 1.0
    assert 0.80 <= metrics["pr_auc"] <= 1.0
    assert 0.0 < metrics["operating_threshold_1pct_fpr"] < 1.0

    # Verify 95% Bootstrap Confidence Intervals exist
    ci = eval_data["confidence_intervals_95"]
    assert "roc_auc" in ci
    assert "pr_auc" in ci
    assert "f1" in ci
    assert ci["roc_auc"]["lower_95"] <= ci["roc_auc"]["upper_95"]

    # Verify unseen attack generalization holdout is recorded
    unseen = eval_data["unseen_attack_generalization"]
    assert "held_out_scenarios" in unseen
    assert len(unseen["held_out_scenarios"]) > 0

    # Verify model comparison table has multiple candidate algorithms
    comp_data = json.loads(comp_path.read_text(encoding="utf-8"))
    assert len(comp_data) >= 3
    algo_names = [c["algorithm"] for c in comp_data]
    assert any("RandomForest" in a for a in algo_names)
    assert any("IsolationForest" in a for a in algo_names)


# ---------------------------------------------------------------------------
# 3. Live Supervised Classifier (Elimination of map_features Skew)
# ---------------------------------------------------------------------------


def test_supervised_classifier_live_inference():
    """Verify SupervisedClassifier scores IdentityFeatureVector directly without map_features."""
    clf = SupervisedClassifier()
    assert clf.is_ready is True

    # Normal benign vector
    benign_vec = IdentityFeatureVector(
        identity_id="test_benign_user",
        timestamp_epoch=1770000000.0,
        timestamp_iso="2026-10-15T00:00:00Z",
        request_rate_5s=0.5,
        request_rate_30s=0.3,
        request_count_5s=2,
        request_count_30s=8,
        status_2xx_count_30s=8,
        method_get_ratio_30s=1.0,
        unique_path_count_30s=3,
        byte_volume_in_30s=1200,
        byte_volume_out_30s=4500,
        endpoint_entropy_30s=0.4,
        error_ratio_30s=0.0,
        inter_request_interval_mean_30s=2400.0,
        auth_failures_30s=0,
    )
    benign_res = clf.predict_vector(benign_vec)

    assert benign_res["available"] is True
    assert benign_res["label"] == 0
    assert benign_res["attack_probability"] < 0.40
    assert benign_res["calibrated"] is True
    assert benign_res["conformal_status"] == "NORMAL"
    assert "latency_ms" in benign_res
    assert benign_res["latency_ms"] >= 0.0

    # Obvious attack vector (credential stuffing / brute force pattern)
    attack_vec = IdentityFeatureVector(
        identity_id="test_attacker",
        timestamp_epoch=1770000000.0,
        timestamp_iso="2026-10-15T00:00:00Z",
        request_rate_5s=18.0,
        request_rate_30s=14.0,
        request_count_30s=420,
        byte_volume_in_30s=45000,
        byte_volume_out_30s=12000,
        endpoint_entropy_30s=0.1,
        error_ratio_30s=0.95,
        inter_request_interval_mean_30s=65.0,
        auth_failures_30s=380,
        unique_path_count_30s=1,
        status_4xx_count_30s=380,
    )
    attack_res = clf.predict_vector(attack_vec)

    assert attack_res["available"] is True
    assert attack_res["label"] == 1
    assert attack_res["attack_probability"] >= 0.50
    assert len(attack_res["explanation"]) > 0
    # Top contributor should identify auth failures or elevated error ratio
    exp_features = [exp["feature"] for exp in attack_res["explanation"]]
    assert any("auth" in f or "error" in f or "rate" in f for f in exp_features)


# ---------------------------------------------------------------------------
# 4. Model Registry & Shadow Mode Evaluation
# ---------------------------------------------------------------------------


def test_model_registry_and_shadow_mode():
    """Verify ModelRegistry registers candidate, executes shadow scoring, and logs agreement."""
    registry = ModelRegistry(ARTIFACT_DIR)
    active = registry.get_active_model_details()
    assert active["name"] == "sentinel-live-classifier"
    assert active["version"] == "2.0.0"
    assert active["stage"] == "production"

    # Register candidate model in shadow mode
    shadow_bundle = dict(registry.production_bundle)
    registry.register_shadow_candidate(shadow_bundle, name="sentinel-candidate-rf", version="2.1.0-rc1")

    status = registry.get_shadow_status()
    assert status["enabled"] is True
    assert status["shadow_model_name"] == "sentinel-candidate-rf"

    # Evaluate shadow scoring
    clf = SupervisedClassifier()
    clf.set_registry(registry)

    vec = IdentityFeatureVector(
        identity_id="shadow_probe",
        timestamp_epoch=1770000000.0,
        timestamp_iso="2026-10-15T00:00:00Z",
        request_rate_5s=1.2,
    )
    res = clf.predict_vector(vec)

    assert "shadow_evaluation" in res
    assert res["shadow_evaluation"] is not None
    assert res["shadow_evaluation"]["agrees_with_production"] is True

    updated_status = registry.get_shadow_status()
    assert updated_status["evaluated_count"] >= 1
    assert updated_status["agreement_rate"] == 1.0


# ---------------------------------------------------------------------------
# 5. REST API v1 Model Endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_v1_models_routes():
    """Verify REST API v1 routes for models registry, benchmark, and prediction."""
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. GET /api/v1/models
            resp = await client.get("/api/v1/models")
            assert resp.status_code == 200
            models = resp.json()
            assert len(models) >= 1
            assert models[0]["name"] == "sentinel-live-classifier"

            # 2. GET /api/v1/models/active
            resp_act = await client.get("/api/v1/models/active")
            assert resp_act.status_code == 200
            active_data = resp_act.json()
            assert active_data["version"] == "2.0.0"
            assert active_data["stage"] == "production"
            assert "metrics" in active_data
            assert "top_features" in active_data

            # 3. GET /api/v1/models/benchmark
            resp_bm = await client.get("/api/v1/models/benchmark")
            assert resp_bm.status_code == 200
            bm_data = resp_bm.json()
            assert "candidate_comparison" in bm_data
            assert len(bm_data["candidate_comparison"]) >= 2

            # 4. GET /api/v1/models/shadow/status
            resp_shad = await client.get("/api/v1/models/shadow/status")
            assert resp_shad.status_code == 200

            # 5. POST /api/v1/models/predict
            pred_payload = {
                "features": {
                    "request_rate_5s": 15.0,
                    "request_rate_30s": 12.0,
                    "auth_failures_30s": 45,
                    "error_ratio_30s": 0.85,
                }
            }
            resp_pred = await client.post("/api/v1/models/predict", json=pred_payload)
            assert resp_pred.status_code == 200
            pdata = resp_pred.json()
            assert pdata["label"] in ("ATTACK", "NORMAL")
            assert 0.0 <= pdata["attack_probability"] <= 1.0
            assert pdata["confidence"] > 0.0

            # 6. POST /api/v1/models/{model_id}/promote
            resp_promo = await client.post(
                "/api/v1/models/sentinel-candidate-rf/promote",
                json={"stage": "staging", "notes": "Automated verification test promotion"},
            )
            assert resp_promo.status_code == 200
            assert resp_promo.json()["status"] == "promoted"


# ---------------------------------------------------------------------------
# 6. Backward Compatibility for Academic Model Endpoints
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_academic_model_backward_compatibility():
    """Verify legacy academic model routes remain functioning for existing dashboard views."""
    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            resp = await client.get("/api/academic-model/status")
            assert resp.status_code == 200
            data = resp.json()
            assert data["ready"] is True
            assert "metrics" in data
            assert "features" in data

            resp_bm = await client.get("/api/academic-model/benchmark")
            assert resp_bm.status_code == 200
            assert "benchmark" in resp_bm.json()
