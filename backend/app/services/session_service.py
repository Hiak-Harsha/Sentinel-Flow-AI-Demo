"""Session and participant management service with database persistence for Sentinel Flow."""

from __future__ import annotations

import asyncio
import logging
import random
import secrets
import string
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.config import MAX_PARTICIPANTS
from app.repositories.session_repo import SessionRepository

logger = logging.getLogger("sentinel_flow.services.sessions")


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _generate_join_code() -> str:
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace("O", "").replace("0", "").replace("I", "").replace("1", "")
    part1 = "".join(secrets.choice(chars) for _ in range(2))
    part2 = "".join(secrets.choice(chars) for _ in range(2))
    return f"SF-{part1}{part2}"


class SessionService:
    def __init__(self, repo: SessionRepository | None = None) -> None:
        self.repo = repo or SessionRepository()
        self.active_session: dict[str, Any] | None = None
        self.participants: dict[str, dict[str, Any]] = {}
        self.past_sessions: list[dict[str, Any]] = []

    def _persist_async(self, coro) -> None:
        """Schedule a database write task if an event loop is running."""
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(coro)
        except RuntimeError:
            # Running in non-async environment (e.g. sync unit test without loop)
            try:
                asyncio.run(coro)
            except Exception as e:
                logger.debug("Failed running sync persistence fallback: %s", e)

    async def load_from_db(self) -> None:
        """Hydrate active session and participants from database on startup."""
        try:
            db_session = await self.repo.get_active_session()
            if db_session:
                self.active_session = {
                    "id": db_session.id,
                    "join_code": db_session.join_code,
                    "created_at": db_session.created_at.isoformat().replace("+00:00", "Z"),
                    "status": db_session.status.upper(),
                    "phase": "WAITING_FOR_USERS" if not db_session.participants else "BASELINE_COLLECTION",
                    "threat_level": "LOW",
                    "controlled_target": db_session.controlled_target_device_id,
                    "controlled_target_device": db_session.controlled_target_device_id,
                }
                self.participants = {}
                for p in db_session.participants:
                    self.participants[p.id] = {
                        "id": p.id,
                        "token": p.id,
                        "session_id": db_session.id,
                        "device_id": p.device_id,
                        "alias": p.alias,
                        "joined_at": p.joined_at.isoformat().replace("+00:00", "Z"),
                        "last_seen": p.last_seen_at.isoformat().replace("+00:00", "Z"),
                        "status": "ONLINE",
                        "activity": "Active",
                        "request_count": 1,
                        "anomaly_score": 0.12,
                        "state": "NORMAL",
                    }
                logger.info(
                    "Restored active session %s with %d participants from database",
                    db_session.id,
                    len(self.participants),
                )
        except Exception:
            logger.exception("Failed loading session state from database")

    def create_session(self) -> dict[str, Any]:
        """Create a new temporary classroom demonstration session."""
        if self.active_session:
            self.archive_current_session()

        session_id = str(uuid4())
        join_code = _generate_join_code()
        now = _timestamp()

        self.active_session = {
            "id": session_id,
            "join_code": join_code,
            "created_at": now,
            "status": "MONITORING",
            "phase": "WAITING_FOR_USERS",
            "threat_level": "LOW",
            "controlled_target": None,
            "controlled_target_device": None,
        }
        self.participants = {}

        self._persist_async(
            self.repo.save_session(
                session_id=session_id,
                session_code=f"session_{session_id[:8]}",
                join_code=join_code,
                status="active",
            )
        )
        return self.active_session

    async def create_session_async(self) -> dict[str, Any]:
        """Create a new session and await database persistence."""
        if self.active_session:
            old_id = self.active_session["id"]
            self.archive_current_session()
            try:
                await self.repo.close_session(old_id)
            except Exception:
                pass

        session_id = str(uuid4())
        join_code = _generate_join_code()
        now = _timestamp()

        self.active_session = {
            "id": session_id,
            "join_code": join_code,
            "created_at": now,
            "status": "MONITORING",
            "phase": "WAITING_FOR_USERS",
            "threat_level": "LOW",
            "controlled_target": None,
            "controlled_target_device": None,
        }
        self.participants = {}

        await self.repo.save_session(
            session_id=session_id,
            session_code=f"session_{session_id[:8]}",
            join_code=join_code,
            status="active",
        )
        return self.active_session

    def get_current_session(self) -> dict[str, Any]:
        """Return the current active session or create one if none exists."""
        if not self.active_session:
            return self.create_session()
        return self.active_session

    def join_participant(self, join_code: str, alias: str) -> dict[str, Any]:
        """Allow a student or audience member to join via join code and display name."""
        clean_alias = " ".join(alias.split()).strip()
        if not clean_alias:
            raise ValueError("Display name cannot be empty.")
        if len(clean_alias) > 32:
            raise ValueError("Display name cannot exceed 32 characters.")

        session = self.get_current_session()
        if session["join_code"].upper() != join_code.strip().upper():
            raise ValueError(f"Invalid session code. Expected code like '{session['join_code']}'.")

        if len(self.participants) >= MAX_PARTICIPANTS:
            raise ValueError(f"Session capacity reached ({MAX_PARTICIPANTS} participants max).")

        device_num = len(self.participants) + 1
        device_id = f"Device-{device_num:02d}"
        token = str(uuid4())
        participant_id = str(uuid4())
        now = _timestamp()

        participant = {
            "id": participant_id,
            "token": token,
            "session_id": session["id"],
            "device_id": device_id,
            "alias": clean_alias,
            "joined_at": now,
            "last_seen": now,
            "status": "ONLINE",
            "activity": "Joined session",
            "request_count": 1,
            "anomaly_score": 0.12,
            "state": "NORMAL",
        }

        self.participants[participant["id"]] = participant
        if session["phase"] == "WAITING_FOR_USERS":
            session["phase"] = "BASELINE_COLLECTION"

        self._persist_async(
            self.repo.add_participant(
                participant_id=participant_id,
                session_id=session["id"],
                alias=clean_alias,
                device_id=device_id,
            )
        )

        return participant

    async def join_participant_async(self, join_code: str, alias: str) -> dict[str, Any]:
        """Join participant and await database persistence."""
        clean_alias = " ".join(alias.split()).strip()
        if not clean_alias:
            raise ValueError("Display name cannot be empty.")
        if len(clean_alias) > 32:
            raise ValueError("Display name cannot exceed 32 characters.")

        session = self.get_current_session()
        if session["join_code"].upper() != join_code.strip().upper():
            raise ValueError(f"Invalid session code. Expected code like '{session['join_code']}'.")

        if len(self.participants) >= MAX_PARTICIPANTS:
            raise ValueError(f"Session capacity reached ({MAX_PARTICIPANTS} participants max).")

        device_num = len(self.participants) + 1
        device_id = f"Device-{device_num:02d}"
        token = str(uuid4())
        participant_id = str(uuid4())
        now = _timestamp()

        participant = {
            "id": participant_id,
            "token": token,
            "session_id": session["id"],
            "device_id": device_id,
            "alias": clean_alias,
            "joined_at": now,
            "last_seen": now,
            "status": "ONLINE",
            "activity": "Joined session",
            "request_count": 1,
            "anomaly_score": 0.12,
            "state": "NORMAL",
        }

        self.participants[participant["id"]] = participant
        if session["phase"] == "WAITING_FOR_USERS":
            session["phase"] = "BASELINE_COLLECTION"

        await self.repo.add_participant(
            participant_id=participant_id,
            session_id=session["id"],
            alias=clean_alias,
            device_id=device_id,
        )
        return participant

    def get_participants(self) -> list[dict[str, Any]]:
        return list(self.participants.values())

    def get_participant_by_token_or_id(self, identifier: str) -> dict[str, Any] | None:
        for p in self.participants.values():
            if p["id"] == identifier or p["token"] == identifier or p["device_id"] == identifier:
                return p
        return None

    def record_participant_activity(self, identifier: str, action: str) -> dict[str, Any]:
        p = self.get_participant_by_token_or_id(identifier)
        if not p:
            if self.participants:
                p = next(iter(self.participants.values()))
            else:
                return {
                    "device_id": "Device-01",
                    "alias": "Demo Device",
                    "action": action,
                    "timestamp": _timestamp(),
                }

        p["request_count"] += 1
        p["last_seen"] = _timestamp()
        p["activity"] = action

        self._persist_async(self.repo.update_participant_last_seen(p["id"]))
        return p

    def set_controlled_target(self, device_id: str | None) -> None:
        if self.active_session:
            self.active_session["controlled_target"] = device_id
            self.active_session["controlled_target_device"] = device_id
            self.active_session["phase"] = "CONTROLLED_TEST_ACTIVE" if device_id else "NORMAL_MONITORING"
            self._persist_async(
                self.repo.save_session(
                    session_id=self.active_session["id"],
                    session_code=f"session_{self.active_session['id'][:8]}",
                    join_code=self.active_session["join_code"],
                    status="active",
                    controlled_target_device_id=device_id,
                )
            )

    def archive_current_session(self) -> None:
        if self.active_session:
            session_id = self.active_session["id"]
            session_summary = {
                **self.active_session,
                "participants_count": len(self.participants),
                "closed_at": _timestamp(),
            }
            self.past_sessions.append(session_summary)
            if len(self.past_sessions) > 20:
                self.past_sessions.pop(0)

            self._persist_async(self.repo.close_session(session_id))

    def get_history(self) -> list[dict[str, Any]]:
        return list(reversed(self.past_sessions))
