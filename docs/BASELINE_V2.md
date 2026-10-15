# Sentinel Flow v2 — Baseline Audit & Measurements

**Date:** October 15, 2026  
**Branch:** `v2/roles-and-redesign`  
**Commit:** Baseline commit `3ee8bf8`  
**Environment:** Windows (PowerShell), Python 3.14.3, Node.js v22.14.0, Vite 6.2.0, Tailwind CSS 4

---

## 1. Executive Summary

Sentinel Flow currently provides strong real-time behavioral detection, MITRE ATT&CK mapping, and hybrid ML classification (Isolation Forest + XGBoost / Random Forest) in `detection/rule_correlator.py`. The rule correlator correctly evaluates behavioral features (failed authentications, distinct ports, canary signatures, entropy, request rates) without leaking ground-truth run IDs or identity names.

However, the application currently fails the core product objective:
- **Expected Objective:** Classroom cyber-defense exercise where **participants perform bounded intrusions** against an authorized lab target under their authenticated identities, and the **operator console strictly detects them** and **never launches attacks**.
- **Current Reality:** The orchestrator routes (`/api/orchestrator/run`) are gated with `verify_operator_access()`, which blocks participants (HTTP 403) while allowing the operator or any loopback client to launch synthetic attacks. Attack drivers hardcode bot identities (`attacker_bot_*`, `dos_agent_*`, etc.), disconnecting participant devices from detections.

Furthermore, the current UI uses a generic navy/cyan/indigo gradient and glass-morphism aesthetic (`#0b0f19` / `#0c1626` backgrounds, `from-cyan-400 to-indigo-500` buttons, `backdrop-blur`, uppercase monospace everywhere). This must be systematically redesigned to match the graphite-and-amber instrument panel style established in the BharatSR reference screenshots.

---

## 2. Test & Build Baseline Results

### 2.1 Backend Pytest Suite
- **Command:** `pytest backend/tests`
- **Collected Items:** 77 tests across 15 test modules
- **Result:** **77 passed** in 139.94s (0:02:19)
- **Breakdown:**
  - `backend/tests/test_api_contract.py`: 3 passed
  - `backend/tests/test_audit_safety.py`: 6 passed
  - `backend/tests/test_detection_fusion.py`: 5 passed
  - `backend/tests/test_drivers_and_observability_coverage.py`: 7 passed
  - `backend/tests/test_event_pipeline.py`: 9 passed
  - `backend/tests/test_event_pipeline_load.py`: 1 passed
  - `backend/tests/test_feature_properties.py`: 4 passed (Hypothesis property-based tests)
  - `backend/tests/test_model_verification.py`: 6 passed
  - `backend/tests/test_persistence_restart.py`: 1 passed
  - `backend/tests/test_phase1.py`: 4 passed
  - `backend/tests/test_rbac_and_token_rotation.py`: 11 passed
  - `backend/tests/test_safety_invariants.py`: 5 passed
  - `backend/tests/test_suite.py`: 1 passed
  - `backend/tests/test_v2_backend.py`: 7 passed
  - `backend/tests/test_ws_protocol.py`: 7 passed


### 2.3 Role Matrix Failing-First Test Suite (`backend/tests/test_role_matrix.py`)
- **Command:** `pytest backend/tests/test_role_matrix.py -v`
- **Result:** **7 failed, 1 passed** in 20.46s (exited with code 1, exactly as required for Phase 0)
- **Detailed Assertions:**
  - `test_detector_has_no_dependency_on_run_registry`: **PASSED** (detector isolation invariant intact)
  - `test_participant_can_launch_scenario_when_exercise_open`: **FAILED** (returns 404; `/api/v1/red/runs` not implemented)
  - `test_participant_cannot_launch_attacks_when_phase_locked`: **FAILED** (returns 404 instead of 423 Locked)
  - `test_operator_forbidden_from_launching_participant_attacks`: **FAILED** (returns 404 instead of 403 Forbidden)
  - `test_operator_cannot_launch_attacks_via_orchestrator`: **FAILED** (returns 200 OK; operator currently allowed to launch attacks)
  - `test_loopback_client_without_operator_token_is_rejected`: **FAILED** (returns 200 OK; loopback bypass currently active in `verify_operator_access`)
  - `test_client_supplied_identity_header_spoofing_prevented`: **FAILED** (returns 404 instead of 401 Unauthorized)
  - `test_participant_cannot_read_other_participant_runs`: **FAILED** (returns 404 instead of 403 Forbidden)


---

## 3. Findings & Architectural Audit

