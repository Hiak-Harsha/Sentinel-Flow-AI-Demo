<USER_REQUEST>
# Sentinel Flow — Production-Grade Upgrade: Master Implementation Prompt

**How to use this file:** paste everything under "THE PROMPT" into your coding agent (Claude Code, Cursor, Codex) with the repo open. Tell it to do **one phase at a time** and stop for your review after each. Section A is the audit I did of your zip; the prompt references it so the agent starts from facts, not guesses.

---

## A. Audit of the current repo (what is actually wrong)

I read the code; I did not run it or render the UI, and I did not run the test files. Verify with Phase 0.

### Frontend ↔ backend connection
1. **Backend pushes events the UI ignores.** `run_manager` broadcasts `attack_progress`, `attack_effect`, `attack_finished`, `emergency_stop`, `emergency_stop_reset` over `/ws`, but `App.jsx` `handleWsMessage` has no case for them. `initial_state` also sends `recent_activity`, which is discarded.
2. **Polling instead of push.** `setInterval` polling in `CommandCenter` (2s), `OperatorDetailFeed` (2s), `AlertsWorkbench` (3s), `ParticipantApp` (2.5s), `TargetConfig` (5s), `AttackConsole`. Only `App.jsx` opens a WebSocket. Every page re-fetches what the socket could deliver.
3. **`participant_joined` triggers `refreshAll()`**, a full refetch, instead of applying the delta.
4. **`handleWsMessage` is defined after the effect that uses it, inside a `[]`-deps effect.** It is captured from first render, so anything it reads from state or props goes stale. It mostly uses functional setters, so it works today, but it is fragile.
5. **CORS/host mismatch.** `API_BASE` is `http://${window.location.hostname}:8000`, but `ALLOWED_ORIGINS` only allows `localhost:5173` and `127.0.0.1:5173`. A participant opening the app from a phone or laptop on the LAN (the whole point of the classroom session) gets blocked.
6. **No contract.** Hand-written `api.js` (about 40 endpoints), no shared schema, no response typing. The backend has duplicate/alias routes (`/api/session` and `/api/sessions/current`, `/run` and `/runs`), and `api.js` carries "backwards compatibility aliases".
7. **WebSocket has no auth and no channels.** Every client receives everything, including operator-only data, and the server loop only does `receive_text()`. No heartbeat, resume, or backpressure.

### Data and persistence
8. **Most state is in memory.** `SessionService` (sessions, participants, history), `FeatureStore`, identity sessions, and `DetectionEngine._latest_assessments` are Python dicts and deques. A restart loses everything. Only `evidence_events`, `security_alerts`, `lab_runs`, `operator_authorizations` are in SQLite, via a new connection per call.
9. **No time-series storage.** Telemetry history is a bounded deque, so the Analytics and History pages cannot show anything beyond the last N points.

### ML and detection
10. **Train/serve skew (the biggest ML problem).** The Random Forest is trained on 8 UNSW-NB15 network-flow features. `supervised_model.map_features` fabricates them from HTTP request counts: `dpkts = spkts = request_count_30s`, `dur` is derived from mean inter-request interval rather than the observation window, `rate = request_rate_5s`. The README says `dur` is the observation duration, and the code does something different. The 89–95% metrics describe network flows, not this app's traffic.
11. **Supervised output does not drive the risk score.** In `score_fusion`, `threat_score` is the unsupervised score alone, or `0.7*rule + 0.3*unsup` when a rule matches. The supervised probability only feeds a concordance counter. The confidence (0.90 / 0.75 / 0.55 / 0.35) is a fixed lookup, not a calibrated probability.
12. **Metrics disagree.** `evaluation.json` says RF accuracy 89.13 / recall 95.82. `model_comparison.json` says RF accuracy 93.47 / recall 98.68. Also, HistGradientBoosting beats RF on accuracy and F1 there, and RF is "selected" for explainability. All of this needs reconciling on one fixed test protocol.
13. **Only 8 features, a 60k-row sample, a random split.** No calibration, no threshold tuning, no temporal or cross-dataset validation, no drift monitoring.
14. **The unsupervised model is a z-score baseline plus IsolationForest** over 7 hand-picked features, with hard-coded default baselines.

