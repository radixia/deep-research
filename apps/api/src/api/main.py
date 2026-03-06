"""
Deep Research Agent — FastAPI entrypoint.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routes.research import router as research_router
from .routes.webhooks import router as webhooks_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"🔍 Deep Research Agent starting [{settings.app_env}]")
    yield
    # Shutdown
    print("🔍 Deep Research Agent shutting down")


app = FastAPI(
    title="Deep Research Agent",
    description="Orchestrated deep research using Manus, Firecrawl, Tavily, and Perplexity",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(research_router, prefix="/research", tags=["research"])
app.include_router(webhooks_router, prefix="/webhooks", tags=["webhooks"])


@app.get("/")
async def root():
    return {"status": "ok", "service": "deep-research-agent", "version": "0.1.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
