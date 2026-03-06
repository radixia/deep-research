# AGENT.md — Working Notes for AI Agents

> Read this before touching any code. It's the fast-path to understanding the repo.

## What to read first

1. `CLAUDE.md` — architecture, commands, conventions
2. `docs/BLUEPRINT.md` — full design doc with pseudocode and rationale
3. `packages/types/src/index.ts` — shared types/schemas (source of truth for data shapes)

## Current state (as of March 2026)

The skeleton is in place. All packages exist and compile. The API server runs.
**But most tool clients are stubs** — they need real API integration.

## Open tasks (in priority order)

### 1. Wire real API clients

Each tool client lives in `packages/tools/<name>/src/index.ts` and must implement:

```typescript
interface ToolClient {
  run(query: string, options?: Record<string, unknown>): Promise<ToolResult>;
}
```

Check `packages/types/src/index.ts` for the `ToolResult` shape.

**Manus** (`packages/tools/manus/`):
- Uses `https://open.manus.im` REST API
- Auth: `Authorization: Bearer $MANUS_API_KEY`
- Flow: `POST /v1/tasks` → get `task_id` → webhook push or poll `GET /v1/tasks/{id}`
- See BLUEPRINT.md §Manus for full example

**Perplexity** (`packages/tools/perplexity/`):
- OpenAI-compatible SDK, model: `sonar-deep-research` (or `sonar-pro` for faster)
- Returns inline citations in `response.citations[]`

**Tavily** (`packages/tools/tavily/`):
- Install `@tavily/core`
- Method: `tavily.search({ query, searchDepth: "advanced", maxResults: 10 })`
- Extract URLs + snippets → map to `Citation[]`

**Firecrawl** (`packages/tools/firecrawl/`):
- Install `@mendable/firecrawl-js`
- Use `/agent` endpoint for autonomous search (no URL needed)
- Or `scrapeUrl` + `extract` for structured output

### 2. Wire Manus webhook result storage

`apps/api/src/index.ts` — the `/webhooks/manus` handler receives results but throws them away.
Add a simple in-memory store (Map) for now, keyed by `task_id`.
The `deep` research flow should await this result via polling the store.

### 3. Improve query decomposer

`packages/orchestrator/src/index.ts` — the `decompose()` function is a naive string template.
Replace with a real LLM call (Claude via Anthropic SDK recommended):

```typescript
async function decompose(query: string): Promise<string[]> {
  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{
      role: "user",
      content: `Break this research query into 3-5 focused sub-queries for parallel search.
Query: "${query}"
Return only a JSON array of strings.`
    }]
  });
  return JSON.parse(resp.content[0].text);
}
```

### 4. Semantic dedup in FusionEngine

Currently dedup is URL-exact only. Add embedding-based similarity:
- Use `@xenova/transformers` for local embeddings (no API key)
- Or OpenAI `text-embedding-3-small` for quality
- Threshold: cosine similarity > 0.92 → treat as duplicate, keep higher-credibility

### 5. Add Langfuse tracing

Wrap all tool `run()` calls and LLM calls with Langfuse spans.
Useful for debugging slow queries and comparing tool performance.

---

## Things NOT to change

- `packages/types/src/index.ts` — change only additive (never remove fields without checking all consumers)
- The `/research` API shape — breaking change, requires versioning
- The tool weight constants in `FusionEngine` — only adjust after benchmarking

## File-by-file quick reference

| File | Purpose |
|------|---------|
| `apps/api/src/index.ts` | HTTP routes + server bootstrap |
| `apps/api/src/config.ts` | Env var parsing (Zod) |
| `packages/orchestrator/src/index.ts` | Depth routing + tool dispatch |
| `packages/fusion/src/index.ts` | Merge, dedup, rank, confidence score |
| `packages/types/src/index.ts` | All shared Zod schemas + TS types |
| `packages/tools/*/src/index.ts` | Individual API clients |

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
```

## Notes on Manus

Manus is the most complex client because it's async. In `deep` mode:
1. Fire `POST /v1/tasks` immediately
2. Run Perplexity + Tavily + Firecrawl in parallel (they're fast)
3. Await Manus result via webhook/polling
4. Pass everything to FusionEngine

If Manus times out or fails, the research still completes with the fast tools — `confidenceScore` will reflect the missing source. This is intentional resilience.

## Naming conventions

- Tool names in code: `"manus"`, `"perplexity"`, `"tavily"`, `"firecrawl"` (lowercase, exact)
- These strings appear in `ToolResult.tool` and are used by FusionEngine for weighting — don't change them
