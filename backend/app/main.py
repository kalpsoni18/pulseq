from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from .routers import auth, orgs, users, messages, health

app = FastAPI(
    title="PulseQ API",
    version="1.0.0",
)

ALLOWED_ORIGINS = [
    "https://pulseq-frontend-920308587680.us-central1.run.app",
    "http://localhost:3000",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(orgs.router)
app.include_router(users.router)
app.include_router(messages.router)

@app.get("/")
async def root():
    return {"service": "PulseQ API", "version": "1.0.0", "status": "ok"}
