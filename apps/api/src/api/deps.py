"""
Dependency injection for FastAPI routes.
"""

from functools import lru_cache

from dr_tools_manus import ManusClient
from dr_tools_perplexity import PerplexityClient
from dr_tools_tavily import TavilyClient
from dr_tools_firecrawl import FirecrawlClient
from dr_fusion import FusionEngine
from dr_orchestrator import ResearchOrchestrator

from .config import settings


@lru_cache
def get_orchestrator() -> ResearchOrchestrator:
    return ResearchOrchestrator(
        manus=ManusClient(
            api_key=settings.manus_api_key,
            webhook_url=f"{settings.webhook_base_url}/webhooks/manus",
        ),
        perplexity=PerplexityClient(
            api_key=settings.perplexity_api_key,
            model=settings.perplexity_model,
        ),
        tavily=TavilyClient(api_key=settings.tavily_api_key),
        firecrawl=FirecrawlClient(api_key=settings.firecrawl_api_key),
        fusion=FusionEngine(),
    )