### Frontend quality
15. **No routing** (tab state in `App.jsx`, no router in `package.json`), **no data-fetching layer, no state library, no charting library**. Large monolithic pages (`Overview` 27 KB, `AlertsWorkbench` 26 KB, `Analytics` 24 KB, `LandingHeroAnimation` 27 KB).
16. Google Fonts loaded via CSS `@import` (render-blocking and offline-hostile). `dist/` is committed.
17. No visible design system: colors and spacing are ad hoc inline classes plus `.nids-card` in one CSS file.

### Security hygiene
18. Hard-coded default secrets in `config.py` (operator passcode, HMAC key, webhook secret). `target_config.json` with an authorization record is committed. Identity tokens are opaque in-memory strings with no persistence or rotation.

### Good things to keep
The safety design is solid and must not regress: target allowlist limited to loopback/RFC1918, consent gate, emergency stop, hash-chained evidence log with integrity verification, bounded scenarios, and a disposable lab target. The prompt below treats these as **invariants**.

---

# THE PROMPT

You are a senior full-stack + ML engineer. You are upgrading the repository **Sentinel Flow** (React 19 + Vite + Tailwind 4 frontend in `src/`, FastAPI backend in `backend/app/`) from a classroom demo into a professional, real-time, database-backed defensive security monitoring platform. Work **one phase at a time**. After each phase: run the verification commands, summarize what changed, list anything you could not verify, and **stop and wait for my go-ahead**.

## 0. Non-negotiable constraints

**Safety invariants (never weaken, never bypass; add tests that fail if they are weakened):**
- The orchestrator may only target hosts that pass `is_private_or_loopback_host` and the allowlist, and only after the consent gate. Public hosts stay rejected.
- Emergency stop must halt all runs within 2 seconds, and its state must survive a restart.
- Scenarios stay bounded (existing quotas/caps). No packet capture of other people's traffic, no scanning or flooding of anything outside the owned lab target.
- The evidence log stays append-only and hash-chained; `verify_chain_integrity` must pass after every phase.
- No secrets in the repo. Defaults for dev only, and the app refuses to start in `SENTINEL_ENV=production` with default secrets.

**Honesty invariants:**
- Every data point shown in the UI carries a **provenance tag**: `live` (observed by our proxy/lab target/host sensor), `replay` (labeled dataset streamed at a controlled rate), or `simulated` (orchestrator scenario). The UI must display the tag. Never present replay or simulated data as live.
- Every metric shown in the UI is read from a stored evaluation artifact produced by a script in the repo. No hand-typed numbers.
- Report PR-AUC, recall at a fixed false-positive rate, and the confusion matrix, not accuracy alone. State the test protocol next to each number.

**Working rules:** small commits per task (conventional commits); keep the app runnable at the end of every phase; write tests with the code; no dead code or unused dependencies; type everything (Pydantic v2 on the backend, TypeScript on the frontend); do not delete existing features without telling me.

## Phase 0 — Baseline, safety lock, repo hygiene
1. Create branch `upgrade/v3`. Run the existing backend tests (`backend/test_*.py`) and `npm run build`. Record pass/fail in `docs/BASELINE.md`. Do not fix anything yet.
2. Move the loose `backend/test_*.py` into `backend/tests/` with `pytest` + `pytest-asyncio` config. Add `tests/test_safety_invariants.py` that asserts each safety invariant above (public host rejected, no run without consent, emergency stop halts and persists, evidence chain verifies, production refuses default secrets).
3. Add `.env.example`, remove committed `dist/` and `backend/runtime/target_config.json` from git (keep a template), pin all dependencies (`requirements.lock`, `package-lock.json`), add `pre-commit` (ruff, ruff-format, eslint, prettier), and a `Makefile` (`make dev`, `make test`, `make lint`, `make train`, `make seed`).
**Done when:** baseline documented; safety tests green; hygiene committed.

