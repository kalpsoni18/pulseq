from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import re
from firebase_admin import auth as firebase_auth
from google.cloud import pubsub_v1

from ..auth import get_current_user, get_current_user_require_org
from ..database import get_db
from ..models import Org, User
from ..config import get_settings

router = APIRouter(prefix="/orgs", tags=["orgs"])


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]


class CreateOrgRequest(BaseModel):
    name: str


class OrgResponse(BaseModel):
    id: str
    name: str
    slug: str
    pubsub_topic: str | None
    pubsub_subscription: str | None

    class Config:
        from_attributes = True


@router.post("/", response_model=OrgResponse, status_code=201)
async def create_org(
    body: CreateOrgRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a new org for the authenticated user.
    - Provisions a dedicated Pub/Sub topic + subscription for this org
    - Sets org_id as a Firebase custom claim on the user's token
    """
    settings = get_settings()

    if user.org_id:
        raise HTTPException(400, "You already belong to an org")

    slug = _slugify(body.name)
    # Ensure slug uniqueness
    existing = await db.execute(select(Org).where(Org.slug == slug))
    if existing.scalar_one_or_none():
        slug = f"{slug}-{user.firebase_uid[:6]}"

    topic_name = f"pulseq-{slug}"
    sub_name = f"pulseq-{slug}-sub"

    # Provision Pub/Sub topic + subscription
    publisher = pubsub_v1.PublisherClient()
    subscriber = pubsub_v1.SubscriberClient()
    topic_path = publisher.topic_path(settings.project_id, topic_name)
    sub_path = subscriber.subscription_path(settings.project_id, sub_name)

    try:
        publisher.create_topic(request={"name": topic_path})
        subscriber.create_subscription(
            request={
                "name": sub_path,
                "topic": topic_path,
                "ack_deadline_seconds": 20,
            }
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to provision Pub/Sub: {e}")

    # Persist org to DB
    org = Org(
        name=body.name,
        slug=slug,
        owner_uid=user.firebase_uid,
        pubsub_topic=topic_name,
        pubsub_subscription=sub_name,
    )
    db.add(org)
    await db.flush()

    # Link user to org
    user.org_id = str(org.id)
    user.role = "owner"

    # Set custom claim on Firebase token so future JWTs carry org_id
    firebase_auth.set_custom_user_claims(
        user.firebase_uid, {"org_id": str(org.id), "role": "owner"}
    )

    return org


@router.get("/me", response_model=OrgResponse)
async def my_org(
    user: User = Depends(get_current_user_require_org),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Org).where(Org.id == user.org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Org not found")
    return org
