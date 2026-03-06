"""
Tavily Search client.

Used as the "grounder" — fast AI-optimized search with LLM-ready snippets.
Best for sub-query grounding and RAG retrieval step.
"""

import time
import asyncio
from concurrent.futures import ThreadPoolExecutor
from tavily import TavilyClient as _TavilySDK
from dr_types import Citation, ToolResult


class TavilyClient:
    def __init__(self, api_key: str):
        self._sdk = _TavilySDK(api_key=api_key)
        self._executor = ThreadPoolExecutor(max_workers=4)

    async def run(
        self,
        query: str,
        max_results: int = 10,
        search_depth: str = "advanced",
        include_raw_content: bool = True,
    ) -> ToolResult:
        """Run a search query through Tavily."""
        start = time.monotonic()
        try:
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                self._executor,
                lambda: self._sdk.search(
                    query=query,
                    search_depth=search_depth,
                    max_results=max_results,
                    include_raw_content=include_raw_content,
                ),
            )
            citations = [
                Citation(
                    url=r.get("url", ""),
                    title=r.get("title", ""),
                    snippet=r.get("content", "")[:500],
                    source_tool="tavily",
                    credibility_score=r.get("score", 0.5),
                )
                for r in results.get("results", [])
            ]
            return ToolResult(
                tool="tavily",
                raw_output=results,
                citations=citations,
                latency_ms=int((time.monotonic() - start) * 1000),
            )
        except Exception as e:
            return ToolResult(
                tool="tavily",
                raw_output=None,
                success=False,
                error=str(e),
                latency_ms=int((time.monotonic() - start) * 1000),
            )

    async def run_multi(self, queries: list[str], **kwargs) -> list[ToolResult]:
        """Run multiple queries in parallel."""
        return await asyncio.gather(*[self.run(q, **kwargs) for q in queries])
