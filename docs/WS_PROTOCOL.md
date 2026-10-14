# Sentinel Flow — WebSocket Protocol v1

## 1. Overview
The Sentinel Flow WebSocket API provides real-time streaming of telemetry, security alerts, scenario attack progress, and system health to authorized operator and participant clients.

Protocol Version: `1`

---

## 2. Authentication & Connection Lifecycle

1. **Ticket Request:**  
   Clients must request a short-lived ticket prior to connecting:
   ```http
   POST /api/v1/ws/ticket
   Content-Type: application/json

   {
     "role": "operator" | "participant",
     "identity_id": "usr_harsha_01",
     "passcode": "SF-OPERATOR-2026"  // Required for operator role
   }
   ```
   **Response:**
   ```json
   {
     "ticket": "wst_xyz123...",
     "role": "operator",
     "identity_id": "usr_harsha_01",
     "expires_in": 300
   }
   ```

2. **WebSocket Handshake:**  
   Connect to `/ws?ticket=<ticket>` or send an initial auth payload within 5 seconds:
   ```json
   {
     "type": "auth",
     "ticket": "wst_xyz123..."
   }
   ```
   If unauthenticated or expired, the socket is immediately closed with code `4401`.

---

## 3. Envelope Specification

Every server message uses a uniform v1 envelope:

```json
{
  "v": 1,
  "type": "telemetry.tick",
  "channel": "public",
  "seq": 142,
  "ts": "2026-10-14T20:30:00.123Z",
  "provenance": "live",
  "data": { ... }
}
```

### Fields
| Field | Type | Description |
|---|---|---|
| `v` | integer | Protocol version (`1`). |
| `type` | string | Event classification (e.g. `telemetry.tick`, `alert.raised`). |
| `channel` | string | Target channel: `public`, `operator`, or `participant:{id}`. |
| `seq` | integer | Monotonically increasing sequence number across all events. |
| `ts` | string | ISO 8601 UTC timestamp when the event was generated. |
| `provenance` | string | Data honesty tag: `live`, `replay`, or `simulated`. |
| `data` | object | Event-specific payload. |

---

## 4. Channels & Authorization

| Channel | Authorized Roles | Content |
|---|---|---|
| `public` | `operator`, `participant` | Session lifecycle (`session.created`, `session.phase_changed`), participant joins, global threat level. |
| `participant:{id}` | `operator`, and `participant` with matching `identity_id` | Private per-identity assessment updates and personal alerts. |
| `operator` | `operator` only | Real-time security incident alerts, attack scenario progress, full identity inventory, and system health metrics. |

> **Security Invariant:** Participants are strictly prohibited from subscribing to or receiving messages from the `operator` channel.

---

## 5. Reconnection & Resume Mechanism

When a client reconnects after network disruption, it sends:
```json
{
  "type": "resume",
  "last_seq": 128
}
```
- If `last_seq` exists within the server's ring buffer (default 500 events), missed messages are replayed in chronological sequence.
- If `last_seq` has expired from the ring buffer, the server emits a `resync_required` message, signaling the frontend to refetch complete state from REST APIs.

---

## 6. Heartbeat
- The server periodically verifies client liveness with ping frames.
- Clients can issue `{ "type": "ping" }` and receive `{ "type": "pong" }`.

---

## 7. Event Types Catalog

| Event Type | Channel | Provenance | Description |
|---|---|---|---|
| `session.created` | `public` | `live` | New demonstration session created. |
| `session.phase_changed` | `public` | `live` | Demonstration phase or controlled target changed. |
| `participant.joined` | `public` | `live` | New participant connected to the session. |
| `telemetry.tick` | `public` | `live` | 1 Hz aggregate network rate, active devices, and requests/sec. |
| `assessment.updated` | `participant:{id}`, `operator` | `live` | Updated multi-layer threat score and feature vector for an identity. |
| `alert.raised` | `operator` | `live` / `simulated` | Security rule or anomaly threshold triggered. |
| `alert.updated` | `operator` | `live` | Alert disposition updated by SOC analyst. |
| `attack.progress` | `operator` | `simulated` | Scenario run progress, quota counters, and request rate. |
| `attack.effect` | `operator` | `simulated` | Individual simulated HTTP effect observed by proxy. |
| `attack.finished` | `operator` | `simulated` | Scenario run completed or stopped. |
| `emergency_stop.engaged` | `public`, `operator` | `live` | Emergency stop circuit breaker tripped. |
| `emergency_stop.reset` | `public`, `operator` | `live` | Emergency stop circuit breaker reset by operator. |
| `system.health` | `operator` | `live` | Queue depths, proxy health, and engine latencies. |
| `model.status` | `operator` | `live` | ML model version, readiness, and drift status. |
