# Deep Research Agent

**One API. Four research engines. Three depth modes.**

A TypeScript monorepo that orchestrates [Manus](https://manus.im), [Perplexity](https://perplexity.ai), [Tavily](https://tavily.com), and [Firecrawl](https://firecrawl.dev) into a unified deep research pipeline — with deduplicated citations, credibility ranking, and confidence scoring.

```
POST /research { "query": "...", "depth": "quick" }
```

That's it. One endpoint. The orchestrator decides which tools to invoke, runs them in parallel, fuses the results, and returns a ranked research report with traced citations.

---

## How it works

```
                        POST /research
                             │
                             ▼
                    ┌─────────────────┐
                    │   ORCHESTRATOR   │
                    │  depth routing   │
                    │  query decomp    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼              ▼
         ┌─────────┐  ┌───────────┐  ┌─────────┐  ┌───────────┐
         │  Manus  │  │Perplexity │  │  Tavily  │  │ Firecrawl │
         │  agent  │  │ synthesis │  │ grounding│  │ extraction│
         └────┬────┘  └─────┬─────┘  └────┬────┘  └─────┬─────┘
              │             │             │              │
              └──────────────┼──────────────┘              │
                             ▼                             │
                    ┌─────────────────┐◄───────────────────┘
                    │  FUSION ENGINE   │
                    │  dedup · rank    │
                    │  cite · score    │
                    └────────┬────────┘
                             │
                             ▼
                      ResearchResult
                    { summary, sources[],
                      confidenceScore }
```

### Depth modes

| Mode | Tools | Latency | Best for |
|------|-------|---------|----------|
| **`quick`** | Perplexity + Tavily | ~10–30s | Fast fact-checks, simple questions |
| **`standard`** | Perplexity + Tavily (sub-queries) + Firecrawl | ~1 min | Thorough research with structured extraction |
| **`deep`** | All four — Manus async + fast tools in parallel | ~10–15 min | Comprehensive multi-source reports |

Each tool plays to its strength:

- **Manus** — autonomous multi-step web research agent, handles complex tasks that require browsing and reasoning
- **Perplexity** — real-time synthesis with inline citations, great for overviews
- **Tavily** — fast AI-optimized search with relevance scoring, ideal for grounding claims
- **Firecrawl** — structured data extraction from web pages, schema-driven output

---

## Quickstart

```bash
# Clone and install
pnpm install

# Configure API keys
cp .env.example .env
# Fill in: MANUS_API_KEY, PERPLEXITY_API_KEY, TAVILY_API_KEY, FIRECRAWL_API_KEY

# Build and run
pnpm build
pnpm dev
```

### Make a research request

```bash
# Quick — Perplexity + Tavily, returns in seconds
curl -s http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "State of agentic AI frameworks 2026", "depth": "quick"}' | jq

# Standard — adds Firecrawl extraction + sub-query decomposition
curl -s http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query": "Compare LangGraph vs CrewAI for production use", "depth": "standard"}' | jq

# Deep — all four tools including Manus autonomous agent
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
  "summary": "...",                    // Best available synthesis
  "sources": [                         // Deduplicated, ranked by credibility
    {
      "url": "https://...",
      "title": "...",
      "snippet": "...",
      "sourceTool": "perplexity",
      "credibilityScore": 0.85
    }
  ],
  "confidenceScore": 0.91,            // Weighted blend of coverage + credibility
  "toolResults": [ ... ]              // Raw per-tool results for inspection
}
```

---

## Architecture

```
deep-research/
├── apps/
│   └── api/                     → Hono HTTP server (entrypoint)
├── packages/
│   ├── types/                   → Zod schemas + shared TypeScript types
│   ├── orchestrator/            → Depth routing, query decomposition, tool dispatch
│   ├── fusion/                  → Dedup, credibility ranking, confidence scoring
│   └── tools/
│       ├── manus/               → Async webhook-first client + in-process task store
│       ├── perplexity/          → Sonar deep-research model client
│       ├── tavily/              → Search API client with multi-query support
│       └── firecrawl/           → Search + schema-driven extraction client
└── docs/
    ├── ARCHITECTURE.md          → As-implemented architecture documentation
    ├── BEST_ARCHITECTURE.md     → Spec-aligned target architecture
    ├── GAP_ANALYSIS.md          → Current vs target gap analysis
    ├── IMPLEMENTATION_PLAN.md   → Phased implementation plan
    ├── USER_STORIES.md          → Epic-level backlog stories
    ├── USER_STORIES_PER_EPIC.md → One canonical story per epic
    └── BLUEPRINT.md             → Original design blueprint
```

### Key design decisions

- **Hono over Express** — 10x smaller, zero dependencies, edge-runtime compatible for future deployment on Cloudflare Workers or Vercel Edge
- **`ToolResult` as universal interface** — every tool returns the same shape; adding a 5th tool means implementing one function
- **Fusion separate from orchestration** — synthesis logic is independently testable; the orchestrator only routes, the fusion engine only merges
- **Graceful degradation** — if any tool fails, the pipeline continues with remaining results; `confidenceScore` reflects the gap

### Credibility scoring

The fusion engine applies per-tool credibility weights based on source quality:

| Tool | Weight | Rationale |
|------|--------|-----------|
| Manus | 0.90 | Multi-step autonomous research, highest synthesis depth |
| Perplexity | 0.85 | Real-time web grounding with citations |
| Firecrawl | 0.80 | Direct content extraction, less filtered |
| Tavily | 0.75 | Fast search, good breadth but lower per-result depth |

---

## API Reference

### `POST /research`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `query` | `string` | *required* | Natural language research query |
| `depth` | `"quick" \| "standard" \| "deep"` | `"standard"` | Research depth mode |
| `outputFormat` | `string` | `"markdown_report"` | Output format (see below) |
| `maxSources` | `number` | `50` | Maximum sources to return (1–500) |
| `language` | `string` | `"en"` | Preferred language |

**Output formats:** `markdown_report`, `structured_json`, `executive_summary`, `rag_chunks`, `citations_list`

### `GET /health`

Returns server status and Manus task store size.

### `POST /webhooks/manus`

Receives async results from Manus. Verifies HMAC signature when `MANUS_WEBHOOK_SECRET` is set.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MANUS_API_KEY` | Yes | Manus API key |
| `PERPLEXITY_API_KEY` | Yes | Perplexity API key |
| `TAVILY_API_KEY` | Yes | Tavily API key |
| `FIRECRAWL_API_KEY` | Yes | Firecrawl API key |
| `MANUS_WEBHOOK_SECRET` | Recommended | HMAC secret for webhook verification |
| `WEBHOOK_BASE_URL` | For deep mode | Public URL where Manus delivers results |
| `PORT` | No (default: 3000) | HTTP server port |

---

## Development

```bash
pnpm install          # Install all workspace packages
pnpm build            # Build all packages
pnpm dev              # Start API in watch mode
pnpm test             # Run vitest across all packages
pnpm lint             # ESLint check
pnpm typecheck        # TypeScript type check
```

### Stack

- **Runtime:** Node.js 22, TypeScript 5
- **API:** [Hono](https://hono.dev)
- **Validation:** [Zod](https://zod.dev)
- **Monorepo:** pnpm workspaces
- **Build:** [tsup](https://tsup.egoist.dev)
- **Test:** [Vitest](https://vitest.dev)

---

## Roadmap

- [ ] Async job pattern for `deep` mode (BullMQ + Redis)
- [ ] LLM-powered query decomposition (replace naive stub)
- [ ] Semantic deduplication via embeddings
- [ ] `outputFormat` and `maxSources` actually applied downstream
- [ ] Retry with exponential backoff on tool clients
- [ ] Langfuse tracing for observability
- [ ] Authentication + rate limiting
- [ ] Exa.ai as 5th tool (semantic search)
- [ ] Agentic orchestrator — LLM planner replaces fixed routing
- [ ] Temporal workflows for durable execution

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) §6–9 for detailed analysis of each improvement area and the phased evolution plan.

---

## License

MIT
