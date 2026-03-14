from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    return {"status": "ok", "service": "pulseq-api"}


@router.get("/ready")
async def ready():
    # Could add DB ping here for a real readiness check
    return {"status": "ready"}