## Phase 1 — A real contract between backend and frontend
1. **Config:** one `Settings` class (pydantic-settings) reading env. CORS origins come from `SENTINEL_ALLOWED_ORIGINS` and also accept the Vite dev origin on any private-network IP when `SENTINEL_ENV=dev`. The frontend reads `VITE_API_BASE_URL` and `VITE_WS_URL`; if unset it uses same-origin `/api` and `/ws` through the Vite dev proxy. This fixes LAN/phone participants.
2. **API versioning:** everything under `/api/v1`. Remove alias routes (`/api/session`, `/runs` POST alias) after updating callers. Every route has a Pydantic request and response model, tags, and error responses using one envelope: `{ "error": { "code", "message", "details", "request_id" } }`. Add a `request_id` middleware and structured logging (structlog, JSON).
3. **Typed client:** generate `src/api/schema.d.ts` from `/openapi.json` with `openapi-typescript`, and use `openapi-fetch` (or a thin typed wrapper). Add `make api-types`. CI fails if the generated file is stale. Convert the frontend to **TypeScript** incrementally (`allowJs`), starting with `src/api/`.
4. **WebSocket protocol v1** (document in `docs/WS_PROTOCOL.md`, define as Pydantic models, and generate TS types):
   - Envelope: `{ v:1, type, channel, seq, ts, provenance, data }`.
   - Auth: connect with a short-lived ticket from `POST /api/v1/ws/ticket` (token in query or first message, not a long-lived secret in the URL). Reject unauthenticated sockets with a close code.
   - **Channels** with server-side authorization: `public` (session phase, participant count), `participant:{id}` (own assessment), `operator` (alerts, all identities, attack progress, system health). Participants can never subscribe to `operator`.
   - Heartbeat ping/pong every 20s; client sends `resume {last_seq}` after reconnect and the server replays missed events from a ring buffer (or Redis stream in Phase 3), else sends a `resync_required` message.
   - Per-connection bounded queue with drop-oldest for telemetry and never-drop for alerts.
   - Event types (must include everything the backend already emits plus the ones the UI ignored): `session.*`, `participant.*`, `telemetry.tick`, `assessment.updated`, `alert.raised/updated/resolved`, `attack.progress/effect/finished`, `emergency_stop.engaged/reset`, `system.health`, `model.status`.
5. Write contract tests: a test that boots the app and asserts that every route used by the frontend exists in OpenAPI, and a WS test for auth, channel isolation, resume, and backpressure.
**Done when:** frontend builds against generated types; opening the app from another device on the LAN works; WS channel isolation tests pass.

## Phase 2 — Real persistence (database layer)
Goal: nothing important lives only in memory.
1. **Postgres 16 via Docker Compose** (SQLite remains supported for a zero-install dev mode via the same SQLAlchemy models). Use **SQLAlchemy 2.0 async + Alembic**. Provide `docker-compose.yml` with `postgres`, `redis`, `backend`, `frontend`.
2. Schema (all with `created_at`, indexed foreign keys, UUID v7 or ULID primary keys):
   - `sessions`, `participants`, `devices`, `identities` (hashed tokens, expiry, revoked_at, role)
   - `events` (raw normalized request/telemetry events: identity_id, ts, method, path_template, status, bytes_in/out, latency_ms, source, `provenance`) — **partitioned by day** (Postgres) or indexed by `(identity_id, ts)`; add **TimescaleDB** hypertable as an optional migration
   - `feature_windows` (identity_id, window_start, window_size, feature vector JSONB + schema_version)
   - `assessments` (identity_id, ts, model_version, per-layer scores, fused score, level, explanation JSONB)
   - `alerts` + `alert_events` (state machine: open → acknowledged → investigating → resolved/false_positive, with analyst, notes, timestamps)
   - `attack_runs`, `attack_effects`, `consents`, `authorizations`, `evidence_events` (keep hash chain; add `prev_hash` uniqueness constraint)
   - `model_registry` (name, version, stage, metrics JSONB, artifact URI, trained_on, created_at), `drift_reports`
3. Repository/service layer: replace the in-memory dicts in `SessionService`, `FeatureStore`, identity `session_manager`, and `DetectionEngine._latest_assessments` with DB-backed repositories plus a small write-through cache. Keep the public method names where possible to limit churn.
4. **Retention and rollups:** raw `events` kept 7 days (configurable), 1-minute and 1-hour rollup tables (`telemetry_rollups`) produced by a background job; APIs for history/analytics read rollups, not raw rows.
5. Migration/seed: `make migrate`, `make seed` (labeled demo data clearly tagged `replay`). Restart test: create session → join → raise alert → restart backend → state is intact.
6. Backups: `scripts/backup.sh` (pg_dump) and documented restore.
**Done when:** restart-survival test passes; Alembic upgrade/downgrade round-trips; no in-memory-only domain state remains.

