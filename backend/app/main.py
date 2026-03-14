from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import auth, orgs, users, messages, health

app = FastAPI(
    title="PulseQ API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(orgs.router)
app.include_router(users.router)
app.include_router(messages.router)

@app.get("/")
async def root():
    return {"service": "PulseQ API", "version": "1.0.0", "status": "ok"}
