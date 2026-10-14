# Sentinel Flow — Baseline Audit & Test Verification Report

**Date:** 2026-10-14  
**Branch:** `upgrade/v3`  
**Platform:** Windows (win32)  
**Runtimes:** Python 3.14.3 (pytest 9.1.1), Node.js (Vite 7.3.6, React 19)

---

## 1. Test Execution Baseline

All existing backend tests were executed prior to code refactoring:

```text
pytest backend
============================= test session starts =============================
platform win32 -- Python 3.14.3, pytest-9.1.1, pluggy-1.6.0
rootdir: C:\Users\madha\Desktop\Sentinel-Flow-AI-Demo
plugins: anyio-4.14.1, cov-7.1.0
collected 18 items

backend\test_audit_safety.py ......                                      [ 33%]
backend\test_phase1.py ....                                              [ 55%]
backend\test_suite.py .                                                  [ 61%]
backend\test_v2_backend.py .......                                       [100%]

============================= 18 passed in 16.69s =============================
```

### Test Breakdown
- `backend/test_audit_safety.py` (6 passed):
  - `test_tamper_evidence_chain`
  - `test_emergency_stop_kills_active_run`
  - `test_unauthorized_target_rejected`
  - `test_quota_exhaustion_halts_attack`
  - `test_lab_target_synthetic_traffic_isolation`
  - `test_consent_gate_enforcement`
- `backend/test_phase1.py` (4 passed):
  - `test_allowlist`
  - `test_traffic_logger`
  - `test_reverse_proxy_and_bridge`
  - `test_webhook_receiver`
- `backend/test_suite.py` (1 passed):
  - `test_end_to_end_classroom_flow` (Session lifecycle, multi-participant join, telemetry, bursts, detection query)
- `backend/test_v2_backend.py` (7 passed):
  - `test_overview_endpoint`
  - `test_device_inventory`
  - `test_feature_pipeline_ingest`
  - `test_rule_correlator_matches`
  - `test_score_fusion_outputs`
  - `test_model_metadata_endpoint`
  - `test_websocket_stream_endpoint`

**Summary:** 18/18 passed. 0 failures.

---

## 2. Frontend Build Baseline

Frontend production build executed with `npm run build`:

```text
vite v7.3.6 building client environment for production...
transforming...
✓ 461 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.56 kB │ gzip:   0.34 kB
dist/assets/index-CwsJTodC.css   89.21 kB │ gzip:  13.74 kB
dist/assets/index-C1VdoDGB.js   568.61 kB │ gzip: 163.41 kB
✓ built in 4.71s
```

**Status:** Build succeeded.  
**Notes:** Bundle size warning on `index-C1VdoDGB.js` (>500 kB). Code splitting, dynamic imports, and component modularization are identified for future phases.

---

## 3. Key Findings & Baseline Audit Items

1. **Frontend ↔ Backend Protocol:**
   - Backend `run_manager` broadcasts events (`attack_progress`, `attack_effect`, `attack_finished`, `emergency_stop`, `emergency_stop_reset`) that need structured handling in the frontend.
   - Polling loops exists alongside WebSocket connections. Future phases will transition to event push with reconnect resume.
2. **Persistence:**
   - Core domain state currently relies on in-memory collections alongside SQLite tables. Phase 2 introduces full DB-backed schemas.
3. **ML Features & Ground Truth:**
   - Supervised model relies on UNSW-NB15 flow features; Phase 4 will align runtime features directly with observable HTTP/telemetry patterns and establish rigorous evaluation artifacts.
4. **Safety Invariants:**
   - Strict loopback/RFC1918 allowlist, consent gate, emergency stop persistence, and hash-chained evidence log are passing and locked in test invariants.