## Phase 3 — Real-time event pipeline
1. **Ingestion:** all sources normalize into one `Event` model: (a) the reverse proxy / lab target (already exist), (b) the webhook receiver, (c) an optional **host sensor** (`backend/sensors/host_flow.py`) using `psutil` to sample the *local machine's own* connection and process counters, opt-in with an explicit consent flag, never other hosts, and (d) a **replay source** that streams a labeled dataset at a controlled rate, always tagged `replay`.
2. **Stream:** Redis Streams (`events:raw`) with consumer groups: `feature-builder` → `detector` → `alerter` → `ws-fanout`. If Redis is not running, fall back to an in-process `asyncio.Queue` behind the same interface (`EventBus` protocol). Idempotency key per event; at-least-once delivery with dedupe.
3. **Streaming features:** per-identity sliding windows (5s / 30s / 5min) computed incrementally (no full recompute): rates, byte volumes, endpoint entropy, error ratio, unique-path counts, inter-arrival mean/std/CV, burstiness (Fano factor), auth-failure ratio, status-class histogram, method mix, user-agent/fingerprint churn, **cross-identity** features (concurrent identities hitting the same endpoint, credential-reuse across identities). Version the feature schema (`feature_schema_version`) and store it with every vector.
4. **Fan-out:** WS publisher subscribes to the stream and emits channel-scoped events with `seq`. Throttle `telemetry.tick` to 1 Hz per client; alerts immediate.
5. **Health:** `/api/v1/health/live`, `/health/ready` (DB, Redis, model loaded), `system.health` WS event with queue lag, events/sec, p95 pipeline latency.
6. Load test (`locust` or `k6` against the lab target only): sustain 500 events/s for 5 minutes with end-to-end p95 latency under 500 ms from event to WS delivery, and no unbounded memory growth. Record results in `docs/PERF.md`.
**Done when:** the numbers above are measured and recorded; killing Redis degrades gracefully to the in-process bus.

## Phase 4 — Machine learning that matches what we actually observe
The core fix: **train on the features we can really compute live**, and evaluate honestly.

**4.1 Data (in order of value):**
1. **Self-labeled lab data (primary).** The orchestrator already runs bounded, consented scenarios against the owned lab target and knows ground truth by `run_id`. Label every feature window by whether it overlaps an attack run (with a guard band) and which scenario. Add `scripts/collect_lab_dataset.py` to drive N randomized scenario runs plus benign traffic generators (browsing sessions with randomized think-time, mixed endpoints, occasional legitimate errors, bursty-but-benign cases such as page loads and file uploads) and write a versioned Parquet dataset with a manifest (seed, git SHA, schema version, counts).
2. **Public datasets for flow-level models only, kept separate:** UNSW-NB15 (already in repo) plus CIC-IDS2017 or CSE-CIC-IDS2018 for a *network-flow* model. Use their full official feature sets, not the 8-feature subset. For HTTP-request-level anomalies consider CSIC 2010. These feed the **flow model**, which only scores inputs that really are flows (host sensor or replay). Do **not** feed it fabricated mappings from HTTP counts. Delete `map_features`.
3. Document each dataset's license, citation, class balance, and known problems (UNSW-NB15 and CIC-IDS have documented label and duplication issues; deduplicate and report).

**4.2 Models (build a benchmark harness first, then pick by evidence; do not assume):**
- **Supervised tabular:** LightGBM and XGBoost (strong defaults for tabular data), plus RF and logistic regression as baselines, plus the existing HistGradientBoosting. Hyperparameters via Optuna with time-aware CV. Class imbalance via class weights/focal-style weights, not blind SMOTE.
- **Sequence model on per-identity window sequences:** a small 1D-CNN or GRU (PyTorch, CPU-friendly, exported to ONNX), and optionally a light Transformer encoder. Keep only if it beats the tabular models on the held-out lab set by a margin that survives a bootstrap CI.
- **Unsupervised / online:** Isolation Forest, a **streaming** detector from the `river` library (Half-Space Trees), a robust Mahalanobis/ECOD detector, and a small **autoencoder** trained only on benign lab windows (reconstruction error). These catch unknown attacks the supervised model has never seen.
- **Stacking:** a calibrated meta-learner (logistic regression) over the base scores plus rule outputs, trained on out-of-fold predictions only (no leakage).
- **Calibration and uncertainty:** isotonic/Platt calibration; **conformal prediction** to output a prediction set and an "abstain / needs analyst" band; report the Brier score and reliability curve. Replace the fixed 0.90/0.75/0.55/0.35 confidence lookup with calibrated probability plus the conformal interval.

