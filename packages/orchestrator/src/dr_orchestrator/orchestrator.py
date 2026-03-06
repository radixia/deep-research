"""
Research Orchestrator.

Routes queries to the right tools based on depth,
runs them (in parallel where possible),
and merges results via the FusionEngine.
"""

import asyncio
from datetime import datetime

from dr_types import ResearchQuery, ResearchResult, ResearchDepth, ResearchStatus
from dr_tools_manus import ManusClient
from dr_tools_perplexity import PerplexityClient
from dr_tools_tavily import TavilyClient
from dr_tools_firecrawl import FirecrawlClient
from dr_fusion import FusionEngine


class ResearchOrchestrator:
    def __init__(
        self,
        manus: ManusClient,
        perplexity: PerplexityClient,
        tavily: TavilyClient,
        firecrawl: FirecrawlClient,
        fusion: FusionEngine,
    ):
        self.manus = manus
        self.perplexity = perplexity
        self.tavily = tavily
        self.firecrawl = firecrawl
        self.fusion = fusion

    async def research(self, request: ResearchQuery) -> ResearchResult:
        """
        Main entry point.
        Routes the query based on depth and merges all results.
        """
        result = ResearchResult(
            query=request.query,
            depth=request.depth,
            status=ResearchStatus.RUNNING,
        )

        try:
            if request.depth == ResearchDepth.QUICK:
                tool_results = await self._run_quick(request.query)

            elif request.depth == ResearchDepth.STANDARD:
                tool_results = await self._run_standard(request.query)

            else:  # DEEP
                tool_results = await self._run_deep(request.query)

            final = self.fusion.merge(request.query, tool_results)
            result.tool_results = tool_results
            result.summary = final.summary
            result.sources = final.sources
            result.confidence_score = final.confidence_score
            result.status = ResearchStatus.COMPLETED
            result.completed_at = datetime.utcnow()

        except Exception as e:
            result.status = ResearchStatus.FAILED
            result.summary = f"Research failed: {e}"

        return result

    # ── Depth strategies ─────────────────────────────────────────────────────

    async def _run_quick(self, query: str):
        """Quick: Perplexity + Tavily in parallel. ~10s."""
        return list(
            await asyncio.gather(
                self.perplexity.run(query),
                self.tavily.run(query, max_results=5),
            )
        )

    async def _run_standard(self, query: str):
        """Standard: Perplexity + Tavily (multi-query) + Firecrawl. ~1 min."""
        sub_queries = _decompose(query)
        tavily_tasks = [self.tavily.run(sq) for sq in sub_queries]

        results = await asyncio.gather(
            self.perplexity.run(query),
            *tavily_tasks,
            self.firecrawl.run(query),
        )
        return list(results)

    async def _run_deep(self, query: str):
        """
        Deep: Manus (async) + all other tools in parallel.
        Manus runs as a background task — we collect its result last.
        ~15 min total.
        """
        sub_queries = _decompose(query)

        # Launch Manus in background (slow)
        manus_task = asyncio.create_task(self.manus.run(query))

        # Run fast tools in parallel
        fast_results = await asyncio.gather(
            self.perplexity.run(query),
            *[self.tavily.run(sq) for sq in sub_queries],
            self.firecrawl.run(query),
        )

        # Wait for Manus
        manus_result = await manus_task

        return list(fast_results) + [manus_result]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _decompose(query: str, max_sub: int = 4) -> list[str]:
    """
    Naive query decomposition.
    TODO: replace with LLM-based decomposition for production.
    """
    # For now, return the original query plus a few variations
    return [
        query,
        f"{query} latest news 2026",
        f"{query} comparison analysis",
        f"{query} best practices",
    ][:max_sub]
