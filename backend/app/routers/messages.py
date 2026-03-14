from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from google.cloud import pubsub_v1, monitoring_v3
import time

from ..auth import get_current_user_require_org
from ..database import get_db
from ..models import User, Org
from ..config import get_settings

router = APIRouter(prefix="/messages", tags=["messages"])


class PublishRequest(BaseModel):
    payload: str
    count: int = 1


class PublishResponse(BaseModel):
    message_ids: list[str]
    org_id: str
    topic: str
    count: int


class QueueStatus(BaseModel):
    subscription: str
    undelivered_messages: int
    oldest_unacked_age_seconds: float | None
    replicas: int | None


@router.post("/publish", response_model=PublishResponse)
async def publish_messages(
    body: PublishRequest,
    user: User = Depends(get_current_user_require_org),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    result = await db.execute(select(Org).where(Org.id == user.org_id))
    org = result.scalar_one_or_none()
    if not org or not org.pubsub_topic:
        raise HTTPException(404, "Org has no Pub/Sub topic.")

    publisher = pubsub_v1.PublisherClient()
    topic_path = publisher.topic_path(settings.project_id, org.pubsub_topic)
    count = min(body.count, 100)
    message_ids = []

    for i in range(count):
        future = publisher.publish(
            topic_path,
            body.payload.encode("utf-8"),
            org_id=user.org_id,
            sequence=str(i),
        )
        message_ids.append(future.result())

    return PublishResponse(
        message_ids=message_ids,
        org_id=user.org_id,
        topic=org.pubsub_topic,
        count=count,
    )


@router.get("/status", response_model=QueueStatus)
async def queue_status(
    user: User = Depends(get_current_user_require_org),
    db: AsyncSession = Depends(get_db),
):
    settings = get_settings()
    result = await db.execute(select(Org).where(Org.id == user.org_id))
    org = result.scalar_one_or_none()
    if not org:
        raise HTTPException(404, "Org not found")

    undelivered = 0
    replicas = None

    try:
        client = monitoring_v3.MetricServiceClient()
        project_name = f"projects/{settings.project_id}"
        now = time.time()
        interval = monitoring_v3.TimeInterval(
            end_time={"seconds": int(now)},
            start_time={"seconds": int(now) - 120},
        )

        # Get queue depth
        results = client.list_time_series(
            request={
                "name": project_name,
                "filter": (
                    f'metric.type="pubsub.googleapis.com/subscription/num_undelivered_messages" '
                    f'AND resource.labels.subscription_id="{org.pubsub_subscription}"'
                ),
                "interval": interval,
                "view": monitoring_v3.ListTimeSeriesRequest.TimeSeriesView.FULL,
            }
        )
        for series in results:
            if series.points:
                undelivered = int(series.points[0].value.int64_value)
                break

        # Estimate replicas from queue depth (1 per 5 msgs, max 10)
        if undelivered > 0:
            replicas = min(10, max(1, undelivered // 5))
        else:
            replicas = 0

    except Exception:
        pass

    return QueueStatus(
        subscription=org.pubsub_subscription or "",
        undelivered_messages=undelivered,
        oldest_unacked_age_seconds=None,
        replicas=replicas,
    )
