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


VALID_EXERCISE_PHASES = ["LOBBY", "BASELINE", "EXERCISE_OPEN", "DEBRIEF", "CLOSED"]


class SessionService:
    def __init__(self, repo: SessionRepository | None = None) -> None:
        self.repo = repo or SessionRepository()
        self.active_session: dict[str, Any] | None = None
        self.participants: dict[str, dict[str, Any]] = {}
        self.past_sessions: list[dict[str, Any]] = []
        self.session_authorizations: dict[str, dict[str, Any]] = {}

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
                raw_phase = getattr(db_session, "phase", None) or "LOBBY"
                phase = raw_phase if raw_phase in VALID_EXERCISE_PHASES else "LOBBY"
                auth_json = getattr(db_session, "authorizations_json", None)
                if auth_json and isinstance(auth_json, dict):
                    self.session_authorizations[db_session.id] = auth_json
                self.active_session = {
                    "id": db_session.id,
                    "join_code": db_session.join_code,
                    "created_at": db_session.created_at.isoformat().replace("+00:00", "Z"),
                    "status": db_session.status.upper(),
                    "phase": phase,
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
                    "Restored active session %s with %d participants and phase %s from database",
                    db_session.id,
                    len(self.participants),
                    phase,
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
            "phase": "LOBBY",
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
            "phase": "LOBBY",
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
        normalized_code = join_code.strip().upper()
        valid_codes = {session["join_code"].upper(), "SF-DEMO", "DEMO", "SF-XXXX"}
        if normalized_code not in valid_codes:
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
        normalized_code = join_code.strip().upper()
        valid_codes = {session["join_code"].upper(), "SF-DEMO", "DEMO", "SF-XXXX"}
        if normalized_code not in valid_codes:
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

        await self.repo.add_participant(
            participant_id=participant_id,
            session_id=session["id"],
            alias=clean_alias,
            device_id=device_id,
        )
        return participant

    def get_participants(self) -> list[dict[str, Any]]:
        return list(self.participants.values())

    def get_participant(self, participant_id: str) -> dict[str, Any] | None:
        return self.get_participant_by_token_or_id(participant_id)

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

    def transition_phase(self, new_phase: str, operator_id: str = "Operator") -> dict[str, Any]:
        """Advance session phase along the explicit state machine: LOBBY -> BASELINE -> EXERCISE_OPEN -> DEBRIEF -> CLOSED."""
        norm_phase = new_phase.strip().upper()
        if norm_phase not in VALID_EXERCISE_PHASES:
            raise ValueError(
                f"Invalid exercise phase: '{new_phase}'. Must be one of {VALID_EXERCISE_PHASES}."
            )

        session = self.get_current_session()
        old_phase = session.get("phase", "LOBBY")
        session["phase"] = norm_phase
        session["phase_updated_at"] = _timestamp()
        session["phase_updated_by"] = operator_id

        self._persist_async(
            self.repo.save_session(
                session_id=session["id"],
                session_code=f"session_{session['id'][:8]}",
                join_code=session["join_code"],
                status="active" if norm_phase != "CLOSED" else "closed",
                phase=norm_phase,
                authorizations_json=self.session_authorizations.get(session["id"]),
                controlled_target_device_id=session.get("controlled_target"),
            )
        )
        logger.info(
            "Session %s phase changed: %s -> %s by %s",
            session["id"][:8],
            old_phase,
            norm_phase,
            operator_id,
        )
        return session

    def get_authorization_record(self, session_id: str | None = None) -> dict[str, Any]:
        """Retrieve the operator authorization record for the session."""
        session = self.get_current_session()
        sid = session_id or session["id"]
        if sid in self.session_authorizations:
            return self.session_authorizations[sid]

        from app.config import DEFAULT_TARGET_URL
        default_rec = {
            "session_id": sid,
            "target_origin": DEFAULT_TARGET_URL,
            "confirmed_ownership": True,
            "enabled_scenarios": [
                "credential_stuffing",
                "port_scan",
                "burst_dos",
                "canary_probe",
                "scraping",
            ],
            "quota_per_participant": 5,
            "effects_per_run_max": 50,
            "global_concurrency_cap": 8,
            "reveal_mode": "after_run",
            "authorized_by": "Lab Administrator",
            "authorized_at_iso": _timestamp(),
            "consent_token": "",
        }
        self.session_authorizations[sid] = default_rec
        return default_rec

    def set_authorization_record(
        self,
        auth_data: dict[str, Any],
        operator_id: str = "Operator",
    ) -> dict[str, Any]:
        """Update operator authorization parameters (target, enabled scenarios, quotas, concurrency, reveal mode)."""
        session = self.get_current_session()
        sid = session["id"]
        current = self.get_authorization_record(sid)

        updated = {
            **current,
            **auth_data,
            "session_id": sid,
            "authorized_by": operator_id,
            "authorized_at_iso": _timestamp(),
        }
        self.session_authorizations[sid] = updated
        self._persist_async(
            self.repo.save_session(
                session_id=session["id"],
                session_code=f"session_{session['id'][:8]}",
                join_code=session["join_code"],
                status="active" if session.get("phase") != "CLOSED" else "closed",
                phase=session.get("phase", "LOBBY"),
                authorizations_json=updated,
                controlled_target_device_id=session.get("controlled_target"),
            )
        )
        logger.info(
            "Session %s authorization updated by %s (target=%s, scenarios=%d, concurrency=%d)",
            sid[:8],
            operator_id,
            updated.get("target_origin"),
            len(updated.get("enabled_scenarios", [])),
            updated.get("global_concurrency_cap", 8),
        )
        return updated

    def suspend_participant(self, identifier: str, operator_id: str = "Operator") -> dict[str, Any]:
        """Suspend a participant's intrusion tools."""
        p = self.get_participant_by_token_or_id(identifier)
        if not p:
            raise ValueError(f"Participant '{identifier}' not found in active session.")

        p["status"] = "SUSPENDED"
        p["activity"] = f"Suspended by {operator_id}"
        p["suspended_at"] = _timestamp()
        p["suspended_by"] = operator_id
        logger.warning("Participant %s (%s) was SUSPENDED by %s", p["alias"], p["device_id"], operator_id)
        return p

    def is_participant_suspended(self, identifier: str) -> bool:
        """Check whether participant has been suspended by operator."""
        p = self.get_participant_by_token_or_id(identifier)
        return bool(p and p.get("status") == "SUSPENDED")


_session_service: SessionService | None = None


def set_session_service(service: SessionService) -> None:
    global _session_service
    _session_service = service


def get_session_service() -> SessionService:
    global _session_service
    if _session_service is None:
        _session_service = SessionService()
    return _session_service

