# Sentinel Flow v2 — Classroom & SOC Operations Runbook

**Document Version:** 2.0.0  
**Target Roles:** Exercise Instructors, SOC Lead Operators, Lab Administrators  
**Audience:** Defensive Cybersecurity Training, Live Threat Demonstrations  

---

## 1. Quick Start & Pre-Flight Checklist

Before launching a classroom exercise, verify the following services are healthy:

### 1.1 Service Startup
```bash
# 1. Backend Server (FastAPI on Port 8000)
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000

# 2. Frontend Development Server (Vite on Port 5173)
npm run dev
```

### 1.2 Health Check Verification
```bash
# Verify API Health & Threat Engine Status
curl -s http://127.0.0.1:8000/api/health
# Response: {"status":"healthy","uptime_seconds":...}

# Verify OpenAPI Schema & Realtime WebSocket
curl -s http://127.0.0.1:8000/api/v1/metrics | grep sentinel_events_total
```

---

## 2. Instructor Operations: Session Creation & Phase Control

As an Instructor / Lead Operator, all exercise orchestration is managed through the **Settings & Classroom Session Controls** (`/settings`):

### 2.1 Creating a New Exercise Session
1. Navigate to `http://localhost:5173/settings`.
2. Locate the **Classroom Session Controls** panel.
3. Click **"Create New Session"**.
4. The system generates an authoritative 6-character room code (e.g. `SF-3WPT`).
5. Share this room code with students via projector or chat.

### 2.2 Phase Progression
Exercises proceed through a 4-stage lifecycle:

| Phase | System Posture | Student Capabilities | Operator Tasks |
| :--- | :--- | :--- | :--- |
| **`LOBBY`** | Attack tools locked | Students connect with alias & room code | Confirm all students appear on the Operator Overview grid |
| **`WARMUP`** | Baseline profiling | Normal catalog browsing only | Observe streaming feature EWMA convergence on the baseline chart |
| **`EXERCISE_OPEN`** | Active Cyber Window | Bounded scenario execution within quotas | Triage alerts, observe calibrated ML inferences, and monitor SLA timers |
| **`DEBRIEF`** | Simulation halted | Attack tools locked; scorecards unlocked | Review detection scorecards, false positive rates, and model Brier score |

Click **"Advance Phase"** in the top navigation banner or the Classroom Controls panel to progress through each stage.

---

## 3. Student Workflow: Red Team Participant Arena

Students participate in the exercise as authenticated Red Team actors:

### 3.1 Joining the Exercise
1. Open the landing page (`http://localhost:5173`) and click **"Join Exercise as Red Team"** or navigate directly to `/participant`.
2. Enter the **Classroom Room Code** (e.g. `SF-3WPT`) and a **Participant Alias** (e.g. `pt_alex_01`).
3. Click **"Join Exercise"**.
4. The browser stores a scoped session token and unlocks the **Participant Arena**.

### 3.2 Executing Bounded Attack Scenarios
1. Select a pre-configured MITRE ATT&CK scenario from the catalog:
   - **Burst DoS (`T1499`):** Volumetric request burst on target endpoints.
   - **Credential Stuffing (`T1110`):** High-frequency dictionary authentication attempts.
   - **Directory Traversal (`T1059`):** Path traversal probes against sensitive files.
   - **SQL Injection Probe (`T1071`):** Union-based and error-based injection probes.
   - **Canary Probe (`T1046`):** Hits a known honeytoken path to verify tripping mechanisms.
2. Confirm the target endpoint defaults to the authorized disposable lab target (`http://127.0.0.1:8000/lab-target`).
3. Click **"Launch Scenario"**.
4. Monitor the live execution terminal:
   - Watch the 5-second countdown timer.
   - Observe request-by-request HTTP status codes (e.g. `200`, `401`, `403`).
   - Confirm quota counter decrements (e.g. `19/20 remaining`).

---

## 4. SOC Operator Workflow: Strictly Defensive Supervision

The Operator Mission Console (`/overview`) and Alerts Workbench (`/alerts`) are **strictly defensive** (operators cannot trigger or launch attacks):

### 4.1 Real-Time Ingestion & Threat Radar (`/overview`)
- **Ingestion Throughput (req/s):** Displays live volume compared against the adaptive baseline SLA envelope.
- **Active Incidents Counter:** Aggregates unresolved security alerts.
- **Pipeline Latency (P95):** Monitors sliding-window feature calculation latency ($< 10\text{ms}$ SLA).
- **Calibrated Brier Score:** Gauges live supervised model probability calibration ($\le 0.05$ target).
- **Active Threat Radar:** Visualizes detected actors by severity and MITRE technique.

### 4.2 Triaging Incidents (`/alerts`)
1. Click any alert in the table to open the **Incident Detail Drawer**.
2. Review the **MITRE ATT&CK Mapping** and confidence score breakdown:
   - Supervised RF confidence ($P_{\text{threat}}$).
   - Unsupervised Mahalanobis drift distance.
   - Hard rule floor reasoning.
3. Inspect the cryptographic **SHA-256 Evidence Chain Hash** proving evidence tamper-resistance.
4. Take defensive action:
   - **Acknowledge:** Marks alert as under investigation.
   - **Mark False Positive:** Tunes adaptive baseline parameters.
   - **Resolve:** Confirms threat mitigated.

### 4.3 Model Governance & Drift Monitoring (`/models`)
- Inspect the **Platt Calibration Curve** comparing predicted probabilities against empirical frequencies.
- Verify **Conformal Prediction Uncertainty Intervals** ($95\%$ confidence bounds).
- Review **Global Feature Importance** rankings (e.g. `auth_failures_30s`, `request_rate_5s`, `endpoint_entropy`).
- Promote champion models or execute rollbacks if drift is detected.

---

## 5. Emergency Circuit Breaker (Kill Switch) Drill

In the event of unexpected behavior, runaway simulation loops, or exercise termination:

### 5.1 Activating Emergency Stop
1. In the top bar, click the red **"STOP"** button (or navigate to `/attack-console` and click **"Emergency Kill Switch"**).
2. The platform instantly:
   - Sends an atomic cancellation signal to all active participant worker tasks.
   - Switches the reverse proxy allowlist to reject further attack payloads.
   - Broadcasts a `circuit.changed` event over the WebSocket hub with `ESTOP_ENGAGED`.
   - Records an immutable forensic event into the SHA-256 evidence ledger.

### 5.2 Resetting the Circuit Breaker
1. Navigate to `/settings`.
2. Click **"Reset Emergency Circuit Breaker"**.
3. Confirm session state transitions back to `NOMINAL`.

---

## 6. Post-Exercise Debriefing & Scorecard Generation

1. At the conclusion of the active cyber window, click **"Advance Phase"** to enter `DEBRIEF`.
2. Open the **Operator Detection Scorecard**:
   - Total Scenarios Launched vs. Detected.
   - Mean Time to Detect (MTTD) across MITRE techniques.
   - False Positive Rate (FPR).
3. Student consoles update to display their individual attribution reports, highlighting which scenarios bypassed detection and which were caught immediately.
