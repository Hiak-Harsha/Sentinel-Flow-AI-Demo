"""WebSocket ticket generation endpoint for secure authenticated socket connections."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from app.config import OPERATOR_PASSCODE
from app.schemas.ws import WsTicketRequest, WsTicketResponse

router = APIRouter(prefix="/ws", tags=["WebSocket Tickets"])


@router.post("/ticket", response_model=WsTicketResponse, summary="Issue a short-lived ticket for WebSocket connection authentication")
async def issue_ws_ticket(request: Request, body: WsTicketRequest) -> WsTicketResponse:
    if body.role == "operator":
        if body.passcode != OPERATOR_PASSCODE:
            raise HTTPException(status_code=403, detail="Invalid operator passcode.")

    ws_mgr = request.app.state.ws_manager
    ticket = ws_mgr.create_ticket(role=body.role, identity_id=body.identity_id)

    return WsTicketResponse(
        ticket=ticket,
        role=body.role,
        identity_id=body.identity_id,
        expires_in=300,
    )
