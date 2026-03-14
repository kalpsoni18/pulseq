from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import get_current_user
from ..models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class MeResponse(BaseModel):
    uid: str
    email: str
    org_id: str | None
    role: str


@router.get("/me", response_model=MeResponse)
async def me(user: User = Depends(get_current_user)):
    """
    Returns the currently authenticated user's profile.
    Use this right after login to check if they have an org yet.
    """
    return MeResponse(
        uid=user.firebase_uid,
        email=user.email,
        org_id=user.org_id,
        role=user.role,
    )
