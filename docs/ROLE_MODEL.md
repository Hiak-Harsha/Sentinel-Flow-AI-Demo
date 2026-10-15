# Sentinel Flow v2 — Role & Permission Model

This document specifies the authoritative Role-Based Access Control (RBAC), Session Phase State Machine, and Ground-Truth Separation rules for Sentinel Flow v2.

---

## 1. Role Definitions

Sentinel Flow v2 defines three distinct roles:

1. **`participant` (Red Team):**
   Students / participants attending the cyber-defense exercise. They join a session using a session join code and an alias. They perform bounded, authorized intrusion scenarios against the disposable lab target during the exercise.
2. **`operator` (Blue Team):**
   Instructors / SOC operators who supervise the exercise. The operator console is strictly defensive. Operators authorize the target, set quotas, advance exercise phases, monitor live telemetry, triage alerts, and can invoke emergency stop. **The operator NEVER launches attacks.**
3. **`admin` (Platform Lead):**
   Administrative role with all operator capabilities plus management of operator credentials, API secrets, retention policies, and ML model promotion/rollback.

---

## 2. Role Permission Matrix

| Capability | Participant | Operator | Admin |
|---|:---:|:---:|:---:|
| **Join session with code + alias** | **Yes** | No | No |
| **Launch bounded attack scenario** | **Yes** *(only if `EXERCISE_OPEN` & within quota)* | **NEVER** | **NEVER** |
| **Use manual red-team tools** (login, path probe, canary, port sensor) | **Yes** *(within caps & lab target only)* | **NEVER** | **NEVER** |
| **Authorize lab target & sign consent** | No | **Yes** | **Yes** |
| **Configure enabled scenarios & quotas** | No | **Yes** | **Yes** |
| **Advance session phase** (`LOBBY` -> `CLOSED`) | No | **Yes** | **Yes** |
| **Emergency stop** | Stop own run only | **Global Stop** | **Global Stop** |
| **Emergency reset** | No | **Yes** | **Yes** |
| **Suspend individual participant** | No | **Yes** | **Yes** |
| **View live detections & all participants** | No | **Yes** | **Yes** |
| **View own run timeline & debrief** | **Yes** *(own runs only)* | **Yes** *(all)* | **Yes** *(all)* |
| **Triage alerts** (ack / false-positive / resolve) | No | **Yes** | **Yes** |
| **Detection scorecard** | Own results only *(post-debrief)* | **Yes** *(all)* | **Yes** *(all)* |
| **Model registry promotion / rollback** | No | Read-only | **Yes** |
| **Manage operators, secrets, retention** | No | No | **Yes** |

---

## 3. Session Lifecycle State Machine

The exercise lifecycle is governed by an explicit 5-phase finite state machine:

```
[ LOBBY ] ──(Operator Opens Baseline)──> [ BASELINE ] ──(Operator Opens Exercise)──> [ EXERCISE_OPEN ]
                                                                                            │
[ CLOSED ] <──(Operator Closes Session)── [ DEBRIEF ] <──(Operator Closes Exercise)─────────┘
```

### Phase Rules:
1. **`LOBBY`:**
   Participants can join, register devices, and perform normal baseline browsing through the proxy. Attack endpoints return `423 Locked`.
2. **`BASELINE`:**
   Normal traffic is observed to establish the behavioral baseline model. No attack scenarios permitted (`423 Locked`).
3. **`EXERCISE_OPEN`:**
   The active cyber-defense window. Authenticated participants can launch bounded scenarios within their assigned quotas. Concurrency caps are strictly enforced.
4. **`DEBRIEF`:**
   Exercise is halted. Attack endpoints return `423 Locked`. Participants can view their individual debriefs and scorecards (contingent on `reveal_mode`). Operators analyze aggregate detection metrics.
5. **`CLOSED`:**
   Session concluded and archived. All attack tools locked.

---

## 4. Ground Truth vs. Detection Stack Isolation

A critical design invariant of Sentinel Flow v2 is strict separation between ground truth and behavioral detection:

- **Run Registry (Ground Truth):**
  Records `run_id`, `participant_identity_id`, `scenario_name`, `started_at`, `ended_at`, `status`, and `effect_count`.
- **Detection Stack:**
  Evaluates purely behavioral network and application telemetry (failed logins, URI entropy, port diversity, rate spikes, canary tokens).
- **Isolation Rule:**
  The detection engine (`detection/rule_correlator.py`, ML models, alert managers) **MUST NEVER** import, query, or receive data from the Run Registry.
- **Scorecard Calculation:**
  The evaluation scorecard (`GET /operator/scorecard`) joins the Run Registry with generated Alerts **after the fact** by matching participant identity and timestamp windows.

---

## 5. Anti-Spoofing & End-to-End Attribution

1. **Token-Only Identity:**
   Client requests are authenticated via short-lived JWT tokens containing `identity_id`, `role`, and `session_id`.
2. **Header Sanitization:**
   Client-supplied `X-Sentinel-Identity`, `X-Participant-Device`, or `X-Attack-Run-ID` headers are ignored outside automated test suites.
3. **Signed Internal Forwarding:**
   The instrumented reverse proxy verifies the client token, resolves the verified actor, and generates an internal HMAC-signed header (`X-Sentinel-Actor`). Inbound versions of this header from external clients are unconditionally stripped.
4. **Lab Target Audit Verification:**
   The disposable lab target relies solely on the verified `X-Sentinel-Actor` header to attribute security events in its audit log.
