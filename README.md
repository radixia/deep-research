# 🔍 Deep Research Agent

> Orchestrated deep research using Manus, Firecrawl, Tavily, and Perplexity.

A monorepo containing a production-grade AI research agent that combines the best of four specialized APIs to deliver comprehensive, cited, structured research results.

## Architecture

```
apps/
  api/                  → FastAPI server (main entrypoint)
packages/
  orchestrator/         → Query planner, router, decomposer
  tools/
    manus/              → Manus API client (autonomous agent)
    perplexity/         → Perplexity Sonar client (synthesis)
    tavily/             → Tavily Search client (grounding)
    firecrawl/          → Firecrawl Agent client (extraction)
  fusion/               → Merge, dedup, ranking, citation tracking
  types/                → Shared Pydantic models
docs/
  BLUEPRINT.md          → Full architecture blueprint
```

## Quickstart

```bash
# Install uv (recommended)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install all packages
uv sync

# Copy env
cp .env.example .env
# Fill in your API keys

# Run the API
uv run uvicorn apps.api.main:app --reload
```

## API Keys Required

| Tool | Env var |
|------|---------|
| Manus | `MANUS_API_KEY` |
| Perplexity | `PERPLEXITY_API_KEY` |
| Tavily | `TAVILY_API_KEY` |
| Firecrawl | `FIRECRAWL_API_KEY` |

## Usage

```bash
# Quick research (Perplexity + Tavily, ~10s)
curl -X POST http://localhost:8000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "State of agentic AI frameworks 2026", "depth": "quick"}'

# Deep research (all tools, ~15min)
curl -X POST http://localhost:8000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "State of agentic AI frameworks 2026", "depth": "deep"}'
```

## License

MIT
