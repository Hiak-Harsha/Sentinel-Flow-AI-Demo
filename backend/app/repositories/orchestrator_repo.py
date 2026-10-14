"""Database repository for attack runs, effects, consents, authorizations, and cryptographic evidence."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models.models_registry import DriftReportModel, ModelRegistryModel
from app.db.models.orchestrator import (
    AttackEffectModel,
    AttackRunModel,
    AuthorizationModel,
    ConsentModel,
    EvidenceEventModel,
)
from app.db.session import get_session

logger = logging.getLogger("sentinel_flow.repositories.orchestrator")

GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000"


class OrchestratorRepository:
    """Manages database persistence for red-team runs, consent gates, and cryptographic evidence chains."""

    async def save_attack_run(
        self,
        run_id: str,
        scenario: str,
        target_origin: str,
        status: str = "running",
        launched_by: str = "operator",
        requests_sent: int = 0,
        errors: int = 0,
        peak_rps: float = 0.0,
        summary_json: dict[str, Any] | None = None,
        completed_at: datetime | None = None,
    ) -> AttackRunModel:
        """Create or update an attack execution run."""
        async with get_session() as session:
            stmt = select(AttackRunModel).where(AttackRunModel.run_id == run_id)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()

            if record is None:
                record = AttackRunModel(
                    run_id=run_id,
                    scenario=scenario,
                    target_origin=target_origin,
                    status=status,
                    launched_by=launched_by,
                    requests_sent=requests_sent,
                    errors=errors,
                    peak_rps=peak_rps,
                    summary_json=summary_json,
                    started_at=datetime.now(timezone.utc),
                    completed_at=completed_at,
                )
                session.add(record)
            else:
                record.status = status
                record.requests_sent = requests_sent
                record.errors = errors
                record.peak_rps = peak_rps
                if summary_json:
                    record.summary_json = summary_json
                if completed_at:
                    record.completed_at = completed_at

            await session.flush()
            return record

    async def log_attack_effect(
        self,
        run_id: str,
        path: str,
        status_code: int = 200,
        latency_ms: float = 0.0,
        is_error: bool = False,
        effect_type: str = "probe",
    ) -> AttackEffectModel:
        """Store individual request telemetry during attack."""
        async with get_session() as session:
            effect = AttackEffectModel(
                run_id=run_id,
                path=path,
                status_code=status_code,
                latency_ms=latency_ms,
                is_error=is_error,
                effect_type=effect_type,
                ts=datetime.now(timezone.utc),
            )
            session.add(effect)
            await session.flush()
            return effect

    async def save_consent(
        self,
        consent_token: str,
        target_origin: str,
        operator_name: str,
        purpose: str,
        max_quota: int = 50,
    ) -> ConsentModel:
        """Store ownership consent gate record."""
        async with get_session() as session:
            record = ConsentModel(
                consent_token=consent_token,
                target_origin=target_origin,
                operator_name=operator_name,
                purpose=purpose,
                max_quota=max_quota,
                confirmed_ownership=True,
                granted_at=datetime.now(timezone.utc),
            )
            session.add(record)
            await session.flush()
            return record

    async def get_consent(self, consent_token: str) -> ConsentModel | None:
        """Retrieve consent by token."""
        async with get_session() as session:
            stmt = select(ConsentModel).where(ConsentModel.consent_token == consent_token)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def save_authorization(
        self,
        origin: str,
        operator_name: str,
        purpose: str,
        max_quota: int = 50,
    ) -> AuthorizationModel:
        """Store or update target allowlist authorization."""
        async with get_session() as session:
            stmt = select(AuthorizationModel).where(AuthorizationModel.origin == origin)
            result = await session.execute(stmt)
            record = result.scalar_one_or_none()

            if record is None:
                record = AuthorizationModel(
                    origin=origin,
                    operator_name=operator_name,
                    purpose=purpose,
                    max_quota=max_quota,
                    confirmed_ownership=True,
                )
                session.add(record)
            else:
                record.operator_name = operator_name
                record.purpose = purpose
                record.max_quota = max_quota

            await session.flush()
            return record

    async def get_authorization(self, origin: str) -> AuthorizationModel | None:
        """Retrieve target authorization certificate."""
        async with get_session() as session:
            stmt = select(AuthorizationModel).where(AuthorizationModel.origin == origin)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    async def append_evidence_event(
        self,
        event_type: str,
        actor_principal: str,
        target_service: str = "lab-target",
        session_id: str = "default_session",
        source: str = "lab-sensor",
        correlation_id: str | None = None,
        metadata_json: dict[str, Any] | None = None,
    ) -> EvidenceEventModel:
        """Append a cryptographically chained, tamper-evident log entry."""
        import uuid
        event_id = str(uuid.uuid4())
        created_at_dt = datetime.now(timezone.utc)
        created_at = created_at_dt.isoformat()
        corr_id = correlation_id or str(uuid.uuid4())
        meta = metadata_json or {}
        meta_str = json.dumps(meta, sort_keys=True, separators=(",", ":"))
        payload_hash = hashlib.sha256(meta_str.encode("utf-8")).hexdigest()

        async with get_session() as session:
            stmt = select(EvidenceEventModel).order_by(EvidenceEventModel.created_at.desc()).limit(1)
            res = await session.execute(stmt)
            last_event = res.scalar_one_or_none()

            prev_hash = last_event.integrity_hash if last_event else GENESIS_HASH

            chain_preimage = f"{prev_hash}|{event_id}|{session_id}|{event_type}|{created_at}|{actor_principal}|{payload_hash}"
            integrity_hash = hashlib.sha256(chain_preimage.encode("utf-8")).hexdigest()

            record = EvidenceEventModel(
                id=event_id,
                session_id=session_id,
                schema_version="1.0.0",
                event_type=event_type,
                correlation_id=corr_id,
                source=source,
                actor_principal=actor_principal,
                target_service=target_service,
                payload_hash=payload_hash,
                prev_hash=prev_hash,
                integrity_hash=integrity_hash,
                metadata_json=meta,
                created_at=created_at_dt,
            )
            session.add(record)
            await session.flush()
            return record

    async def verify_evidence_chain(self) -> tuple[bool, str]:
        """Verify the cryptographic integrity of the entire evidence log."""
        async with get_session() as session:
            stmt = select(EvidenceEventModel).order_by(EvidenceEventModel.created_at.asc())
            result = await session.execute(stmt)
            events = list(result.scalars().all())

            if not events:
                return True, "Evidence ledger is empty (genesis)."

            expected_prev = GENESIS_HASH
            for event in events:
                if event.prev_hash != expected_prev:
                    return False, f"Broken chain at event {event.id}: prev_hash mismatch."

                created_at = event.created_at.isoformat() if hasattr(event.created_at, "isoformat") else str(event.created_at)
                meta_str = json.dumps(event.metadata_json or {}, sort_keys=True, separators=(",", ":"))
                computed_payload_hash = hashlib.sha256(meta_str.encode("utf-8")).hexdigest()
                if computed_payload_hash != event.payload_hash:
                    return False, f"Tampered record payload at event {event.id}: payload_hash mismatch."

                chain_preimage = f"{event.prev_hash}|{event.id}|{event.session_id}|{event.event_type}|{created_at}|{event.actor_principal}|{event.payload_hash}"
                computed_integrity = hashlib.sha256(chain_preimage.encode("utf-8")).hexdigest()
                if computed_integrity != event.integrity_hash:
                    return False, f"Tampered record at event {event.id}: integrity_hash mismatch."

                expected_prev = event.integrity_hash

            return True, f"Verified {len(events)} cryptographic evidence records successfully."
