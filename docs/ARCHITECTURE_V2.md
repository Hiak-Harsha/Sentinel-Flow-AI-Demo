# Sentinel Flow v2 — System Architecture & Engineering Specification

**Document Version:** 2.0.0  
**Target Environment:** Python 3.11+ / FastAPI / React 19 / Vite / Tailwind CSS v3  
**Status:** Canonical Reference  

---

## 1. System Overview

Sentinel Flow v2 is an enterprise-grade cyber-defense operations platform and educational intrusion detection system (NIDS) designed for live classroom and SOC demonstrations. The platform enforces a strict separation between **Red Team participants** (who execute bounded, authorized attack scenarios against disposable lab targets) and **Blue Team SOC operators** (who supervise the exercise, monitor real-time telemetry, triage calibrated incidents, and control safety circuit breakers).

```mermaid
flowchart TB
    subgraph RedTeam ["Participant Domain (Red Team)"]
        P1[Participant 1: Browser/Tool]
        P2[Participant 2: Script/Burst]
        PN[Participant N: Edge Client]
        RC[Participant Arena Console<br/>/participant]
    end

    subgraph Boundary ["Ingestion & Boundary Enforcement"]
        RP[HTTP Reverse Proxy & Traffic Logger<br/>Port 8000 / Dynamic Target]
        ALE[Allowlist Enforcer<br/>RFC 1918 / Loopback Only]
        SEC[Token & Attribution Verifier<br/>HMAC-SHA256 Signed Headers]
    end

    subgraph Pipeline ["Streaming Feature Pipeline"]
        EB[(In-Memory Event Bus / Redis Streams)]
        DEDUP[Sliding-Window Deduplication]
        FE[35-Dimension Feature Pipeline<br/>10s / 30s / 60s Sliding Windows]
        FS[(Feature Store / EWMA State)]
    end

    subgraph Engine ["3-Layer Detection Fusion Engine"]
        L1[Layer 1: Deterministic MITRE Rules<br/>T1110, T1499, T1046, T1071, T1059]
        L2[Layer 2: Calibrated Supervised ML<br/>Platt-Scaled LightGBM / Random Forest]
        L3[Layer 3: Unsupervised Adaptive Baseline<br/>Isolation Forest + Mahalanobis Drift]
        FUSE[Score Fusion & Disposition<br/>Conformal Prediction Quantiles]
    end

    subgraph Forensic ["Forensic Accountability & Safety"]
        ESTOP[Emergency Circuit Breaker<br/>Immediate Simulation Halting]
        LEDGER[(Append-Only Evidence Ledger<br/>Forward SHA-256 Tamper Chain)]
        QUOTA[Participant Quota Limiter<br/>Concurrency & Run Caps]
    end

    subgraph BlueTeam ["Operator Domain (Blue Team)"]
        WS_HUB[WebSocket Realtime Broadcast Hub<br/>/api/v1/ws Protocol v1]
        OP[Operator Mission Console<br/>Strictly Defensive (No Attack Triggers)]
        ALERTS[Alerts Workbench / Triage]
        MODELS[Model Governance & Registry]
        TOPOLOGY[Device Grid & Network Graph]
    end

    P1 & P2 & PN --> RC
    RC -->|Authorized Bounded Attacks| RP
    RP --> SEC
    SEC --> ALE
    ALE --> EB
    EB --> DEDUP --> FE --> FS
    FS --> Engine
    L1 & L2 & L3 --> FUSE
    FUSE -->|Alert Envelopes| WS_HUB
    FUSE -->|Signed Cryptographic Events| LEDGER
    ESTOP -.->|Atomic Invalidation| ALE
    QUOTA -.->|Rate Limiting| RC
    WS_HUB <==>|Sequenced Events & Heartbeats| OP
    WS_HUB --> ALERTS & MODELS & TOPOLOGY
```

---

## 2. Role-Based Access Control (RBAC) & Boundary Isolation

Sentinel Flow v2 strictly segregates participant actions from operator visibility.

### 2.1 Role Definitions
- **`participant` (Red Team):**
  - Authenticates via session room join code and alias.
  - Granted a scoped participant token (`pt_<alias>_<nonce>`).
  - Permitted to trigger bounded attack scenarios (e.g. `credential_stuffing`, `burst_dos`, `directory_traversal`, `sqli_probe`) against allowlisted disposable lab targets only.
  - Enforced by strict concurrency caps (default: 2 active runs) and lifetime run quotas (default: 20 runs/participant).
- **`operator` (Blue Team):**
  - Instructor or SOC security analyst supervising the cyber exercise.
  - Console is **strictly defensive**: has zero capability to trigger or launch attack scenarios.
  - Authorizes targets, advances session phases (`LOBBY` $\to$ `BASELINE` $\to$ `EXERCISE_OPEN` $\to$ `DEBRIEF` $\to$ `CLOSED`), monitors aggregate telemetry, triages alerts, and controls the Emergency Stop circuit breaker.
- **`admin` (Platform Lead):**
  - Superuser with operator permissions plus model deployment promotion/rollback and secret rotation.

### 2.2 Ground Truth vs. Detection Stack Isolation
A core architectural invariant is the **isolation of the Run Registry from the Detection Pipeline**:
1. **The Ground Truth Registry** records ground truth data: who initiated which scenario, at what time, and how many attack payloads were generated.
2. **The Detection Engine** evaluates only observable telemetry (response latency, payload bytes, status code distribution, endpoint entropy, auth failure frequency).
3. **The Scorecard Service** joins ground-truth run records with generated alerts *only after the exercise completes* during `DEBRIEF` mode, ensuring models cannot "cheat" during live inference.

---

## 3. Streaming Feature Engineering & Baseline Profiling