**4.3 Evaluation protocol (write to `backend/artifacts/<model>/<version>/evaluation.json` and `docs/MODEL_CARD.md`):**
- Split by **time and by scenario/run** (group k-fold by `run_id`), never random row splits. Hold out entire attack scenarios as an **unseen-attack** test to measure generalization.
- Metrics: PR-AUC, ROC-AUC, recall at 1% and 0.1% FPR, precision at the operating threshold, F1, confusion matrix, per-scenario recall, **time-to-detect** (seconds from attack start to first alert), alert volume per hour on benign-only traffic, latency (p50/p95 inference ms), model size.
- Include bootstrap 95% CIs. Cross-dataset check: train on UNSW-NB15, test on CIC-IDS (flow model) to show the generalization gap honestly.
- Robustness: evaluate under feature noise, rate-limited ("low and slow") attacks, and benign bursts, and record the failure cases in the model card.
- **Pick the operating threshold from a target false-positive budget**, not 0.5.

**4.4 Explainability:** SHAP (TreeExplainer for GBMs) computed at inference for flagged windows only; store the top-k contributions with each assessment; show a plain-language reason ("request rate 14× this identity's baseline; 83% 401 responses; 22 distinct paths in 30s").

**4.5 MLOps:** MLflow (local file store is fine) for experiments and the model registry (`model_registry` table mirrors stages: candidate → staging → production). Serving loads the production model by version, with **shadow mode** (score with a candidate and log the result without affecting alerts). Hot-reload without restart. Reproducible training: `make train` seeds everything and writes the manifest.

**4.6 Drift and feedback loop:** PSI/KS per feature plus ADWIN on the score stream; write `drift_reports`; `model.status` WS event shows drift state. Analyst dispositions (true/false positive) from the Alerts workbench are stored as labels and used in a **scheduled retraining job** that only promotes a model if it beats the production model on the frozen benchmark.

**Done when:** `make train` reproduces the artifacts; the benchmark table in `docs/MODEL_CARD.md` is generated, not typed; live scoring uses a model trained on the live feature schema; shadow mode works.

## Phase 5 — Detection fusion redesign
1. Replace the heuristic fusion with: calibrated stacker probability → risk score; rules act as **explicit, named evidence** (with MITRE ATT&CK mapping where it genuinely applies, e.g. T1110 brute force, T1046 discovery-like patterns against the lab target) and as hard floors only for high-confidence signatures, with the reason recorded.
2. **Per-identity adaptive baselines** (EWMA + robust quantiles, seasonality-aware if enough data) so "normal" is learned per identity and per group, with a cold-start prior and a visible "baseline maturity" indicator.
3. **Alert lifecycle:** deduplication and grouping (same identity + same pattern within a window becomes one incident that accumulates evidence), suppression windows, severity escalation/de-escalation with hysteresis (no flapping), and SLA timers. Every alert stores the model version, feature snapshot, and explanation, so it is reproducible from the evidence log.
4. Tests with recorded fixtures: benign burst does not alert; brute force alerts within N seconds; low-and-slow is caught by the unsupervised/sequence layer; no flapping across 1,000 benign windows.

## Phase 6 — Frontend foundation
1. **Tooling:** TypeScript, **React Router** (URL-addressable routes: `/overview`, `/alerts/:id`, `/identities/:id`, `/attack-console`, `/models`, `/analytics`, `/settings`, `/join`), **TanStack Query** for server state (with query-key conventions and WS-driven cache updates via `queryClient.setQueryData`), **Zustand** for UI state, **Zod** for runtime validation of WS payloads, **Recharts or visx** for standard charts and **uPlot** for high-frequency time series, **TanStack Table + virtualization** for large tables, **Radix UI primitives** (accessible dialogs, menus, tabs, tooltips), **sonner** for toasts, lucide-react icons. Remove unused deps.
2. **A realtime layer:** a single `RealtimeClient` (auto-reconnect with jittered backoff, resume by `seq`, heartbeat, connection-state store) and a `useChannel(channel, handler)` hook. **Delete every `setInterval` poll** that a WS event can replace; keep polling only as a fallback when the socket is down, and show that state.
3. **Design system** in `src/design/` with tokens as CSS variables mapped into the Tailwind `@theme`:
   - Spacing on a 4/8px scale; one type scale (e.g. 12/13/14/16/20/24/32) with tabular numerals for all metrics; **self-hosted** Inter + JetBrains Mono (`@fontsource`), no Google `@import`.
   - Semantic color tokens (surface-0/1/2, border, text-primary/secondary/muted, accent, success/warning/danger/info, plus severity colors Critical/High/Elevated/Low) with **WCAG AA contrast** verified; support dark (default) and light themes.
   - Component library: `Button`, `IconButton`, `Card`, `Stat`, `Badge`, `SeverityBadge`, `ProvenanceBadge`, `DataTable`, `Tabs`, `Tooltip`, `Dialog`, `Drawer`, `Skeleton`, `EmptyState`, `ErrorState`, `Sparkline`, `TimeSeriesChart`, `Gauge`, `KeyValueList`, `CodeBlock`, `Toast`, `ConnectionIndicator`. Document in a Storybook (or a `/design` route) with every state.
