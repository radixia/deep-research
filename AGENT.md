# AGENT.md — Working Notes for AI Agents

> Read this before touching any code. It's the fast-path to understanding the repo.

## What to read first

1. `CLAUDE.md` — architecture, commands, conventions
2. `docs/BLUEPRINT.md` — full design doc with pseudocode and rationale
3. `packages/types/src/index.ts` — shared types/schemas (source of truth for data shapes)

## Current state (as of April 2026)

The service is fully functional as a deep research agent that can be consumed three ways:

1. **HTTP API** — `apps/api/` Hono server (`POST /research`, `GET /research/:jobId`)
2. **Library** — `@deep-research/sdk` package for embedding in Node.js apps
3. **MCP tool** — `@deep-research/mcp` stdio server for Claude Desktop, Cursor, and other MCP clients

### Key features

- **5 search providers**: Manus, Perplexity, Tavily, Firecrawl, Brave
- **Provider selection**: Caller can specify which providers to use via `providers` array, or let depth-based routing decide
- **Domain allowlisting**: Restrict searches to specific websites via `allowedDomains`
- **Structured response**: Executive summary with `[N]` inline references → detail sections per tool → numbered reference list
- **Depth modes**: `quick` (~10-30s), `standard` (~1 min), `deep` (~10-15 min)
- **47 tests** across 8 test files (unit + integration)

## Request schema

```typescript
{
  query: string;           // Required: research query
  depth: "quick" | "standard" | "deep";  // Default: "standard"
  outputFormat: string;    // Default: "markdown_report"
  maxSources: number;      // Default: 50 (1–500)
  language: string;        // Default: "en"
  providers?: string[];    // Optional: ["tavily", "brave", "perplexity", "firecrawl", "manus"]
  allowedDomains?: string[]; // Optional: ["arxiv.org", "github.com"]
}
```

When `providers` is set, depth-based routing is bypassed — only those providers run in parallel.
When `allowedDomains` is set, all searches are restricted to those domains (Tavily uses `include_domains`, Brave/Firecrawl prepend `site:` filters, Perplexity post-filters citations, FusionEngine filters by domain).

## Response schema

The response includes both legacy flat fields and new structured fields:

```typescript
{
  // Legacy (backward compatible)
  summary: string;
  sources: Citation[];
  toolResults: ToolResult[];
  confidenceScore: number;

  // Structured output
  executiveSummary: string;     // With inline [N] reference markers
  detailSections: [{            // Per-tool detail sections
    tool: string;
    content: string;
    chunks: [{ text, sourceUrl?, sourceTitle? }];
  }];
  references: [{                // Numbered reference list
    index: number;
    url: string;
    title: string;
    snippet: string;
    sourceTool: string;
  }];
}
```

## MCP server

The `@deep-research/mcp` package exposes a `deep_research` tool via Model Context Protocol.

### Running

```bash
# Set env vars and run
MANUS_API_KEY=... PERPLEXITY_API_KEY=... TAVILY_API_KEY=... \
FIRECRAWL_API_KEY=... BRAVE_API_KEY=... \
node packages/mcp/dist/index.js
```

### Cursor/Claude Desktop config

```json
{
  "mcpServers": {
    "deep-research": {
      "command": "node",
      "args": ["/path/to/deep-research/packages/mcp/dist/index.js"],
      "env": {
        "MANUS_API_KEY": "...",
        "PERPLEXITY_API_KEY": "...",
        "TAVILY_API_KEY": "...",
        "FIRECRAWL_API_KEY": "...",
        "BRAVE_API_KEY": "..."
      }
    }
  }
}
```

### Tool parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Research query |
| `depth` | enum | No | `quick`, `standard`, `deep` (default: `standard`) |
| `providers` | string[] | No | Specific providers to use |
| `allowedDomains` | string[] | No | Restrict to these domains |
| `maxSources` | number | No | Max sources (default: 50) |

## Things NOT to change

- `packages/types/src/index.ts` — change only additive (never remove fields without checking all consumers)
- The `/research` API shape — breaking change, requires versioning
- The tool weight constants in `FusionEngine` — only adjust after benchmarking
- `ProviderName` enum values — they're used as keys throughout the system

## File-by-file quick reference

| File | Purpose |
|------|---------|
| `apps/api/src/index.ts` | HTTP routes + server bootstrap |
| `apps/api/src/config.ts` | Env var parsing (Zod) |
| `packages/orchestrator/src/index.ts` | Depth routing + direct mode + tool dispatch |
| `packages/fusion/src/index.ts` | Merge, dedup, rank, structured output, confidence |
| `packages/types/src/index.ts` | All shared Zod schemas + TS types |
| `packages/tools/*/src/index.ts` | Individual API clients (all support allowedDomains) |
| `packages/sdk/src/index.ts` | Library entry: factories, re-exports |
| `packages/mcp/src/server.ts` | MCP tool definition + result formatter |
| `packages/mcp/src/index.ts` | MCP stdio entry point |

## Local dev workflow

```bash
# 1. Copy and fill env
cp .env.example .env

# 2. Install deps
pnpm install

# 3. Build all packages (required before first run)
pnpm build

# 4. Start dev server
pnpm dev

# 5. Test a quick research call
curl -X POST http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "agentic AI frameworks 2026", "depth": "quick"}'

# 6. With provider selection and domain restriction
curl -X POST http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "transformer architectures", "providers": ["tavily", "brave"], "allowedDomains": ["arxiv.org"]}'

# 7. Run tests
pnpm test

# 8. Run tests for a specific package
pnpm test -- packages/fusion/
```

## Notes on Manus

Manus is the most complex client because it's async. In `deep` mode:
1. Fire `POST /v1/tasks` immediately
2. Run Perplexity + Tavily + Firecrawl in parallel (they're fast)
3. Await Manus result via webhook/polling
4. Pass everything to FusionEngine

If Manus times out or fails, the research still completes with the fast tools — `confidenceScore` will reflect the missing source. This is intentional resilience.

## Naming conventions

- Tool names in code: `"manus"`, `"perplexity"`, `"tavily"`, `"firecrawl"`, `"brave"` (lowercase, exact)
- These strings appear in `ToolResult.tool`, `ProviderName` enum, and are used by FusionEngine for weighting — don't change them
