# CLAUDE.md — Deep Research Agent

## What this project is

A TypeScript monorepo that orchestrates five AI research APIs — **Manus**, **Perplexity**, **Tavily**, **Firecrawl**, and **Brave Search** — into a unified deep research agent. Usable as an **HTTP API**, a **library (SDK)**, or an **MCP tool**.

Supports caller-specified provider selection, domain allowlisting, and structured output with executive summary, detail sections, and numbered references.

## Monorepo structure

```
apps/api/                    → Hono HTTP server (main entrypoint)
packages/types/              → Zod schemas + shared TypeScript types
packages/orchestrator/       → Query routing, direct mode, depth strategy, tool dispatch
packages/fusion/             → Dedup, ranking, citation tracking, structured output, synthesis
packages/sdk/                → Library entry: factories + re-exports
packages/mcp/                → MCP server (stdio transport, deep_research tool)
packages/tools/manus/        → Manus API client (async, webhook-based)
packages/tools/perplexity/   → Perplexity Sonar client
packages/tools/tavily/       → Tavily Search client (with include_domains support)
packages/tools/firecrawl/    → Firecrawl Agent/Extract client
packages/tools/brave/        → Brave Search web API client
docs/BLUEPRINT.md            → Full architecture & design reference
```

## Stack

- **Runtime**: Node.js 22, TypeScript 5
- **API framework**: Hono
- **MCP**: @modelcontextprotocol/sdk
- **Validation**: Zod
- **Monorepo**: pnpm workspaces
- **Build**: tsup
- **Test**: vitest

## Key commands

```bash
pnpm install          # install all workspace packages
pnpm build            # build all packages (run before running api or mcp)
pnpm dev              # start api in watch mode
pnpm test             # run vitest across all packages (47 tests)
pnpm lint             # eslint check
pnpm typecheck        # typescript type check
```

All commands run from the monorepo root.

## Environment

Copy `.env.example` to `.env` and fill in API keys:
- `MANUS_API_KEY` + `MANUS_WEBHOOK_SECRET`
- `PERPLEXITY_API_KEY`
- `TAVILY_API_KEY`
- `FIRECRAWL_API_KEY`
- `BRAVE_API_KEY`
- `WEBHOOK_BASE_URL` — public URL where Manus can reach the webhook endpoint

## How the orchestrator works

Two execution modes:

### 1. Depth-based routing (default)

| Depth | Tools | Approx latency |
|-------|-------|---------------|
| `quick` | Perplexity + Tavily + Brave | ~10–30s |
| `standard` | Perplexity + Firecrawl + Brave + Tavily (sub-queries) | ~1 min |
| `deep` | All five tools — Manus async + fast tools in parallel | ~10–15 min |

### 2. Direct provider mode

When `providers` array is specified in the request, only those providers run in parallel. Depth routing is bypassed entirely.

### Domain allowlisting

When `allowedDomains` is specified, searches are restricted to those domains:
- Tavily: uses `include_domains` API parameter
- Brave/Firecrawl: prepend `site:` filters to query
- Perplexity: post-filters citations by domain
- FusionEngine: filters citations as a final pass

## How the fusion layer works

1. Collect all `ToolResult[]` from the orchestrator
2. Deduplicate citations by URL (keep highest-credibility version)
3. Filter by allowed domains (if specified)
4. Apply per-tool credibility weight (Manus 0.9 → Tavily/Brave 0.75)
5. Rank by final credibility score
6. Build structured output:
   - **Executive summary** with inline `[N]` reference markers
   - **Detail sections** per tool with content and chunks
   - **Numbered reference list** matching the `[N]` markers
7. Compute `confidenceScore` = weighted blend of success rate, avg credibility, source coverage

## Request schema

```typescript
{
  query: string;                    // Required
  depth?: "quick" | "standard" | "deep";  // Default: "standard"
  providers?: ProviderName[];       // Optional: bypass depth routing
  allowedDomains?: string[];        // Optional: domain restriction
  outputFormat?: OutputFormat;      // Default: "markdown_report"
  maxSources?: number;              // Default: 50
  language?: string;                // Default: "en"
}
```

## Response schema

Includes both legacy flat fields and new structured fields:

- `summary`, `sources[]`, `confidenceScore` — legacy (backward compat)
- `executiveSummary` — with `[N]` inline references
- `detailSections[]` — per-tool detail with chunks
- `references[]` — numbered reference list

## Manus API specifics

Manus is async-first: create a task, get `task_id`, receive result via webhook or poll.

- Webhook endpoint: `POST /webhooks/manus` (validates RSA-SHA256 signature)
- In-memory task store for webhook delivery
- If Manus times out or fails, research completes with fast tools

## Testing

```bash
pnpm test             # 47 tests across 8 files (unit + integration)
```

Integration tests use mock tool clients — no API keys needed.

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
- All tool clients accept optional `allowedDomains` in options
- Errors are caught and returned as `ToolResult` with `success: false`, never thrown up
- `ProviderName` enum values (`"manus"`, `"perplexity"`, `"tavily"`, `"firecrawl"`, `"brave"`) are used as keys throughout

## Architecture decisions

- **Hono over Express**: smaller, faster, edge-compatible for future deployment
- **pnpm workspaces**: no bundler needed between packages, direct TS imports
- **Manus as primary for deep**: it handles multi-step web navigation that the others can't
- **Fusion layer separate from orchestrator**: keeps synthesis logic testable in isolation
- **MCP via stdio**: simple integration with Claude Desktop / Cursor, no HTTP overhead
- **Structured output with references**: executive summary + detail sections + numbered refs
- **Domain allowlisting at both tool and fusion layers**: defense in depth
