from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from ..auth import get_current_user_require_org
from ..database import get_db
from ..models import User

router = APIRouter(prefix="/users", tags=["users"])


class UserResponse(BaseModel):
    id: str
    email: str
    role: str
    org_id: str | None

    class Config:
        from_attributes = True


@router.get("/", response_model=list[UserResponse])
async def list_users(
    user: User = Depends(get_current_user_require_org),
    db: AsyncSession = Depends(get_db),
):
    """Lists all users in the current user's org. Org-isolated."""
    result = await db.execute(
        select(User).where(User.org_id == user.org_id, User.is_active)
    )
    return result.scalars().all()


@router.delete("/{user_id}", status_code=204)
async def remove_user(
    user_id: str,
    current_user: User = Depends(get_current_user_require_org),
    db: AsyncSession = Depends(get_db),
):
    if current_user.role not in ("owner", "admin"):
        raise HTTPException(403, "Only owners/admins can remove users")

    result = await db.execute(
        select(User).where(User.id == user_id, User.org_id == current_user.org_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "User not found in your org")

    target.is_active = False