4. **App shell:** left navigation (collapsible, icons + labels, role-aware), top bar (global search/command palette via `cmdk`, connection status, threat level, time-range picker, user menu), content area with a max-width container and consistent page header (title, description, actions). Breakpoints: ≥1280 full, 768–1279 collapsed rail, <768 bottom nav / drawer. **No horizontal scroll at 360px width.** Use CSS grid with `minmax` and container queries instead of fixed pixel widths; no magic numbers.
5. **State quality:** every data view has loading (skeleton), empty, error (with retry), and stale (with "last updated" and connection state) variants. Optimistic updates for alert actions with rollback.
6. **Performance budget:** initial JS ≤ 250 KB gzipped via route-level code splitting (`React.lazy`), chart libs lazy-loaded, Lighthouse performance ≥ 90 on Overview, no layout shift from font loading, and the live tables stay at 60 fps with 10k rows (virtualized).
7. **Accessibility:** keyboard operable everywhere, visible focus, `aria-live` regions for new alerts (polite/assertive by severity), reduced-motion respected (the landing animation must honor it), color never the only signal.

## Phase 7 — Rebuild the screens on the new foundation
Split the monoliths (Overview, AlertsWorkbench, Analytics, AttackConsole) into feature folders (`src/features/<name>/{components,hooks,api}`), each page under ~200 lines of composition.
- **Overview (operator):** KPI strip (events/s, active incidents, threat level, mean time to detect, model status + drift, pipeline health), live event-rate chart with attack-window overlays, top risky identities (sortable, virtualized), live alert stream, and a provenance filter (live / replay / simulated).
- **Alerts workbench:** table with filters (severity, status, identity, scenario, time) saved in the URL, an incident drawer (timeline, evidence, per-layer scores, SHAP explanation, related alerts, raw events, hash-chain verification badge), actions (acknowledge, assign, false-positive, resolve with notes), and bulk actions.
- **Identity drilldown:** feature time series vs. baseline band, assessment history, devices/fingerprints, and linked incidents.
- **Attack console (operator):** the existing consent gate and scenario launcher, but with real progress from `attack.*` WS events, a live effect timeline, a prominent emergency-stop button always visible (never behind a scroll), and a run report (what was sent, what was detected, time-to-detect, missed windows) that can be exported as PDF or JSON.
- **Models page:** model registry table, benchmark comparison (from the stored evaluation artifacts), ROC/PR curves, reliability diagram, confusion matrix, per-scenario recall, drift status, shadow-mode results, and a promote/rollback control (operator only, audit-logged).
- **Analytics:** read from rollups; time-range picker; compare periods; export CSV.
- **Participant app (mobile-first):** join flow with the join code, a clear "what you are doing" panel, and their own live assessment with a plain-language explanation. It receives only its own channel.
- **Landing:** keep it lightweight (the current 27 KB hero animation must be lazy-loaded and skippable). Marketing polish is lower priority than the operator screens.
- **Settings:** thresholds and false-positive budget, retention, data-source toggles (host sensor opt-in), API tokens, theme, and an audit log viewer.

