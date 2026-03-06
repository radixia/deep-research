"""
Perplexity Sonar client.

Used as the "synthesizer" — provides real-time web-grounded answers
with inline citations. Best for overview and conversational synthesis.
"""

import time
import httpx
from dr_types import Citation, ToolResult


PERPLEXITY_BASE_URL = "https://api.perplexity.ai"


class PerplexityClient:
    def __init__(self, api_key: str, model: str = "sonar-deep-research"):
        self.api_key = api_key
        self.model = model
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    async def run(self, query: str) -> ToolResult:
        """Run a research query through Perplexity Sonar."""
        start = time.monotonic()
        try:
            payload = {
                "model": self.model,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a research assistant. Provide a comprehensive, "
                            "well-structured answer with citations."
                        ),
                    },
                    {"role": "user", "content": query},
                ],
                "return_citations": True,
            }
            async with httpx.AsyncClient(timeout=120) as client:
                r = await client.post(
                    f"{PERPLEXITY_BASE_URL}/chat/completions",
                    json=payload,
                    headers=self.headers,
                )
                r.raise_for_status()
                data = r.json()

            content = data["choices"][0]["message"]["content"]
            raw_citations = data.get("citations", [])
            citations = [
                Citation(
                    url=c if isinstance(c, str) else c.get("url", ""),
                    title=c.get("title", "") if isinstance(c, dict) else "",
                    snippet=c.get("snippet", "") if isinstance(c, dict) else "",
                    source_tool="perplexity",
                )
                for c in raw_citations
            ]

            return ToolResult(
                tool="perplexity",
                raw_output=content,
                citations=citations,
                latency_ms=int((time.monotonic() - start) * 1000),
            )
        except Exception as e:
            return ToolResult(
                tool="perplexity",
                raw_output=None,
                success=False,
                error=str(e),
                latency_ms=int((time.monotonic() - start) * 1000),
            )
