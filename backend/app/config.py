from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # GCP
    project_id: str = ""
    region: str = "us-central1"

    # Database — loaded from Secret Manager at startup
    database_url: str = ""

    # Firebase / Identity Platform
    firebase_credentials_path: str = ""  # path to service account JSON (local dev only)
    # In Cloud Run, credentials come from Workload Identity — no file needed

    # KEDA / K8s
    keda_namespace: str = "default"
    consumer_deployment: str = "pulseq-consumer"

    # App
    environment: str = "production"
    debug: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