## Phase 8 — Security hardening
- Replace the in-memory opaque tokens with **short-lived JWT access tokens plus rotating refresh tokens** (hashed at rest, revocable); operator login with Argon2-hashed credentials (no shared default passcode), rate-limited with lockout and audit events. Role-based authorization as a FastAPI dependency (`participant`, `analyst`, `operator`, `admin`) applied to every route and WS channel; tests for every route's access matrix.
- Rate limiting (slowapi or Redis-based), request size limits, strict CORS, security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`), and input validation on every body. Secrets only from env or a secrets file; startup check.
- Run `bandit`, `pip-audit`, `npm audit` in CI and fix high findings.
- Make sure no operator-only data can reach a participant over REST or WS (add a test that logs in as a participant and tries every operator route and channel).

## Phase 9 — Quality, observability, and developer experience
- **Tests:** backend ≥ 80% coverage on `detection/`, `pipeline/`, `orchestrator/`, `identity/`; property-based tests (Hypothesis) for feature computation; frontend component tests (Vitest + Testing Library); **Playwright e2e**: join → operator login → launch bounded scenario → alert appears over WS → acknowledge → emergency stop; plus visual regression on key screens at 1440, 1024, 768, and 375 widths.
- **CI (GitHub Actions):** lint, type-check, unit, API-contract staleness check, e2e, build, Docker image build.
- **Observability:** OpenTelemetry traces, Prometheus `/metrics` (events/s, queue lag, inference latency histogram, WS connections, alert counts), a provisioned Grafana dashboard in Compose.
- **One-command run:** `docker compose up` brings up everything; `make dev` for hot-reload local dev; the Windows `start-demo.ps1` stays working.

## Phase 10 — Documentation and the demo
- Rewrite the README (architecture diagram with the data flow event → stream → features → detectors → fusion → alert → WS → UI; quick start; safety boundary; configuration).
- `docs/ARCHITECTURE.md`, `docs/WS_PROTOCOL.md`, `docs/MODEL_CARD.md` (data, protocol, metrics with CIs, limitations, ethical use), `docs/RUNBOOK.md`, `docs/DEMO_SCRIPT.md` (a 10–15 minute walkthrough that matches the assignment's Problem → Technique → Working → Result → Impact story, using only real stored metrics).

## Definition of done (whole project)
1. Restarting the backend loses no session, alert, run, or evidence data.
2. No `setInterval` polling remains where a WS event exists; the UI shows live connection state and recovers from a killed backend.
3. Opening the app from a second device on the LAN works end to end.
4. The live model is trained on the exact feature schema computed at runtime, and `docs/MODEL_CARD.md` is generated from stored artifacts, with unseen-attack and time-split results and confidence intervals.
5. Every UI number traces to a stored artifact or a live query, and every datapoint shows its provenance.
6. All safety invariant tests pass; the evidence chain verifies.
7. Layout has no horizontal scroll from 360px up, passes keyboard-only use and AA contrast, and meets the performance budget.
8. `docker compose up` followed by the Playwright suite passes from a clean clone.

**Start with Phase 0 only. Report back before touching Phase 1.**
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-10-14T23:01:03+05:30.

The user's current state is as follows:
Active Document: c:\Users\madha\Desktop\Sentinel-Flow-AI-Demo\.vscode\settings.json (LANGUAGE_JSON)
Cursor is on line: 1
Other open documents:
- c:\Users\madha\Desktop\Sentinel-Flow-AI-Demo\src\pages\Devices.jsx (LANGUAGE_JAVASCRIPT)
- c:\Users\madha\Desktop\Sentinel-Flow-AI-Demo\backend\app\detection\unsupervised_model.py (LANGUAGE_PYTHON)
- c:\Users\madha\Desktop\Sentinel-Flow-AI-Demo\backend\app\detection\supervised_model.py (LANGUAGE_PYTHON)
- c:\Users\madha\Desktop\Sentinel-Flow-AI-Demo\backend\app\identity\__init__.py (LANGUAGE_PYTHON)
- c:\Users\madha\Desktop\Sentinel-Flow-AI-Demo\backend\app\proxy\traffic_logger.py (LANGUAGE_PYTHON)
Browser State:
  Page FF349C355BE26EA1E4117CEBD08D56EA (Vantage widget) - https://vantage.csw.lenovo.com/v1/web/containerwidget/default/ [ACTIVE]
    Viewport: 64x64, Page Height: 64
</ADDITIONAL_METADATA>
<USER_SETTINGS_CHANGE>
The user changed setting `Model Selection` from Gemini 3.8 Flash (High) to Claude Opus 4.6 (Thinking). No need to comment on this change if the user doesn't ask about it. If reporting what model you are, please use a human readable name instead of the exact string.
</USER_SETTINGS_CHANGE>