from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from google.cloud import secretmanager

from .config import get_settings


def _load_db_url() -> str:
    """Load DB URL from Secret Manager, fall back to env var for local dev."""
    settings = get_settings()
    if settings.database_url:
        return settings.database_url

    # Pull from Secret Manager
    client = secretmanager.SecretManagerServiceClient()
    name = f"projects/{settings.project_id}/secrets/pulseq-db-url/versions/latest"
    response = client.access_secret_version(request={"name": name})
    return response.payload.data.decode("utf-8")


DATABASE_URL = _load_db_url()

engine = create_async_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    echo=get_settings().debug,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
