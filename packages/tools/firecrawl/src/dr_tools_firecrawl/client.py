"""
Firecrawl Agent client.

Used as the "extractor" — schema-first structured data extraction.
Can research autonomously without predefined URLs.
Best for building structured datasets and RAG pipelines.
"""

import time
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any
from firecrawl import FirecrawlApp
from dr_types import Citation, ToolResult


class FirecrawlClient:
    def __init__(self, api_key: str):
        self._app = FirecrawlApp(api_key=api_key)
        self._executor = ThreadPoolExecutor(max_workers=2)

    async def run(
        self,
        query: str,
        schema: dict[str, Any] | None = None,
    ) -> ToolResult:
        """
        Use Firecrawl Agent to autonomously research a topic.
        Optionally pass a JSON schema for structured output.
        """
        start = time.monotonic()
        try:
            loop = asyncio.get_event_loop()

            if schema:
                result = await loop.run_in_executor(
                    self._executor,
                    lambda: self._app.extract(
                        urls=[],  # Agent mode — no URLs needed
                        params={
                            "prompt": query,
                            "schema": schema,
                        },
                    ),
                )
            else:
                result = await loop.run_in_executor(
                    self._executor,
                    lambda: self._app.search(
                        query=query,
                        params={"scrapeOptions": {"formats": ["markdown"]}},
                    ),
                )

            citations = self._extract_citations(result)
            return ToolResult(
                tool="firecrawl",
                raw_output=result,
                citations=citations,
                latency_ms=int((time.monotonic() - start) * 1000),
            )
        except Exception as e:
            return ToolResult(
                tool="firecrawl",
                raw_output=None,
                success=False,
                error=str(e),
                latency_ms=int((time.monotonic() - start) * 1000),
            )

    async def scrape_url(self, url: str) -> ToolResult:
        """Scrape a specific URL and return clean markdown."""
        start = time.monotonic()
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                self._executor,
                lambda: self._app.scrape_url(url, params={"formats": ["markdown"]}),
            )
            return ToolResult(
                tool="firecrawl",
                raw_output=result,
                citations=[
                    Citation(
                        url=url,
                        title=result.get("metadata", {}).get("title", ""),
                        snippet=result.get("markdown", "")[:500],
                        source_tool="firecrawl",
                    )
                ],
                latency_ms=int((time.monotonic() - start) * 1000),
            )
        except Exception as e:
            return ToolResult(
                tool="firecrawl",
                raw_output=None,
                success=False,
                error=str(e),
                latency_ms=int((time.monotonic() - start) * 1000),
            )

    def _extract_citations(self, result: Any) -> list[Citation]:
        citations = []
        if isinstance(result, list):
            for item in result:
                if isinstance(item, dict) and "url" in item:
                    citations.append(
                        Citation(
                            url=item.get("url", ""),
                            title=item.get("title", ""),
                            snippet=item.get("markdown", "")[:500],
                            source_tool="firecrawl",
                        )
                    )
        return citations
