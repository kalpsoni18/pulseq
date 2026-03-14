from fastapi import HTTPException, Security, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import firebase_admin
from firebase_admin import auth as firebase_auth, credentials
from functools import lru_cache

from .config import get_settings
from .database import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)


@lru_cache
def _init_firebase():
    """Initialise Firebase Admin SDK once."""
    settings = get_settings()
    if firebase_admin._apps:
        return  # Already initialised
    if settings.firebase_credentials_path:
        # Local dev: use service account file
        cred = credentials.Certificate(settings.firebase_credentials_path)
    else:
        # Cloud Run / GKE: use Application Default Credentials
        cred = credentials.ApplicationDefault()
    firebase_admin.initialize_app(cred)


async def verify_firebase_token(token: str) -> dict:
    """Verify a Firebase ID token and return decoded claims."""
    _init_firebase()
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except firebase_auth.ExpiredIdTokenError:
        raise HTTPException(status_code=401, detail="Token expired")
    except firebase_auth.InvalidIdTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth error: {str(e)}")


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Security(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Dependency: verifies Firebase JWT, upserts User in DB, returns User ORM object.
    The org_id comes from a custom Firebase claim set when the user joins/creates an org.
    """
    if not creds:
        raise HTTPException(status_code=401, detail="Authorization header required")

    decoded = await verify_firebase_token(creds.credentials)
    firebase_uid = decoded["uid"]

    # Upsert user record
    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            firebase_uid=firebase_uid,
            email=decoded.get("email", ""),
            org_id=decoded.get("org_id"),  # custom claim
            role="owner",
        )
        db.add(user)
        await db.flush()

    elif user.org_id is None and decoded.get("org_id"):
        # User joined an org after initial signup — sync the claim
        user.org_id = decoded["org_id"]

    return user


async def get_current_user_require_org(
    user: User = Depends(get_current_user),
) -> User:
    """Like get_current_user but 403s if the user has no org yet."""
    if not user.org_id:
        raise HTTPException(
            status_code=403,
            detail="You must create or join an org first. POST /orgs"
        )
    return user
