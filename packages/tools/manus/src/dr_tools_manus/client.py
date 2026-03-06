"""
Manus API client.

Manus is used as the "deep executor" — it autonomously plans and runs
multi-step research tasks, browses the web, and returns structured reports.
Results are delivered via webhook or polling.
"""

import asyncio
import time
import httpx
from pydantic import BaseModel
from dr_types import Citation, ToolResult


MANUS_BASE_URL = "https://open.manus.im"


class ManusTaskRequest(BaseModel):
    task: str
    webhook_url: str | None = None
    return_format: str = "markdown"


class ManusTaskResponse(BaseModel):
    task_id: str
    status: str
    result: str | None = None


class ManusClient:
    def __init__(self, api_key: str, webhook_url: str | None = None):
        self.api_key = api_key
        self.webhook_url = webhook_url
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    async def create_task(self, query: str) -> str:
        """Submit a research task to Manus. Returns task_id."""
        payload = ManusTaskRequest(
            task=query,
            webhook_url=self.webhook_url,
            return_format="markdown",
        )
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{MANUS_BASE_URL}/v1/tasks",
                json=payload.model_dump(exclude_none=True),
                headers=self.headers,
                timeout=30,
            )
            r.raise_for_status()
            data = r.json()
            return data["task_id"]

    async def get_task(self, task_id: str) -> ManusTaskResponse:
        """Retrieve current status and result of a task."""
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{MANUS_BASE_URL}/v1/tasks/{task_id}",
                headers=self.headers,
                timeout=30,
            )
            r.raise_for_status()
            return ManusTaskResponse(**r.json())

    async def run(self, query: str, max_wait_seconds: int = 900) -> ToolResult:
        """
        Submit a task and poll until completion.
        max_wait_seconds: how long to wait before giving up (default 15 min).
        """
        start = time.monotonic()
        try:
            task_id = await self.create_task(query)
            while True:
                elapsed = time.monotonic() - start
                if elapsed > max_wait_seconds:
                    return ToolResult(
                        tool="manus",
                        raw_output=None,
                        success=False,
                        error=f"Timeout after {max_wait_seconds}s",
                        latency_ms=int(elapsed * 1000),
                    )
                task = await self.get_task(task_id)
                if task.status == "completed":
                    return ToolResult(
                        tool="manus",
                        raw_output=task.result,
                        citations=self._extract_citations(task.result or ""),
                        latency_ms=int((time.monotonic() - start) * 1000),
                    )
                if task.status == "failed":
                    return ToolResult(
                        tool="manus",
                        raw_output=None,
                        success=False,
                        error="Manus task failed",
                        latency_ms=int((time.monotonic() - start) * 1000),
                    )
                await asyncio.sleep(5)
        except Exception as e:
            return ToolResult(
                tool="manus",
                raw_output=None,
                success=False,
                error=str(e),
                latency_ms=int((time.monotonic() - start) * 1000),
            )

    def _extract_citations(self, text: str) -> list[Citation]:
        """Basic URL extraction from markdown text."""
        import re
        from datetime import datetime

        citations = []
        # Match markdown links: [title](url)
        for match in re.finditer(r"\[([^\]]+)\]\((https?://[^\)]+)\)", text):
            citations.append(
                Citation(
                    title=match.group(1),
                    url=match.group(2),
                    snippet="",
                    source_tool="manus",
                    fetched_at=datetime.utcnow(),
                )
            )
        return citations
