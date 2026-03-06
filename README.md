# 🔍 Deep Research Agent

> Orchestrated deep research using Manus, Firecrawl, Tavily, and Perplexity.

A TypeScript monorepo containing a production-grade AI research agent that combines four specialized APIs to deliver comprehensive, cited, structured research results.

## Architecture

```
apps/
  api/                    → Hono server (main entrypoint)
packages/
  types/                  → Zod schemas + TypeScript types
  orchestrator/           → Query planner, router, decomposer
  tools/
    manus/                → Manus API client (autonomous agent)
    perplexity/           → Perplexity Sonar client (synthesis)
    tavily/               → Tavily Search client (grounding)
    firecrawl/            → Firecrawl Agent client (extraction)
  fusion/                 → Merge, dedup, ranking, citations
docs/
  BLUEPRINT.md            → Full architecture blueprint
```

## Quickstart

```bash
# Install pnpm if needed
npm install -g pnpm

# Install all packages
pnpm install

# Copy env
cp .env.example .env
# Fill in your API keys

# Build all packages
pnpm build

# Run the API
pnpm dev
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
curl -X POST http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "State of agentic AI frameworks 2026", "depth": "quick"}'

# Standard research (~1 min)
curl -X POST http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "State of agentic AI frameworks 2026", "depth": "standard"}'

# Deep research (all tools including Manus, ~15 min)
curl -X POST http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "State of agentic AI frameworks 2026", "depth": "deep"}'
```

## Stack

- **Runtime**: Node.js 22
- **Language**: TypeScript 5
- **API**: [Hono](https://hono.dev)
- **Validation**: [Zod](https://zod.dev)
- **Monorepo**: pnpm workspaces
- **Build**: tsup
- **Test**: vitest

## License

MIT
