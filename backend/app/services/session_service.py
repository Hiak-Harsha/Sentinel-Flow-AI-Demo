"""Session and participant management service for Sentinel Flow."""

from __future__ import annotations

import random
import string
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.config import MAX_PARTICIPANTS


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _generate_join_code() -> str:
    chars = string.ascii_uppercase + string.digits
    chars = chars.replace("O", "").replace("0", "").replace("I", "").replace("1", "")
    part1 = "".join(random.choices(chars, k=2))
    part2 = "".join(random.choices(chars, k=2))
    return f"SF-{part1}{part2}"


class SessionService:
    def __init__(self) -> None:
        self.active_session: dict[str, Any] | None = None
        self.participants: dict[str, dict[str, Any]] = {}
        self.past_sessions: list[dict[str, Any]] = []

    def create_session(self) -> dict[str, Any]:
        """Create a new temporary classroom demonstration session."""
        if self.active_session:
            # Archive previous active session
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
        now = _timestamp()

        participant = {
            "id": str(uuid4()),
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
            # Fallback to first participant or demo device
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
        return p

    def set_controlled_target(self, device_id: str | None) -> None:
        if self.active_session:
            self.active_session["controlled_target"] = device_id
            self.active_session["controlled_target_device"] = device_id
            self.active_session["phase"] = "CONTROLLED_TEST_ACTIVE" if device_id else "NORMAL_MONITORING"


    def archive_current_session(self) -> None:
        if self.active_session:
            session_summary = {
                **self.active_session,
                "participants_count": len(self.participants),
                "closed_at": _timestamp(),
            }
            self.past_sessions.append(session_summary)
            if len(self.past_sessions) > 20:
                self.past_sessions.pop(0)

    def get_history(self) -> list[dict[str, Any]]:
        return list(reversed(self.past_sessions))
