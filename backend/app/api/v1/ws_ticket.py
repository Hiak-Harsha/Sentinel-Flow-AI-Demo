from fastapi import APIRouter, Depends, HTTPException, Request

from app.auth.dependencies import UserContext, get_current_user
from app.auth.security import verify_operator_passcode
from app.config import OPERATOR_PASSCODE
from app.schemas.ws import WsTicketRequest, WsTicketResponse

router = APIRouter(prefix="/ws", tags=["WebSocket Tickets"])


@router.post("/ticket", response_model=WsTicketResponse, summary="Issue a short-lived ticket for WebSocket connection authentication")
async def issue_ws_ticket(
    request: Request,
    body: WsTicketRequest,
    user: UserContext = Depends(get_current_user),
) -> WsTicketResponse:
    if body.role == "operator":
        is_operator = False
        if user.authenticated and user.role in ("operator", "admin"):
            is_operator = True
        elif body.passcode and verify_operator_passcode(body.passcode):
            is_operator = True

        if not is_operator:
            raise HTTPException(status_code=403, detail="Invalid operator passcode or insufficient role.")

    ws_mgr = request.app.state.ws_manager
    ticket = ws_mgr.create_ticket(role=body.role, identity_id=body.identity_id)

    return WsTicketResponse(
        ticket=ticket,
        role=body.role,
        identity_id=body.identity_id,
        expires_in=300,
    )
