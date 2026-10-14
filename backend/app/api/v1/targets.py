"""Target inventory, private network allowlist, and authorization endpoints."""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import OPERATOR_PASSCODE

router = APIRouter(prefix="/targets", tags=["Targets & Allowlist"])


class AuthorizeTargetRequest(BaseModel):
    operator_passcode: str
    target_origin: str
    operator_name: str = "Lab Administrator"
    purpose: str = "Classroom SOC Training"
    confirmed_ownership: bool = True
    max_quota: int = 50


@router.get("", summary="Get target origins and current target inventory")
async def list_targets(request: Request) -> dict[str, Any]:
    allowlist = request.app.state.allowlist
    return {
        "allowed_origins": list(allowlist.origins),
        "target_inventory": getattr(allowlist, "target_inventory", []),
        "authorization_record": getattr(allowlist, "authorization_record", {}),
    }


@router.post("/authorize", summary="Add new authorized target origin to private network boundary")
async def authorize_target(request: Request, body: AuthorizeTargetRequest) -> dict[str, Any]:
    if body.operator_passcode != OPERATOR_PASSCODE:
        raise HTTPException(status_code=403, detail="Invalid operator passcode.")

    allowlist = request.app.state.allowlist
    consent_gate = request.app.state.run_manager.consent_gate

    try:
        allowlist.add_target(
            target_origin=body.target_origin,
            operator_name=body.operator_name,
            purpose=body.purpose,
            confirmed_ownership=body.confirmed_ownership,
            max_quota=body.max_quota,
        )
        consent_gate.grant_consent(
            target_origin=body.target_origin,
            operator_name=body.operator_name,
            confirmed_ownership=body.confirmed_ownership,
        )
        return {
            "status": "ok",
            "message": f"Target '{body.target_origin}' successfully authorized.",
            "allowed_origins": list(allowlist.origins),
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
