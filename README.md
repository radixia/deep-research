# Deep Research Agent

**One API. Five research engines. Three depth modes. Domain allowlisting. MCP-ready.**

A TypeScript monorepo that orchestrates [Manus](https://manus.im), [Perplexity](https://perplexity.ai), [Tavily](https://tavily.com), [Firecrawl](https://firecrawl.dev), and [Brave Search](https://search.brave.com) into a unified deep research pipeline — with deduplicated citations, credibility ranking, structured output, and confidence scoring.

Use it as an **HTTP API**, a **library**, or an **MCP tool** for Claude Desktop / Cursor.

```
POST /research { "query": "...", "providers": ["tavily", "brave"], "allowedDomains": ["arxiv.org"] }
```

One endpoint. Choose your providers. Restrict to trusted domains. Get a structured research report with traced citations.

---

## How it works

```
                        POST /research
                             │
                             ▼
                    ┌─────────────────┐
                    │   ORCHESTRATOR   │
                    │  provider select │
                    │  depth routing   │
                    │  query decomp    │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼         ▼         ▼         ▼         ▼
    ┌─────────┐┌───────────┐┌─────────┐┌───────────┐┌────────┐
    │  Manus  ││Perplexity ││  Tavily  ││ Firecrawl ││ Brave  │
    │  agent  ││ synthesis ││ grounding││ extraction ││ search │
    └────┬────┘└─────┬─────┘└────┬────┘└─────┬─────┘└───┬────┘
         │           │           │            │          │
         └───────────┴───────────┼────────────┘          │
                                 ▼                       │
                    ┌─────────────────┐◄─────────────────┘
                    │  FUSION ENGINE   │
                    │  dedup · rank    │
                    │  cite · score    │
                    │  structured out  │
                    └────────┬────────┘
                             │
                             ▼
                ┌──────────────────────┐
                │   ResearchResult     │
                │  executiveSummary    │
                │  detailSections[]    │
                │  references[]        │
                │  confidenceScore     │
                └──────────────────────┘
```

### Depth modes

| Mode | Tools | Latency | Best for |
|------|-------|---------|----------|
| **`quick`** | Perplexity + Tavily + Brave | ~10–30s | Fast fact-checks, simple questions |
| **`standard`** | Perplexity + Tavily (sub-queries) + Firecrawl + Brave | ~1 min | Thorough research with structured extraction |
| **`deep`** | All five — Manus async + fast tools in parallel | ~10–15 min | Comprehensive multi-source reports |

### Provider selection

Instead of depth-based routing, you can explicitly choose which providers to use:

```json
{ "query": "...", "providers": ["tavily", "brave"] }
```

Only the specified providers run in parallel. Depth routing is bypassed.

### Domain allowlisting

Restrict searches to specific websites:

```json
{ "query": "...", "allowedDomains": ["arxiv.org", "github.com", "docs.python.org"] }
```

Each tool applies domain filtering at the API level where possible (Tavily `include_domains`, Brave/Firecrawl `site:` filters). Perplexity post-filters citations. The fusion engine also filters as a final pass.

---

## Quickstart

```bash
# Clone and install
pnpm install

# Configure API keys
cp .env.example .env
# Fill in: MANUS_API_KEY, PERPLEXITY_API_KEY, TAVILY_API_KEY, FIRECRAWL_API_KEY, BRAVE_API_KEY

# Build and run
pnpm build
pnpm dev
```

### Make a research request

```bash
# Quick — Perplexity + Tavily + Brave, returns in seconds
curl -s http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "State of agentic AI frameworks 2026", "depth": "quick"}' | jq

# With specific providers
curl -s http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "transformer attention mechanisms", "providers": ["tavily", "perplexity"]}' | jq

# With domain restriction
curl -s http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "latest papers on RLHF", "providers": ["tavily", "brave"], "allowedDomains": ["arxiv.org"]}' | jq

# Deep — all five tools including Manus autonomous agent
curl -s http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "European AI regulation impact on LLM API market", "depth": "deep"}' | jq
```

### Response shape

```jsonc
{
  "query": "State of agentic AI frameworks 2026",
  "depth": "quick",
  "status": "completed",

  // Structured output
  "executiveSummary": "## Research: ...\n\n*Source: perplexity*\n\n... [1] ... [2] ...",
  "detailSections": [
    {
      "tool": "perplexity",
      "content": "Full text from Perplexity...",
      "chunks": [
        { "text": "Key finding snippet", "sourceUrl": "https://...", "sourceTitle": "..." }
      ]
    },
    {
      "tool": "tavily",
      "content": "...",
      "chunks": [...]
    }
  ],
  "references": [
    { "index": 1, "url": "https://...", "title": "...", "snippet": "...", "sourceTool": "perplexity" },
    { "index": 2, "url": "https://...", "title": "...", "snippet": "...", "sourceTool": "tavily" }
  ],

  // Legacy fields (backward compatible)
  "summary": "...",
  "sources": [...],
  "confidenceScore": 0.91,
  "toolResults": [...]
}
```

---

## MCP Server

The service can be used as an MCP tool by Claude Desktop, Cursor, or any MCP client.

### Setup

```bash
pnpm build
```

### Cursor / Claude Desktop configuration

Add to your MCP settings:

```json
{
  "mcpServers": {
    "deep-research": {
      "command": "node",
      "args": ["/path/to/deep-research/packages/mcp/dist/index.js"],
      "env": {
        "MANUS_API_KEY": "your_key",
        "PERPLEXITY_API_KEY": "your_key",
        "TAVILY_API_KEY": "your_key",
        "FIRECRAWL_API_KEY": "your_key",
        "BRAVE_API_KEY": "your_key"
      }
    }
  }
}
```

### Tool: `deep_research`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | Yes | Research query |
| `depth` | `"quick" \| "standard" \| "deep"` | No | Research depth (default: `standard`) |
| `providers` | `string[]` | No | Explicit providers to use |
| `allowedDomains` | `string[]` | No | Restrict to these domains |
| `maxSources` | `number` | No | Max sources (default: 50) |

### Library usage

```typescript
import { createResearchOrchestrator } from "@deep-research/sdk";

const orchestrator = createResearchOrchestrator({
  manusApiKey: "...",
  perplexityApiKey: "...",
  tavilyApiKey: "...",
  firecrawlApiKey: "...",
  braveApiKey: "...",
  webhookBaseUrl: "http://localhost:3000",
});

const result = await orchestrator.research({
  query: "State of AI in 2026",
  depth: "quick",
  outputFormat: "markdown_report",
  maxSources: 20,
  language: "en",
  providers: ["tavily", "brave"],
  allowedDomains: ["arxiv.org"],
});

console.log(result.executiveSummary);
console.log(result.references);
```

---

## Architecture

```
deep-research/
├── apps/
│   └── api/                     → Hono HTTP server (entrypoint)
├── packages/
│   ├── types/                   → Zod schemas + shared TypeScript types
│   ├── orchestrator/            → Depth routing, direct mode, query decomposition
│   ├── fusion/                  → Dedup, credibility ranking, structured output
│   ├── sdk/                     → Library entry: factories + re-exports
│   ├── mcp/                     → MCP server (stdio transport)
│   └── tools/
│       ├── manus/               → Async webhook-first client + in-process task store
│       ├── perplexity/          → Sonar deep-research model client
│       ├── tavily/              → Search API client with domain filtering
│       ├── firecrawl/           → Search + schema-driven extraction client
│       └── brave/               → Brave Search web API client
└── docs/
    ├── ARCHITECTURE.md          → As-implemented architecture documentation
    ├── BLUEPRINT.md             → Original design blueprint
    └── ...
```

### Key design decisions

- **Hono over Express** — 10x smaller, zero dependencies, edge-runtime compatible
- **`ToolResult` as universal interface** — every tool returns the same shape; adding a 6th tool means implementing one function
- **Fusion separate from orchestration** — synthesis logic is independently testable; the orchestrator only routes, the fusion engine only merges
- **Provider selection** — caller can specify exact providers or rely on depth-based routing
- **Domain allowlisting** — enforced at both the tool and fusion layers
- **Structured output** — executive summary with `[N]` refs + detail sections + numbered reference list
- **Graceful degradation** — if any tool fails, the pipeline continues with remaining results

### Credibility scoring

| Tool | Weight | Rationale |
|------|--------|-----------|
| Manus | 0.90 | Multi-step autonomous research, highest synthesis depth |
| Perplexity | 0.85 | Real-time web grounding with citations |
| Firecrawl | 0.80 | Direct content extraction, less filtered |
| Tavily | 0.75 | Fast search, good breadth but lower per-result depth |
| Brave | 0.75 | Independent index, privacy-first |

---

## API Reference

### `POST /research`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | `string` | *required* | Natural language research query |
| `depth` | `"quick" \| "standard" \| "deep"` | `"standard"` | Research depth mode |
| `providers` | `string[]` | — | Explicit providers (bypasses depth routing) |
| `allowedDomains` | `string[]` | — | Restrict searches to these domains |
| `outputFormat` | `string` | `"markdown_report"` | Output format |
| `maxSources` | `number` | `50` | Maximum sources to return (1–500) |
| `language` | `string` | `"en"` | Preferred language |

**Output formats:** `markdown_report`, `structured_json`, `executive_summary`, `rag_chunks`, `citations_list`

### `GET /research/:jobId`

Poll for job completion. Returns `{ status, result?, error? }`.

### `GET /health`

Returns server status and Manus task store size.

### `POST /webhooks/manus`

Receives async results from Manus. Verifies RSA-SHA256 signature.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MANUS_API_KEY` | Yes | Manus API key |
| `PERPLEXITY_API_KEY` | Yes | Perplexity API key |
| `TAVILY_API_KEY` | Yes | Tavily API key |
| `FIRECRAWL_API_KEY` | Yes | Firecrawl API key |
| `BRAVE_API_KEY` | Yes | Brave Search API key |
| `ANTHROPIC_API_KEY` | No | Claude for LLM-based query decomposition |
| `WEBHOOK_BASE_URL` | For deep mode | Public URL for Manus webhook delivery |
| `PORT` | No (default: 3000) | HTTP server port |
| `API_KEY` | No | When set, requires `x-api-key` header on `/research` |

---

## Development

```bash
pnpm install          # Install all workspace packages
pnpm build            # Build all packages
pnpm dev              # Start API in watch mode
pnpm test             # Run vitest (47 tests across 8 files)
pnpm lint             # ESLint check
pnpm typecheck        # TypeScript type check
```

### Stack

- **Runtime:** Node.js 22, TypeScript 5
- **API:** [Hono](https://hono.dev)
- **MCP:** [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- **Validation:** [Zod](https://zod.dev)
- **Monorepo:** pnpm workspaces
- **Build:** [tsup](https://tsup.egoist.dev)
- **Test:** [Vitest](https://vitest.dev)

---

## License

MIT
