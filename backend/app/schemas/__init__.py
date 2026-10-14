"""API v1 and WebSocket Pydantic schema package."""

from .envelope import ErrorDetail, ErrorEnvelope, SuccessResponse
from .sessions import (
    ActivityRequest,
    ControlledTargetRequest,
    CreateSessionRequest,
    JoinSessionRequest,
    ParticipantModel,
    ReplayEventRequest,
    SessionModel,
)
from .detection import (
    AlertDispositionRequest,
    AlertModel,
    ChainVerifyResponse,
    DetectionStatusResponse,
)
from .orchestrator import (
    AttackRunModel,
    ConsentResponse,
    EmergencyStopResponse,
    GrantConsentRequest,
    StartRunRequest,
)
from .ws import (
    WsClientMessage,
    WsEnvelope,
    WsTicketRequest,
    WsTicketResponse,
)

__all__ = [
    "ErrorDetail",
    "ErrorEnvelope",
    "SuccessResponse",
    "CreateSessionRequest",
    "SessionModel",
    "JoinSessionRequest",
    "ParticipantModel",
    "ControlledTargetRequest",
    "ActivityRequest",
    "ReplayEventRequest",
    "AlertDispositionRequest",
    "AlertModel",
    "DetectionStatusResponse",
    "ChainVerifyResponse",
    "StartRunRequest",
    "AttackRunModel",
    "GrantConsentRequest",
    "ConsentResponse",
    "EmergencyStopResponse",
    "WsTicketRequest",
    "WsTicketResponse",
    "WsEnvelope",
    "WsClientMessage",
]
