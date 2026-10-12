"""Small SQLite store for replayable, privacy-minimised demo events."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


class EventStore:
    """Stores only aliases and aggregate metadata - never IPs or payload bodies."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS demo_events (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_demo_events_session_time
                ON demo_events (session_id, created_at DESC)
                """
            )

    def save(self, event: dict[str, Any]) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO demo_events
                (id, session_id, event_type, created_at, payload_json)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    event["id"],
                    event["session_id"],
                    event["event_type"],
                    event["created_at"],
                    json.dumps(event, separators=(",", ":")),
                ),
            )

    def list_recent(self, limit: int = 40) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT payload_json FROM demo_events
                ORDER BY created_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [json.loads(row["payload_json"]) for row in reversed(rows)]
