from enum import Enum
from typing import Any
from pydantic import BaseModel, Field
from datetime import datetime


class ResearchDepth(str, Enum):
    QUICK = "quick"       # Perplexity + Tavily, ~10s
    STANDARD = "standard" # All tools, no Manus, ~1 min
    DEEP = "deep"         # All tools including Manus, ~15 min


class ResearchStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ResearchQuery(BaseModel):
    query: str = Field(..., description="The research question")
    depth: ResearchDepth = Field(default=ResearchDepth.STANDARD)
    output_format: str = Field(default="markdown_report")
    max_sources: int = Field(default=50, ge=1, le=500)
    language: str = Field(default="en")


class Citation(BaseModel):
    url: str
    title: str
    snippet: str
    source_tool: str  # manus | perplexity | tavily | firecrawl
    fetched_at: datetime = Field(default_factory=datetime.utcnow)
    credibility_score: float = Field(default=0.5, ge=0.0, le=1.0)


class ToolResult(BaseModel):
    tool: str
    raw_output: Any
    citations: list[Citation] = Field(default_factory=list)
    latency_ms: int = 0
    success: bool = True
    error: str | None = None


class ResearchResult(BaseModel):
    query: str
    depth: ResearchDepth
    status: ResearchStatus
    summary: str = ""
    sources: list[Citation] = Field(default_factory=list)
    tool_results: list[ToolResult] = Field(default_factory=list)
    confidence_score: float = Field(default=0.0, ge=0.0, le=1.0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: datetime | None = None