| # | Component | Current Code Observation | Target v2 Requirement | Severity |
|---|---|---|---|---|
| **1** | `orchestrator/routes.py` | `verify_operator_access()` permits only tokens with role `operator` or loopback IP (`127.0.0.1`, `::1`). Non-loopback participant tokens receive **HTTP 403**. | Participants must be able to launch scenarios under `/api/v1/red/runs` when authenticated and exercise is open. | **Critical** |
| **2** | `verify_operator_access` | Loopback client bypass: any client from `127.0.0.1` automatically passes operator check with no token validation. | Remove loopback bypass completely. Tokens must be cryptographically validated regardless of IP. | **High** |
| **3** | `orchestrator/*_driver.py` | Hardcoded identities: `attacker_bot_<run>`, `dos_agent_<run>`, `scraper_bot_<run>`, `canary_runner_<run>`, `port_scanner_<run>`. | Refactor drivers to accept participant's `actor_identity_id` and server-minted run token. Attribution must point to participant. | **Critical** |
| **4** | `ParticipantPage.tsx` | Participant UI only offers normal traffic action and a fixed 25-request burst. No red-team tools (login attack, path probe, canary probe, port sensor). | Guided workflow step cards (`STEP 01` - `04`) + manual red-team tools through instrumented proxy. | **High** |
| **5** | `run_manager.py` | Single active run per target globally (`RUNNING` check rejects concurrent runs). 60 participants queue up. | Replace global target lock with 1 active run per participant, global concurrency cap (default 8), quota (5 runs / 50 effects). | **High** |
| **6** | `proxy/reverse_proxy.py` | Resolves identity from unverified `X-Sentinel-Identity` and `X-Participant-Device` headers when no token present. | Strip unvalidated identity headers. Forward only HMAC-signed internal header `X-Sentinel-Actor` to lab target. | **High** |
| **7** | `App.tsx` & Navigation | Operator navigation includes "Attack Console" (`/attack-console`). Operator can launch attack simulations against lab target. | Remove attack launching from operator navigation and UI. Operator console is strictly blue-team defensive. | **Critical** |
| **8** | `session_service.py` | Session phases modeled as `WAITING_FOR_USERS → BASELINE_COLLECTION → CONTROLLED_TEST_ACTIVE / NORMAL_MONITORING`. | Replace with explicit state machine: `LOBBY → BASELINE → EXERCISE_OPEN → DEBRIEF → CLOSED`. Attack runs locked (`423`) unless `EXERCISE_OPEN`. | **High** |

---

## 4. Visual Baseline & Style Measurement

### 4.1 Measured Baseline Palette (Before Redesign)
- **Background:** Obsidian/Navy `#0b0f19` and `#0c1626`
- **Surfaces/Cards:** `#111827`, `#1f2937` with translucent borders (`rgba(30, 58, 138, 0.3)`)
- **Primary Buttons/Accents:** Cyan-to-indigo gradient (`from-cyan-400 to-indigo-500` / `#00f2fe` to `#4facfe`)
- **Status Badges:** Bright neon cyan, emerald green glowing dots, deep crimson maroon cards
- **Typography:** Heavy use of uppercase monospace for body labels, rounded-2xl radii, backdrop blur filters

### 4.2 Target Visual Reference (BharatSR Style)
- **Graphite Surfaces:**
  - Page Background: `#090c10` (also `#090a0d`, `#0a0d11`)
  - Standard Cards: `#0f1013`
  - Raised Panels / Inputs: `#111417`
  - Hover / Headers: `#16181c`
  - Borders: `rgba(255, 255, 255, 0.07)` hairline
- **Warm Amber Brand:**
  - Primary text accent: `#ffb454`
  - Primary button / active state: `#fe9a00`
  - Active nav fill / wash: `#2d1f0b` (dark amber tint with 3px left bar)
  - Text on amber button: `#1a1203`
- **Typography:**
  - Display: Space Grotesk (500/600/700) with tight letter-spacing
  - Monospace: JetBrains Mono for eyebrows, KPI labels, metrics, timestamps, IDs
  - Body: Inter / sans-serif (14–15px)

### 4.3 Visual Baseline Artifacts (Screenshots)
Baseline screenshots captured and persisted in artifact store:
- Landing Page (`/`): `baseline_landing_1792074846678.png`
- Participant Join (`/join`): `baseline_participant_1792074858265.png`
- Operator Overview (`/overview`): `baseline_operator_overview_1792074872070.png`
- Alerts & Incidents (`/alerts`): `baseline_alerts_1792074888063.png`
- Attack Console (`/attack-console`): `baseline_attack_console_1792074902298.png`
- Model Registry (`/models`): `baseline_models_1792074916579.png`

---

## 5. Baseline Conclusion

The backend pipeline, feature extraction, ML classifiers, and hash-chained audit logging are functional and pass all 77 tests. The codebase is well-prepared for Phase 1 (identity, roles, authorization) and Phase 2 (participant attack engine), followed by the complete Phase 5/6 design system migration to the graphite-and-amber instrument panel.
