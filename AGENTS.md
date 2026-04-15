# AGENTS.md — Agent memory & working notes

> Leggi questo prima di toccare il codice: combina memoria continuativa e panoramica rapida sul repo.

## Learned user preferences

- When something fails in the terminal or tests, expect the agent to reproduce the problem locally (run the same commands), then fix code or config rather than only suggesting steps.
- Requests like "try it now" or "run the test" mean actually execute the command and report the outcome.
- The user sometimes writes in Italian; respond in Italian when the user message is in Italian.

## Learned workspace facts

- Research job state is persisted by default to a file (`JOB_STORE_PATH`, default `output/jobs.json`) via `FileJobSessionStore` in `apps/api/src/job-session-store/`; an in-memory store and types remain in `apps/api/src/job-store.ts`. No Redis or database yet.
- E2E checks live under `test/e2e/` (e.g. `research.e2e.mjs`); they need the API running (`pnpm dev`) and `API_KEY` in the environment when the server requires it.
- Root `package.json` uses `"type": "module"` so Vitest and Node scripts run as ESM without the Vite Node CJS deprecation warning.
- Brave Search is integrated as a research tool alongside Perplexity, Tavily, Firecrawl, and Manus; depth modes control which tools run.
- Manus callbacks use `POST /webhooks/manus`; for local dev the public base URL (tunnel such as ngrok) must match `WEBHOOK_BASE_URL` and signature verification must succeed or the hook returns 401.
- Manus webhook results are held in-process via `ManusTaskStore` (`packages/tools/manus/`), wired from `apps/api/src/index.ts` — not thrown away. For horizontal scaling, replacing the store with Redis (or similar) is a follow-up; see `ISSUES.md`.

---

## Cursor Cloud specific instructions

### Overview

This is a TypeScript monorepo (pnpm workspaces) for a Deep Research Agent API. See `CLAUDE.md` and `README.md` for full architecture and commands.
For cloud-agent onboarding and practical run/test workflows, start with `docs/skills/cloud-agent-starter.md`.

### Services

| Service | Port | Command | Notes |
|---------|------|---------|-------|
| Hono API server | 3000 | `pnpm dev` | Builds all packages then starts tsx watch mode |

No databases, Docker, or external infrastructure needed — all state is in-process memory.

### Key commands

Standard commands are in root `package.json` and documented in `README.md`. Quick reference:

- **Install**: `pnpm install`
- **Build**: `pnpm build`
- **Dev**: `pnpm dev` (builds first, then starts API with tsx --watch)
- **Test**: `pnpm test` (vitest, 14 unit tests across 4 files)
- **Lint**: `pnpm lint` (ESLint 9 flat config)
- **Typecheck**: `pnpm typecheck`

### Non-obvious caveats

1. **esbuild build scripts must be approved**: The root `package.json` has `pnpm.onlyBuiltDependencies: ["esbuild"]` to allow esbuild post-install scripts. Without this, `tsup` builds will fail silently.

2. **API keys required at startup**: The API server validates 5 API keys via Zod at boot (`apps/api/src/config.ts`): `MANUS_API_KEY`, `PERPLEXITY_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`, `BRAVE_API_KEY`. The server crashes immediately if any are missing. `ANTHROPIC_API_KEY` is optional.

3. **Auth middleware**: When `API_KEY` env var is set, the `/research` endpoint requires `x-api-key` header or `Authorization: Bearer` header matching it. When unset/empty, auth is skipped.

4. **Async job pattern**: `POST /research` returns `202 { jobId, status: "pending" }`. Poll `GET /research/:jobId` until status is `completed` or `failed`. Quick-mode research takes ~60-120s (Perplexity is the slow tool).

5. **`.env` location**: The API dev script loads env from `../../.env` relative to `apps/api/` (i.e., the workspace root `.env`). Copy `.env.example` to `.env` and populate keys.

6. **ESLint 9 flat config**: The project uses `eslint.config.js` (ESLint 9 flat config format). The `test/` directory is excluded from linting.

---

## What to read first

1. `CLAUDE.md` — architecture, commands, conventions
2. `docs/BLUEPRINT.md` — full design doc with pseudocode and rationale
3. `packages/types/src/index.ts` — shared types/schemas (source of truth for data shapes)

## Current state (as of March 2026)

The skeleton is in place. All packages exist and compile. The API server runs. Tool packages are wired; verify behaviour and API coverage per tool when changing integrations.

## Open tasks (in priority order)

### 1. Wire / harden real API clients

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

### 2. Manus webhook durability (optional next step)

Webhook delivery is implemented (`ManusTaskStore` + `POST /webhooks/manus`). For multi-instance or crash safety, persist task completion externally (e.g. Redis) instead of only in-process storage.

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
2. Run Perplexity + Tavily + Firecrawl (and other fast tools per depth) in parallel
3. Await Manus result via webhook / `ManusTaskStore.waitFor`
4. Pass everything to FusionEngine

If Manus times out or fails, the research still completes with the fast tools — `confidenceScore` will reflect the missing source. This is intentional resilience.

## Naming conventions

- Tool names in code: `"manus"`, `"perplexity"`, `"tavily"`, `"firecrawl"`, `"brave"` (lowercase, exact)
- These strings appear in `ToolResult.tool` and are used by FusionEngine for weighting — don't change them casually
