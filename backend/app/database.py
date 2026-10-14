"""SQLite store for tamper-evident, privacy-minimised evidence events, alerts, and lab runs."""

from __future__ import annotations

import hashlib
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"


class EventStore:
    """Tamper-evident cryptographically hash-chained event and alert store."""

    def __init__(self, database_path: Path | str = ":memory:") -> None:
        self.database_path = str(database_path)
        self._shared_conn: sqlite3.Connection | None = None
        if self.database_path == ":memory:":
            self._shared_conn = sqlite3.connect(":memory:", check_same_thread=False, timeout=30.0)
            self._shared_conn.row_factory = sqlite3.Row
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        if self._shared_conn is not None:
            return self._shared_conn
        connection = sqlite3.connect(self.database_path, check_same_thread=False, timeout=30.0)
        connection.row_factory = sqlite3.Row
        try:
            connection.execute("PRAGMA journal_mode = WAL;")
            connection.execute("PRAGMA busy_timeout = 30000;")
        except Exception:
            pass
        return connection

    def _initialize(self) -> None:
        with self._connect() as conn:
            # 1. Tamper-evident evidence ledger (cryptographic hash chain)
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS evidence_events (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    schema_version TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    correlation_id TEXT NOT NULL,
                    source TEXT NOT NULL,
                    actor_principal TEXT NOT NULL,
                    target_service TEXT NOT NULL,
                    payload_hash TEXT NOT NULL,
                    prev_hash TEXT NOT NULL,
                    integrity_hash TEXT NOT NULL,
                    metadata_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_evidence_session_time
                ON evidence_events (session_id, created_at DESC)
                """
            )

            # 2. Alerts lifecycle & disposition store
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS security_alerts (
                    alert_id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    rule_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    identity_id TEXT NOT NULL,
                    threat_score REAL NOT NULL,
                    disposition TEXT NOT NULL,
                    analyst_notes TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    evidence_json TEXT NOT NULL
                )
                """
            )

            # 3. Lab Run records
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS lab_runs (
                    run_id TEXT PRIMARY KEY,
                    scenario TEXT NOT NULL,
                    target_origin TEXT NOT NULL,
                    launched_by TEXT NOT NULL,
                    status TEXT NOT NULL,
                    duration_seconds INTEGER NOT NULL,
                    quota_requests INTEGER NOT NULL,
                    executed_requests INTEGER NOT NULL,
                    ground_truth_assertion TEXT,
                    created_at TEXT NOT NULL,
                    completed_at TEXT
                )
                """
            )

            # 4. Operator Authorizations
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS operator_authorizations (
                    auth_id TEXT PRIMARY KEY,
                    operator_name TEXT NOT NULL,
                    target_boundary TEXT NOT NULL,
                    issued_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    max_quota INTEGER NOT NULL,
                    raw_record_json TEXT NOT NULL
                )
                """
            )

    def _get_latest_hash(self, conn: sqlite3.Connection) -> str:
        row = conn.execute(
            "SELECT integrity_hash FROM evidence_events ORDER BY rowid DESC LIMIT 1"
        ).fetchone()
        return row["integrity_hash"] if row else GENESIS_HASH

    def record_event(
        self,
        *,
        event_type: str,
        session_id: str = "default_session",
        source: str = "lab-sensor",
        actor_principal: str | None = None,
        identity_id: str | None = None,
        target_service: str = "lab-target",
        correlation_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        evidence_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Record an immutable evidence event with cryptographic SHA-256 forward chaining."""
        event_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        corr_id = correlation_id or str(uuid.uuid4())
        principal = actor_principal or identity_id or "anonymous"
        meta = metadata if metadata is not None else (evidence_payload or {})
        meta_str = json.dumps(meta, sort_keys=True, separators=(",", ":"))
        payload_hash = hashlib.sha256(meta_str.encode("utf-8")).hexdigest()

        with self._connect() as conn:
            prev_hash = self._get_latest_hash(conn)

            # Compute integrity hash chaining prev_hash + canonical fields
            chain_preimage = f"{prev_hash}|{event_id}|{session_id}|{event_type}|{created_at}|{principal}|{payload_hash}"
            integrity_hash = hashlib.sha256(chain_preimage.encode("utf-8")).hexdigest()

            conn.execute(
                """
                INSERT INTO evidence_events
                (id, session_id, schema_version, event_type, created_at, correlation_id,
                 source, actor_principal, target_service, payload_hash, prev_hash, integrity_hash, metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    session_id,
                    "1.0.0",
                    event_type,
                    created_at,
                    corr_id,
                    source,
                    principal,
                    target_service,
                    payload_hash,
                    prev_hash,
                    integrity_hash,
                    meta_str,
                ),
            )

        return {
            "id": event_id,
            "session_id": session_id,
            "event_type": event_type,
            "created_at": created_at,
            "correlation_id": corr_id,
            "source": source,
            "actor_principal": actor_principal,
            "target_service": target_service,
            "payload_hash": payload_hash,
            "prev_hash": prev_hash,
            "integrity_hash": integrity_hash,
            "metadata": meta,
        }

    def verify_chain_integrity(self) -> dict[str, Any]:
        """Verify complete cryptographic SHA-256 chain across all stored events."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, session_id, event_type, created_at, actor_principal, payload_hash, prev_hash, integrity_hash FROM evidence_events ORDER BY rowid ASC"
            ).fetchall()

        if not rows:
            return {
                "valid": True,
                "chain_valid": True,
                "total_events": 0,
                "chain_tail_hash": GENESIS_HASH,
                "latest_integrity_hash": GENESIS_HASH,
                "verified_at": datetime.now(timezone.utc).isoformat(),
            }

        expected_prev = GENESIS_HASH
        for idx, row in enumerate(rows):
            if row["prev_hash"] != expected_prev:
                return {
                    "valid": False,
                    "chain_valid": False,
                    "failed_at_index": idx,
                    "corrupted_at_index": idx,
                    "event_id": row["id"],
                    "reason": f"Hash broken at block {idx}: expected prev {expected_prev}, found {row['prev_hash']}",
                }

            chain_preimage = f"{row['prev_hash']}|{row['id']}|{row['session_id']}|{row['event_type']}|{row['created_at']}|{row['actor_principal']}|{row['payload_hash']}"
            computed_integrity = hashlib.sha256(chain_preimage.encode("utf-8")).hexdigest()
            if computed_integrity != row["integrity_hash"]:
                return {
                    "valid": False,
                    "chain_valid": False,
                    "failed_at_index": idx,
                    "corrupted_at_index": idx,
                    "event_id": row["id"],
                    "reason": f"Tampered block {idx}: stored {row['integrity_hash']} does not match computed {computed_integrity}",
                }

            expected_prev = row["integrity_hash"]

        return {
            "valid": True,
            "chain_valid": True,
            "total_events": len(rows),
            "chain_tail_hash": expected_prev,
            "latest_integrity_hash": expected_prev,
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }

    def list_recent_events(self, limit: int = 50, session_id: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if session_id:
                rows = conn.execute(
                    "SELECT * FROM evidence_events WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
                    (session_id, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM evidence_events ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                ).fetchall()

        events = []
        for r in rows:
            events.append({
                "id": r["id"],
                "session_id": r["session_id"],
                "schema_version": r["schema_version"],
                "event_type": r["event_type"],
                "created_at": r["created_at"],
                "correlation_id": r["correlation_id"],
                "source": r["source"],
                "actor_principal": r["actor_principal"],
                "target_service": r["target_service"],
                "payload_hash": r["payload_hash"],
                "prev_hash": r["prev_hash"],
                "integrity_hash": r["integrity_hash"],
                "metadata": json.loads(r["metadata_json"]),
            })
        return events

    # --- Alerts Lifecycle ---
    def save_alert(self, alert: dict[str, Any]) -> None:
        alert_id = alert.get("id") or alert.get("alert_id") or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO security_alerts
                (alert_id, session_id, rule_id, name, severity, identity_id, threat_score,
                 disposition, analyst_notes, created_at, updated_at, evidence_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    alert_id,
                    alert.get("session_id", "current"),
                    alert.get("rule_id", "ANOMALY"),
                    alert.get("name", "Security Alert"),
                    alert.get("severity", "HIGH"),
                    alert.get("identity_id", "unknown"),
                    float(alert.get("threat_score", 0.8)),
                    alert.get("disposition", "NEW"),
                    alert.get("analyst_notes", ""),
                    alert.get("created_at", now),
                    now,
                    json.dumps(alert.get("evidence", {}), separators=(",", ":")),
                ),
            )

    def update_alert_disposition(self, alert_id: str, disposition: str, notes: str = "") -> bool:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            cur = conn.execute(
                """
                UPDATE security_alerts
                SET disposition = ?, analyst_notes = ?, updated_at = ?
                WHERE alert_id = ?
                """,
                (disposition, notes, now, alert_id),
            )
            return cur.rowcount > 0

    def list_alerts(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM security_alerts ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        alerts = []
        for r in rows:
            alerts.append({
                "alert_id": r["alert_id"],
                "id": r["alert_id"],
                "session_id": r["session_id"],
                "rule_id": r["rule_id"],
                "name": r["name"],
                "severity": r["severity"],
                "identity_id": r["identity_id"],
                "threat_score": r["threat_score"],
                "disposition": r["disposition"],
                "analyst_notes": r["analyst_notes"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "evidence": json.loads(r["evidence_json"]) if r["evidence_json"] else {},
            })
        return alerts

    # --- Lab Runs ---
    def save_lab_run(self, run_data: dict[str, Any]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO lab_runs
                (run_id, scenario, target_origin, launched_by, status,
                 duration_seconds, quota_requests, executed_requests,
                 ground_truth_assertion, created_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_data.get("run_id") or str(uuid.uuid4()),
                    run_data.get("scenario", "unknown"),
                    run_data.get("target_origin", "http://127.0.0.1:8000/lab-target"),
                    run_data.get("launched_by", "operator"),
                    run_data.get("status", "COMPLETED"),
                    int(run_data.get("duration_seconds", 0)),
                    int(run_data.get("quota_requests", 0)),
                    int(run_data.get("executed_requests", 0)),
                    run_data.get("ground_truth_assertion", ""),
                    run_data.get("created_at", now),
                    run_data.get("completed_at", now),
                ),
            )

    def list_lab_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM lab_runs ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(r) for r in rows]

