# Sentinel Flow — Classroom & Live Demonstration Runbook (10-Minute Presentation)

This runbook guides an instructor or student through a structured, 10-minute classroom demonstration of **Sentinel Flow: AI-Based Defensive Intrusion Detection & Threat Monitoring**.

---

## Demonstration Timeline & Script

```mermaid
timeline
    title 10-Minute Sentinel Flow Live Demonstration
    00:00 - 02:00 : Architecture & Participant Onboarding : Device fingerprinting, participant alias join, role selection
    02:00 - 04:00 : Normal Baseline Telemetry : Participant browsing lab target, empirical baseline calibration
    04:00 - 06:00 : Attack Scenario 1 - Brute Force (T1110) : Multi-principal failed logins, rule correlation + ML detection
    06:00 - 08:00 : Attack Scenario 2 - Volumetric DoS & Probing : Rate spikes, entropy drop, multi-layer score fusion
    08:00 - 09:00 : Emergency Stop & Evidence Integrity : Hardware-style kill switch, SHA-256 forward ledger verification
    09:00 - 10:00 : Model Registry & Performance Metrics : Calibration curves, Brier score, conformal prediction intervals
```

---

### Segment 1: Overview & Participant Join (0:00 – 2:00)

#### Narrative / Talking Points:
> *"Today we present Sentinel Flow — an AI-powered defensive monitoring platform built to demonstrate the complete cybersecurity lifecycle: Problem $\to$ AI Technique $\to$ Implementation $\to$ Empirical Results $\to$ Defensive Impact. Rather than relying on simple static rules or synthetic simulations, Sentinel Flow monitors real HTTP application flows, extracts 35 live streaming features per identity, and fuses deterministic MITRE ATT&CK rules with calibrated machine learning."*

#### Actions:
1. Open the landing screen at `http://localhost:5173`.
2. Click **Join Demo** or scan the displayed session QR code.
3. Enter participant alias (e.g., `Analyst-Alex`) and select role: **Analyst / Student**.
4. Point out the real-time **Identity & Device Fingerprint** assigned by the backend (SHA-256 canvas/WebGL/header fingerprint).
5. Open the **Operator Dashboard** in a second window or tab at `http://localhost:5173/overview`.
6. Show that the participant device immediately registers on the real-time **Device Heatmap Grid** with low threat score ($< 0.10$).

---

### Segment 2: Normal Traffic Generation & Baseline Calibration (2:00 – 4:00)

#### Narrative / Talking Points:
> *"Defensive machine learning begins with establishing an empirical baseline of normal user activity. Here, our participants browse the isolated local lab application. Sentinel Flow's streaming feature pipeline measures request rates, path entropy, byte volume ratios, and error distributions in 10-second sliding windows."*

#### Actions:
1. In the participant window, click **Browse Lab Store** or navigate between simulated products (`/api/products`, `/api/categories`, `/about`).
2. Watch the live **Ingestion Rate** and **Telemetry Waveform** update in real-time over WebSockets on the Operator screen.
3. Navigate to **Detection Engine** tab and click **Calibrate Empirical Baseline**.
4. Show the dialog confirming empirical distribution fitting over the observed normal traffic vectors. Explain that this establishes the Gaussian kernel parameters for our unsupervised Mahalanobis distance layer.

---

### Segment 3: Attack Scenario 1 — Credential Stuffing & Failed Login Surge (4:00 – 6:00)

#### Narrative / Talking Points:
> *"Now we transition to active threat detection. An attacker attempts a credential stuffing attack against the authentication service (MITRE ATT&CK T1110). Notice our safety gate: the attack orchestrator is strictly bound to RFC 1918 private loopback targets and requires explicit operator consent before launching."*

#### Actions:
1. Navigate to **Attack Console** (`/attack-console`).
2. Point out the **Operator Consent Banner** confirming authorized target: `http://127.0.0.1:8000/lab-target`.
3. Select **Failed-Login Brute Force (MITRE T1110)**.
4. Set parameters: **10 test accounts** at 5 req/s. Click **Execute Authorized Scenario**.
5. Switch to **Security Alerts** (`/alerts`) or observe the live banner:
   * **Rule Layer Alert:** `BRUTE_FORCE_BURST` trips within 3 failed login attempts.
   * **Supervised ML Layer:** Anomaly score shoots from $0.05 \to 0.98$ due to high 401 error ratio and path entropy collapse.
   * **Score Fusion:** Overall threat score hits `CRITICAL` ($> 0.85$).
