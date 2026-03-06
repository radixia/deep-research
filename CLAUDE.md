# CLAUDE.md — Deep Research Agent

## What this project is

A TypeScript monorepo that orchestrates four AI research APIs — **Manus**, **Perplexity**, **Tavily**, and **Firecrawl** — into a unified deep research agent with three depth modes: `quick`, `standard`, `deep`.

## Monorepo structure

```
apps/api/                    → Hono HTTP server (main entrypoint)
packages/types/              → Zod schemas + shared TypeScript types
packages/orchestrator/       → Query routing, depth strategy, tool dispatch
packages/fusion/             → Dedup, ranking, citation tracking, synthesis
packages/tools/manus/        → Manus API client (async, webhook-based)
packages/tools/perplexity/   → Perplexity Sonar client
packages/tools/tavily/       → Tavily Search client
packages/tools/firecrawl/    → Firecrawl Agent/Extract client
docs/BLUEPRINT.md            → Full architecture & design reference
```

## Stack

- **Runtime**: Node.js 22, TypeScript 5
- **API framework**: Hono
- **Validation**: Zod
- **Monorepo**: pnpm workspaces
- **Build**: tsup
- **Test**: vitest

## Key commands

```bash
pnpm install          # install all workspace packages
pnpm build            # build all packages (run before running api)
pnpm dev              # start api in watch mode
pnpm test             # run vitest across all packages
pnpm lint             # eslint check
```

All commands run from the monorepo root.

## Environment

Copy `.env.example` to `.env` and fill in API keys:
- `MANUS_API_KEY` + `MANUS_WEBHOOK_SECRET`
- `PERPLEXITY_API_KEY`
- `TAVILY_API_KEY`
- `FIRECRAWL_API_KEY`
- `WEBHOOK_BASE_URL` — public URL where Manus can reach the webhook endpoint

## How the orchestrator works

Three depth modes, each with a different tool mix:

| Depth | Tools | Approx latency |
|-------|-------|---------------|
| `quick` | Perplexity + Tavily | ~10–30s |
| `standard` | Perplexity + Tavily (sub-queries) + Firecrawl | ~1 min |
| `deep` | All four tools — Manus async + fast tools in parallel | ~10–15 min |

## How the fusion layer works

1. Collect all `ToolResult[]` from the orchestrator
2. Deduplicate citations by URL (keep highest-credibility version)
3. Apply per-tool credibility weight (Manus 0.9 → Tavily 0.75)
4. Rank by final credibility score
5. Build summary from highest-priority tool that returned text
6. Compute `confidenceScore` = weighted blend of success rate, avg credibility, source coverage

## Manus API specifics

Manus is async-first: create a task, get `task_id`, receive result via webhook or poll.

- Webhook endpoint: `POST /webhooks/manus` (validates `x-manus-signature` HMAC)
- Polling fallback available but not yet wired for `deep` mode (TODO)
- Webhook result currently logged but not stored — **next priority: wire Redis/DB storage**

## Current limitations / TODO

- [ ] Webhook result storage (Redis or Postgres) — Manus results are not persisted yet
- [ ] Semantic dedup in FusionEngine (currently URL-exact only, not embedding-based)
- [ ] Query decomposer is a naive stub — replace with LLM call (Claude recommended)
- [ ] Add Langfuse tracing for LLM calls and tool latency
- [ ] Rate limiting on `/research` endpoint
- [ ] Streaming output for long `deep` requests
- [ ] Consider Exa.ai as 5th tool (semantic search)

## Testing

```bash
# Quick smoke test (requires .env populated)
curl -X POST http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "State of agentic AI in 2026", "depth": "quick"}'
```

## Code conventions

- All packages use named exports from `src/index.ts`
- Zod schemas live in `packages/types` — add new ones there, never inline
- `ToolResult` is the canonical shape all tool clients must return
- All tool clients follow the same interface: `run(query: string, options?) → Promise<ToolResult>`
- Errors are caught and returned as `ToolResult` with `success: false`, never thrown up

## Architecture decisions

- **Hono over Express**: smaller, faster, edge-compatible for future deployment
- **pnpm workspaces**: no bundler needed between packages, direct TS imports
- **Manus as primary for deep**: it handles multi-step web navigation that the others can't
- **Fusion layer separate from orchestrator**: keeps synthesis logic testable in isolation