Sentinel Flow eliminates train/serve skew by extracting the exact same 35 streaming features during live inference as during model training:

### 3.1 The 35 Streaming Dimensions
1. **Volumetric Rates (5s, 30s, 60s):** `request_rate_5s`, `request_rate_30s`, `byte_volume_in_5s`, `byte_volume_out_5s`.
2. **Error & Status Distribution:** `error_ratio_5s`, `error_ratio_30s`, `status_4xx_ratio`, `status_5xx_ratio`, `target_error_ratio`.
3. **Authentication & Identity Metrics:** `auth_failures_30s`, `account_churn_5m`, `distinct_user_agents_5m`, `token_entropy`.
4. **Endpoint & Behavioral Topology:** `endpoint_entropy_30s`, `distinct_paths_30s`, `distinct_ports_10s`, `canary_hits_30s`.
5. **Latency Dynamics:** `mean_latency_30s`, `p95_latency_30s`, `inter_request_interval_mean`, `inter_request_interval_variance`.

### 3.2 Adaptive Per-Identity Baselines
For every connected identity, an Exponentially Weighted Moving Average (EWMA) maintains mean and covariance vectors. Anomaly distance is calculated using Mahalanobis distance with maturity gates ($N \ge 20$ baseline windows) to prevent early-session false alarms.

---

## 4. Multi-Layer Detection Fusion

Threat detection operates through three complementary layers that fuse into a calibrated incident score:

| Layer | Technique | Detection Target | Output |
| :--- | :--- | :--- | :--- |
| **Layer 1** | **Deterministic MITRE ATT&CK Rules** | Known offensive signatures (T1110 Credential Stuffing, T1499 Endpoint DoS, T1046 Port Scanning, T1071 App Layer Flood, T1059 Command Injection) | Hard confidence floor ($[0.70, 0.95]$) |
| **Layer 2** | **Platt-Calibrated Supervised ML** | Multivariable non-linear attack patterns trained on UNSW-NB15 + lab telemetry | Probabilistic threat confidence ($P \in [0, 1]$), calibrated Brier score $< 0.05$ |
| **Layer 3** | **Unsupervised Anomaly Detector** | Low-and-slow reconnaissance, behavioral deviations from normal browsing | Mahalanobis drift score ($[0, 1]$) |

### Conformal Prediction & Fusion
$$S_{\text{fused}} = \max\left(S_{\text{rule\_floor}}, \; w_1 S_{\text{supervised}} + w_2 S_{\text{unsupervised}} + w_3 S_{\text{rule\_heuristic}}\right)$$
Conformal prediction intervals ($\alpha = 0.05$) guarantee $95\%$ empirical coverage of benign fluctuations, preventing operator alarm fatigue.

---

## 5. Realtime WebSocket Protocol v1

The UI and backend communicate over a bi-directional, monotonic, sequence-numbered WebSocket connection (`/api/v1/ws`):

### 5.1 Message Envelope Structure
```json
{
  "seq": 1042,
  "type": "telemetry.point",
  "timestamp": "2026-10-16T01:45:00.123Z",
  "data": {
    "throughput_rps": 48.2,
    "p95_latency_ms": 9.01,
    "active_incidents": 2,
    "calibrated_brier": 0.041
  }
}
```

### 5.2 Core Event Types
- `client.connected`: Handshake with initial sequence number, active phase, and server time.
- `telemetry.point`: High-frequency streaming telemetry emitted every 1,000ms.
- `alert.raised`: Real-time incident fired with MITRE mapping, evidence chain hash, and SLA deadline.
- `alert.updated`: Incident status transition (`ACKNOWLEDGED`, `RESOLVED`, `FALSE_POSITIVE`).
- `circuit.changed`: Circuit breaker state broadcast (`ACTIVE`, `ESTOP_ENGAGED`).
- `session.phase_changed`: Exercise phase state change (`LOBBY` $\to$ `EXERCISE_OPEN`, etc.).
- `ping` / `pong`: Client-server liveness verification with sub-10ms latency tracking.

---

## 6. Safety Invariants & Cryptographic Auditing

1. **Strict Target Allowlist:** The reverse proxy unconditionally rejects non-allowlisted targets. RFC 1918 private IP ranges and loopback endpoints are strictly enforced. External cloud production endpoints are rejected with `403 Forbidden`.
2. **Emergency Circuit Breaker:** Activating Emergency Stop immediately terminates all running participant processes, revokes participant tokens, and switches proxy routing into a circuit-open state.
3. **Cryptographic Forward SHA-256 Ledger:** Every security event is chained sequentially:
   $$H_i = \text{SHA-256}\left(H_{i-1} \parallel \text{timestamp}_i \parallel \text{event\_type}_i \parallel \text{payload\_digest}_i\right)$$
   Any retroactive database alteration breaks the hash chain, enabling provable integrity audits.

---

## 7. Design System Architecture

The frontend follows the **Graphite & Warm Amber Instrument Panel** specification:
- **Surface Hierarchy:** `--surface-0` (`#090c10`), `--surface-1` (`#111417`), `--surface-2` (`#16181c`), `--surface-3` (`#1e2227`).
- **Brand Amber Accents:** Action buttons, active navigation indicators, and telemetry curves use `#fe9a00` / `#ffb454`.
- **Strict Severity Palette:**
  - Critical: `#f4526b` (Rose-Red)
  - High: `#ff7a45` (Orange-Coral)
  - Elevated: `#e9c46a` (Warm Yellow)
  - Low: `#3ddc97` (Mint Green)
  - Info: `#5aa9ff` (Soft Blue)
- **Typography:** Display headlines in *Space Grotesk*, UI labels in *Inter*, and tabular telemetry in *JetBrains Mono*.