6. Click the alert to show the **Explainability Drawer**:
   * Top feature deviations: `error_ratio_4xx` ($+380\%$), `req_rate_10s` ($+240\%$).
   * Conformal prediction interval: $[0.95, 1.00]$ with 95% certainty.

---

### Segment 4: Attack Scenario 2 — Volumetric Rate Burst & Reconnaissance (6:00 – 8:00)

#### Narrative / Talking Points:
> *"Next, we simulate an automated crawler and volumetric denial-of-service burst (MITRE ATT&CK T1499 & T1595). Here, high-frequency request rates distort traffic variance and trigger both unsupervised drift detection and signature heuristics."*

#### Actions:
1. Return to **Attack Console** and select **Volumetric Rate Burst (MITRE T1499)**.
2. Click **Execute Scenario** (15 req/s for 10s).
3. Observe the **Operator Grid**:
   * The targeted identity tile turns bright red (`THREAT LEVEL: HIGH`).
   * The **Telemetry Timeline** reflects a steep surge in ingestion rates.
4. Demonstrate analyst triage:
   * Click **Investigate Identity** to view the drilldown page (`/identity/:id`).
   * Show the timeline of individual HTTP requests captured with latency and byte metrics.
   * Update the disposition to **CONFIRMED_MALICIOUS** with analyst notes.

---

### Segment 5: Emergency Stop & Cryptographic Evidence Ledger (8:00 – 9:00)

#### Narrative / Talking Points:
> *"In a defensive system, safety and forensic non-repudiation are paramount. If an attack exceeds safety parameters, our Emergency Stop kill switch immediately trips an atomic circuit breaker. Furthermore, all security events are recorded into an append-only forward SHA-256 cryptographic ledger."*

#### Actions:
1. Click the persistent **EMERGENCY STOP** button in the top navigation bar.
2. Confirm the modal:
   * Show that all scenario executions instantly stop.
   * Notice that new attack runs are strictly rejected with HTTP 403 until the circuit breaker is explicitly reset.
3. Navigate to **Evidence Ledger** (`/analytics` or `/evidence`).
4. Click **Verify Cryptographic Chain Integrity**:
   * Show that the backend computes `H_i = SHA256(H_{i-1} || event_bytes)` across all historical events.
   * The UI displays a green badge: `LEDGER INTEGRITY VERIFIED (0 Tamper Anomalies)`.

---

### Segment 6: Model Registry & Academic Rigor (9:00 – 10:00)

#### Narrative / Talking Points:
> *"Finally, we review the machine learning rigor behind Sentinel Flow. Many classroom projects train a generic classifier and report basic accuracy. Sentinel Flow implements genuine probability calibration using Platt scaling, evaluates Brier score and Expected Calibration Error (ECE), and benchmarks five distinct algorithms across held-out scenario runs."*

#### Actions:
1. Navigate to **Model Registry** (`/models`).
2. Review the **Algorithm Benchmark Table**:
   * `RandomForest`: ROC-AUC 1.0000, PR-AUC 1.0000, Brier Score 0.0004.
   * Compare against `LogisticRegression` and unsupervised `IsolationForest`.
3. Highlight the **Calibration Curve**:
   * Show that predicted probabilities lie directly along the diagonal $y = x$, meaning a 90% confidence prediction has a true 90% empirical frequency.
4. Review the **Recall @ 1% False Positive Rate (FPR)**:
   * Explain why low false positive rate matters in security monitoring (prevents alert fatigue in SOCs).
5. Conclude with the summary of accomplishments and answer instructor/audience questions.

---

## Demo Checklist & Troubleshooting

| Item | Status | Verification Command |
| :--- | :---: | :--- |
| **Backend API Running** | Ready | `curl http://localhost:8000/api/v1/health` $\to$ `200 OK` |
| **Frontend Serving** | Ready | Browser at `http://localhost:5173` |
| **Model Artifacts Present** | Ready | `backend/artifacts/production_model.joblib` exists |
| **Prometheus Scraping** | Optional | `http://localhost:9090/targets` |
| **Grafana Dashboard** | Optional | `http://localhost:3001` (admin/sentinel_grafana_secure_admin_2026) |
| **Emergency Stop Clear** | Ready | Header badge indicates "Normal Operation" |
