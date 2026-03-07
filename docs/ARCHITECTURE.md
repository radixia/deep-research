# Deep Research Agent — Architecture Documentation

> Version 0.1.0 — March 2026  
> Status: Alpha / Internal

---

## 1. Overview

**Deep Research Agent** is a TypeScript monorepo that orchestrates multiple AI search and research APIs into a unified pipeline. It accepts a natural language query, routes it across up to four specialized tools, fuses the results, and returns a ranked, deduplicated research report.

### Design goals

- **Single API surface** — one `POST /research` endpoint regardless of how many tools run underneath
- **Depth-adaptive** — three modes (`quick`, `standard`, `deep`) with different tool combinations and latency profiles
- **Resilient by design** — any individual tool failure degrades gracefully; the pipeline still returns a partial result
- **Zero-opinion on LLMs** — the fusion layer synthesizes tool output without imposing an LLM; synthesis quality is bounded by the tools, not by a separate generation step (by design, for now)

---

## 2. Repository structure

```
deep-research/
├── apps/
│   └── api/                     → HTTP server (Hono) — main entrypoint
│       └── src/
│           ├── index.ts          → routes, server bootstrap, ManusTaskStore singleton
│           └── config.ts         → env var parsing (plain object, not Zod-validated)
│
├── packages/
│   ├── types/                   → shared Zod schemas + TypeScript types
│   │   └── src/index.ts
│   │
│   ├── orchestrator/            → query routing + tool dispatch
│   │   └── src/index.ts
│   │
│   ├── fusion/                  → dedup + ranking + confidence score
│   │   └── src/index.ts
│   │
│   └── tools/
│       ├── manus/               → Manus API client (async, webhook-first)
│       │   └── src/
│       │       ├── index.ts
│       │       └── store.ts     → in-process ManusTaskStore
│       ├── perplexity/          → Perplexity Sonar client
│       ├── tavily/              → Tavily Search client
│       └── firecrawl/           → Firecrawl search + extract client
│
├── docs/
│   └── ARCHITECTURE.md          → this file
├── CLAUDE.md                    → LLM quick reference
├── AGENT.md                     → coding agent working notes
└── pnpm-workspace.yaml
```

---

## 3. Data flow

```
Client
  │
  ▼
POST /research { query, depth, outputFormat, maxSources }
  │
  ▼
ResearchQuerySchema (Zod validation)
  │
  ▼
ResearchOrchestrator.research()
  │
  ├─── depth = "quick" ──────────────────────────────────────────────────────┐
  │     Promise.all([                                                         │
  │       perplexity.run(query),                                             │
  │       tavily.run(query, { maxResults: 5 })                               │
  │     ])                                                                   │
  │                                                                          │
  ├─── depth = "standard" ───────────────────────────────────────────────────┤
  │     subQueries = decompose(query)   ← naive stub, needs LLM             │
  │     Promise.all([                                                         │
  │       perplexity.run(query),                                             │
  │       ...subQueries.map(q => tavily.run(q)),                             │
  │       firecrawl.run(query)                                               │
  │     ])                                                                   │
  │                                                                          │
  └─── depth = "deep" ───────────────────────────────────────────────────────┤
        manusPromise = manus.run(query)    ← fires async                    │
        fastResults = await Promise.all([  ← runs in parallel               │
          perplexity.run(query),                                             │
          ...subQueries.map(q => tavily.run(q)),                             │
          firecrawl.run(query)                                               │
        ])                                                                   │
        manusResult = await manusPromise   ← waits for Manus                │
        return [...fastResults, manusResult]                                 │
                                                                            │
  ◄───────────────────────────────────────────────────────────────────────────┘
  │
  ▼
FusionEngine.merge(query, toolResults[])
  │
  ├── 1. dedupByUrl()         → URL-exact deduplication, keep highest credibility
  ├── 2. applyCredibility()   → apply per-tool weight multiplier
  ├── 3. sort()               → rank by credibilityScore descending
  ├── 4. buildSummary()       → passthrough rawOutput from highest-priority tool
  └── 5. computeConfidence()  → weighted blend (successRate + avgCredibility + coverage)
  │
  ▼
ResearchResult { query, depth, status, summary, sources[], toolResults[], confidenceScore }
  │
  ▼
HTTP 200 JSON
```

---

## 4. Modules in detail

### 4.1 `packages/types` — Canonical data contracts

All inter-package communication goes through types defined here. No package imports from another's internals.

**Key types:**

```typescript
// The input contract
ResearchQuery {
  query: string           // min 1 char
  depth: "quick" | "standard" | "deep"   // default: "standard"
  outputFormat: "markdown_report" | "structured_json" | "executive_summary"
              | "rag_chunks" | "citations_list"    // default: "markdown_report"
  maxSources: number      // 1-500, default 50
  language: string        // default "en"
}

// What every tool must return
ToolResult {
  tool: string            // "manus" | "perplexity" | "tavily" | "firecrawl"
  rawOutput: unknown | null
  citations: Citation[]
  latencyMs: number
  success: boolean
  error?: string          // present only when success = false
}

// A single source
Citation {
  url: string (URL)
  title: string
  snippet: string
  sourceTool: "manus" | "perplexity" | "tavily" | "firecrawl"
  fetchedAt: Date
  credibilityScore: number  // 0–1
}
```

**Design note:** `ToolResult.rawOutput` is typed as `unknown` intentionally. The FusionEngine doesn't need to know the internal structure of Tavily's JSON or Perplexity's response — it operates only on `citations[]` and the string representation of `rawOutput`.

---

### 4.2 `packages/orchestrator` — Query routing

The orchestrator is the only module that knows about all four tools. It decides which tools to invoke, in what combination, and at what parallelism level.

**Depth strategy table:**

| Depth | Tools invoked | Parallelism | Typical latency |
|-------|--------------|-------------|-----------------|
| `quick` | Perplexity + Tavily (5 results) | Full parallel | 10–30s |
| `standard` | Perplexity + Tavily×N (sub-queries) + Firecrawl | Full parallel | ~1 min |
| `deep` | All four — Manus async + fast tools parallel | Mixed | 10–15 min |

**Sub-query decomposition (`decompose()`):**

Currently a naive stub that always returns the same 4 variants regardless of query content:
```
"${query}"
"${query} latest news 2026"
"${query} comparison analysis"
"${query} best practices"
```

This is a known limitation — see §6 for the planned LLM-based replacement.

**Error handling:** The orchestrator does not retry. If a tool throws, the error propagates as `success: false` in the ToolResult. The caller (the API handler) catches top-level throws and returns `status: "failed"`.

---

### 4.3 `packages/fusion` — Merge, rank, score

The FusionEngine is stateless. It takes a list of `ToolResult[]` and returns a `FusionResult`.

**Deduplication — `dedupByUrl()`:**
- Normalizes URLs (removes trailing slash)
- For duplicates across tools, keeps the version with the higher `credibilityScore`
- **Limitation:** URL-exact only — same article on different domains or with tracking parameters counts as different

**Credibility scoring — `applyCredibility()`:**

Per-tool weights reflect approximate source quality:

| Tool | Weight | Rationale |
|------|--------|-----------|
| Manus | 0.90 | Multi-step autonomous research, highest synthesis quality |
| Perplexity | 0.85 | Real-time web grounding with citations |
| Firecrawl | 0.80 | Direct content extraction, less filtered |
| Tavily | 0.75 | Fast search, lower per-result depth |

Formula: `credibilityScore = min(1, baseScore × weight + weight × 0.1)`

The `weight × 0.1` additive term is a "tool bonus" that slightly elevates scores from higher-quality tools even when the base score is low. This is intentional but has the side effect of compressing the score range — see §6.

**Confidence score — `computeConfidence()`:**

```
confidence = (successRate × 0.3) + (avgCredibility × 0.5) + (logCoverage × 0.2)
```

- `successRate`: fraction of tools that returned `success: true`
- `avgCredibility`: mean credibility of unique sources
- `logCoverage`: `log(1 + count) / log(1 + 100)` — logarithmic to prevent inflation from many low-quality sources

**Summary building — `buildSummary()`:**

Selects `rawOutput` from the highest-priority successful tool (Manus > Perplexity > Firecrawl > Tavily) and returns it verbatim. There is **no cross-tool synthesis** — this is a known limitation and the most significant gap in the current implementation.

---

### 4.4 `packages/tools/manus` — Async deep research

Manus is qualitatively different from the other tools: it's async, browser-based, and operates at human-equivalent research depth.

**API flow:**
```
POST /v1/tasks { task, webhook_url, return_format: "markdown" }
  → { task_id }
  → [Manus researches autonomously, 5–15 minutes]
  → POST {webhook_url} { task_id, status, result }
```

**Webhook-first delivery (implemented via `ManusTaskStore`):**

```
API server creates ManusTaskStore singleton (in-process Map)
  │
ManusClient.run()
  ├── createTask()     → fires task to Manus, gets task_id
  ├── store.init()     → marks task_id as "pending" in store
  ├── [fast tools run in parallel]
  └── store.waitFor()  → polls Map every 500ms until result arrives
                                    ▲
POST /webhooks/manus                │
  ├── verify HMAC signature         │
  └── store.set(task_id, result) ───┘

ManusClient falls back to direct API polling if no store is injected.
```

**ManusTaskStore:**
- `Map<string, StoredTask>` in process memory
- TTL: 1 hour; cleanup: every 10 minutes
- `waitFor(taskId, timeoutMs)`: polls every 500ms, marks as failed on timeout
- Exposed via `/health` → `manusStore.size`

**Limitation:** Single-process only. Horizontal scaling breaks this without moving to Redis or a shared DB.

---

### 4.5 `packages/tools/perplexity` — Synthesized web answers

Uses the `sonar-deep-research` model (configurable). Sends a single chat completion request with `return_citations: true`. Timeout: 120 seconds.

Citations are extracted from the `response.citations[]` array which Perplexity returns in two possible formats (string URL or object with url/title/snippet) — both handled.

---

### 4.6 `packages/tools/tavily` — Fast keyword + semantic search

Uses `/search` with `search_depth: "advanced"` and `include_raw_content: true`. Timeout: 30 seconds.

Tavily already returns a relevance `score` per result (0–1) which is mapped directly to `credibilityScore` — the only tool client that uses a real signal instead of a hardcoded 0.5.

Additional method: `runMulti(queries[])` for parallel execution of multiple sub-queries (used in `standard` and `deep` modes).

---

### 4.7 `packages/tools/firecrawl` — Structured extraction

Two modes depending on whether a schema is passed:
- **No schema** → `POST /v1/search` — autonomous content search and extraction
- **With schema** → `POST /v1/extract` — schema-driven structured data extraction

Both return markdown content. Timeout: 60 seconds.

The schema mode is not currently used by the orchestrator but is available for callers that need structured output (e.g. "extract pricing from competitor websites").

---

### 4.8 `apps/api` — HTTP server

Built on **Hono** (lightweight, edge-compatible). Three routes:

```
GET  /              → health ping
GET  /health        → { status, manusStoreTasks }
POST /research      → main research endpoint
POST /webhooks/manus → Manus async result delivery
```

The `manusStore` singleton is created at server startup and injected into `ManusClient` at construction time. This is the shared memory boundary between the webhook handler and the research pipeline.

**HMAC verification** on the webhook endpoint is optional (controlled by `MANUS_WEBHOOK_SECRET`). In production it should be mandatory.

---

## 5. Key architectural decisions

### Why Hono over Express?
Hono is ~10x smaller, has zero dependencies, and is edge-runtime compatible (Cloudflare Workers, Vercel Edge). If this service needs to run on Lambda@Edge or Cloudflare, zero migration cost.

### Why pnpm workspaces?
Direct TypeScript imports between packages without a bundler step during development. Each package compiles independently with tsup. This keeps build times fast even as the monorepo grows.

### Why in-process store for Manus instead of Redis?
For a single-instance deployment (current state), a `Map` is simpler, faster, and has zero operational overhead. The abstraction (`ManusTaskStore`) is designed to be swappable — replacing the internal `Map` with a Redis client is a localized change.

### Why ToolResult as the universal return type?
All tools speak the same language. FusionEngine, the orchestrator, and the API handler never need to know which tool produced which result format. This makes adding a 5th tool (e.g. Exa) a matter of implementing a single interface.

### Why no LLM synthesis in FusionEngine?
Deliberate deferral. Adding an LLM synthesis step in FusionEngine would make every research request also incur an LLM call for summarization — cost that scales linearly with usage. The current architecture returns the best raw tool output, letting the caller decide whether to post-process it. A synthesis step should be opt-in via `outputFormat`.

---

## 6. Identified improvement areas

### 6.1 🔴 Critical: `deep` mode is not production-deployable

**Problem:** `runDeep()` is synchronous from the HTTP perspective. Manus can take up to 15 minutes. No HTTP client or load balancer will hold a connection open for 15 minutes.

**Solution:** Adopt an async job pattern:

```
POST /research → { jobId, status: "pending" }
GET  /research/:jobId → { status: "running" | "completed", result? }
```

The orchestrator stores job state in Redis (or Postgres). The HTTP handler returns immediately with a job ID. The client polls or subscribes via SSE.

**Alternative (simpler):** For `quick` and `standard`, keep synchronous. For `deep`, auto-switch to async. Communicate this via the response shape.

---

### 6.2 🔴 Critical: `decompose()` must be LLM-powered

**Problem:** The current stub produces identical sub-queries for every input. This wastes 3 Tavily calls per request.

**Recommended implementation:**
```typescript
async function decompose(query: string, anthropic: Anthropic): Promise<string[]> {
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5",   // cheapest model, fast
    max_tokens: 256,
    messages: [{
      role: "user",
      content: `Break this research query into 3-5 focused, non-overlapping sub-queries.
Query: "${query}"
Return only a JSON array of strings. No explanation.`
    }]
  });
  return JSON.parse(msg.content[0].text);
}
```

Use `claude-haiku` (cheapest/fastest) since this is a structural task, not a synthesis task.

---

### 6.3 🟡 FusionEngine should honor `outputFormat` and `maxSources`

Both fields are validated in the schema but never read downstream.

**`maxSources`** → cap `ranked.slice(0, maxSources)` before returning.

**`outputFormat`** → implement a formatter step after FusionEngine:

| Format | Output |
|--------|--------|
| `markdown_report` | Current behavior (default) |
| `structured_json` | `{ summary, sources[], metadata }` |
| `executive_summary` | 3-paragraph synthesis via LLM |
| `rag_chunks` | Sources split into 512-token chunks with embeddings |
| `citations_list` | Just the ranked URL list, no text |

---

### 6.4 🟡 Credibility scoring needs real signals

Currently every tool client hardcodes `credibilityScore: 0.5` (except Tavily which uses its own relevance score). The FusionEngine then applies a tool-weight multiplier — but the input signals are all identical.

**Recommended improvements:**

1. **Domain authority** — maintain a static allowlist of high-credibility domains (Nature, arxiv.org, official docs) and boost their score
2. **Freshness** — `fetchedAt` is captured but never used; recent sources should score higher for time-sensitive queries
3. **Citation density** — sources cited by multiple tools independently should score higher (cross-validation signal)

---

### 6.5 🟡 Config validation at startup

```typescript
// Current — fails silently at runtime
export const config = {
  manusApiKey: process.env["MANUS_API_KEY"] ?? "",
  ...
}

// Recommended — fails fast at boot with a clear error
const ConfigSchema = z.object({
  MANUS_API_KEY: z.string().min(1, "MANUS_API_KEY is required"),
  PERPLEXITY_API_KEY: z.string().min(1),
  ...
});
export const config = ConfigSchema.parse(process.env);
```

---

### 6.6 🟢 Add retry logic to tool clients

All tool clients currently do one attempt. A single network timeout causes permanent failure for that tool.

**Recommended:** exponential backoff with 2 retries, jitter, and a max of 3 attempts total. Use a library like `p-retry` (1KB, no dependencies).

---

### 6.7 🟢 Semantic deduplication

URL-exact dedup misses: same article on different domains, paywalled vs open versions, AMP vs canonical URLs, tracking parameters.

**Recommended:** after URL dedup, run cosine similarity on snippet embeddings. Sources with similarity > 0.92 are considered duplicates; keep the higher-credibility one.

Options:
- `@xenova/transformers` — local, no API key, `all-MiniLM-L6-v2` (22MB model), ~50ms per snippet
- OpenAI `text-embedding-3-small` — API cost but higher quality, consistent with other OpenAI usage

---

## 7. Recommended libraries and services to add

### Observability
| Library | Purpose | Why |
|---------|---------|-----|
| **Langfuse** (OSS) | LLM tracing — latency, cost, quality per tool call | Free self-hosted, native TypeScript SDK, shows exactly which tool is slow/expensive |
| **Pino** | Structured JSON logging | Replaces `console.log`, production-ready, same API |

### Infrastructure
| Service/Library | Purpose | Why |
|----------------|---------|-----|
| **Redis** (Upstash serverless) | Job state for async deep mode + result cache | Zero-infra, pay-per-use, compatible with Vercel/Lambda edge |
| **BullMQ** | Job queue for async research tasks | Built on Redis, retry/delay/priority out of the box |

### Quality
| Library | Purpose | Why |
|---------|---------|-----|
| **p-retry** | Retry with exponential backoff | 1KB, handles the retry gap in all tool clients |
| **zod-to-json-schema** | Auto-generate OpenAPI spec from existing Zod schemas | Zero maintenance cost, always in sync |

### Search & retrieval
| Service | Purpose | Why |
|---------|---------|-----|
| **Exa.ai** | Semantic search — 5th tool | Finds conceptually related content that keyword search misses; particularly strong for academic and technical queries |
| **Jina AI Reader** | URL-to-markdown conversion | Alternative to Firecrawl for scraping individual URLs, cheaper for high-volume use |

### Developer experience
| Tool | Purpose | Why |
|------|---------|-----|
| **Vitest** (already installed) | Unit + integration tests | Zero-config with TypeScript, co-located with source, fast |
| **msw** (Mock Service Worker) | Mock HTTP calls in tests | Test tool clients without real API calls |

### Workflow orchestration
| Library/Service | Purpose | Why |
|----------------|---------|-----|
| **Temporal** | Durable workflow execution engine | See §7.1 for full analysis |

---

## 7.1 Temporal — Extended analysis

[Temporal](https://temporal.io) is a workflow execution engine: your TypeScript code becomes a durable workflow that Temporal checkpoints and resumes automatically, even across process crashes. Individual API calls become **Activities** with declarative retry and timeout policies.

### Why it's relevant here

The most critical architectural gap (§6.1) — `deep` mode is synchronous while Manus takes up to 15 minutes — is **exactly** the problem Temporal is designed for. The existing `ResearchOrchestrator` maps almost 1:1 to a Temporal Workflow:

```typescript
export async function ResearchWorkflow(query: ResearchQuery): Promise<ResearchResult> {
  const acts = proxyActivities<ResearchActivities>({
    // Declarative timeouts per tool — no manual AbortSignal
    startToCloseTimeout: {
      manus:      "15 minutes",
      perplexity: "2 minutes",
      tavily:     "30 seconds",
      firecrawl:  "1 minute",
    },
    // Built-in retry with exponential backoff — replaces p-retry
    retry: { maximumAttempts: 3, backoffCoefficient: 2 },
  });

  if (query.depth === "deep") {
    // Promise.all inside a Workflow: Temporal checkpoints each Activity result.
    // If the process crashes here, it resumes from the last completed Activity.
    const [fastResults, manusResult] = await Promise.all([
      Promise.all([acts.runPerplexity(query.query), acts.runTavily(query.query)]),
      acts.runManus(query.query),
    ]);
    return fuseResults([...fastResults, manusResult]);
  }
  // ...
}
```

### Manus webhook as a Temporal Signal

The most elegant benefit: the Manus webhook becomes a **Signal** — Temporal manages the wait state instead of the in-process `ManusTaskStore`:

```typescript
// apps/api — webhook handler
await temporalClient.getHandle(workflowId).signal("manusCompleted", { result, status });

// Inside the Workflow Activity for Manus
const result = await condition(() => manusSignalReceived, "15 minutes");
```

`ManusTaskStore` is no longer needed — Temporal owns the state.

### What Temporal solves vs. the current plan

| Problem | BullMQ + Redis (current plan) | Temporal |
|---------|-------------------------------|----------|
| `deep` mode async | ✅ Job ID + polling | ✅ Workflow ID + polling |
| Crash durability | ❌ Job lost, restarts from zero | ✅ Resumes from last checkpoint |
| Retry per tool | Manual (`p-retry`) | ✅ Declarative per Activity |
| Per-tool timeouts | Manual (`AbortSignal`) | ✅ `startToCloseTimeout` |
| Visibility | BullMQ dashboard (basic) | ✅ Temporal UI — full event history |
| Manus webhook state | `ManusTaskStore` (in-memory) | ✅ Signal — Temporal owns state |

### Drawbacks

- **Operational overhead**: requires a Temporal server (self-hosted via `docker compose`, or Temporal Cloud which is paid)
- **Learning curve**: Workflow/Activity/Worker/TaskQueue/Signal are new primitives — 1-2 days ramp-up for a developer unfamiliar with the model
- **Overkill for `quick` mode**: 10–30s synchronous requests don't benefit from Temporal's async machinery; the polling overhead adds unnecessary latency
- **Not edge-compatible**: Temporal Workers are long-running processes — incompatible with Cloudflare Workers or Vercel Edge Functions

### Recommendation

**Adopt in two phases:**

```
Phase 1 — Alpha (now)
  BullMQ + Redis (Upstash serverless)
  → Fixes deep mode with minimal new concepts
  → Zero infrastructure added (Upstash is serverless)
  → Ship in days

Phase 2 — Beta / multi-tenant
  Migrate orchestrator → Temporal Workflow
  Migrate tool clients → Activities
  → Each tool.run() becomes an Activity (surgical change)
  → ManusTaskStore removed entirely
  → Manus webhook becomes a Signal
  → Full durability, retry, visibility
  → Temporal Cloud or self-hosted k8s deployment
```

Temporal is the right long-term destination for this architecture. The migration from Phase 1 to Phase 2 is additive — BullMQ job logic maps directly onto Temporal Workflow/Activity patterns with no conceptual rewrite required.

---

## 8. Deployment notes

**Current state:** Designed for single-instance Node.js deployment (Hono + `@hono/node-server`).

**Scaling path:**

```
Single instance (current)
  → Stateless replicas behind load balancer
    (requires: move ManusTaskStore → Redis)
  → Edge deployment (Cloudflare Workers / Vercel Edge)
    (requires: replace @hono/node-server with native fetch handler)
  → Async job architecture — Phase 1
    (requires: BullMQ + Redis + job ID polling endpoint)
  → Durable workflow architecture — Phase 2
    (requires: Temporal server + Worker process + migrate Orchestrator → Workflows)
```

The architecture is designed so each step in this path is an additive change, not a rewrite.

---

## 9. Roadmap to Beta and beyond

### 9.1 What's missing for beta

**Hard blockers** — senza questi il sistema non può essere consegnato a utenti esterni:

| Gap | Perché blocca |
|-----|--------------|
| **Async job pattern** (`deep` mode) | Nessun client aspetta 15 minuti su una richiesta HTTP sincrona |
| **Authentication** | L'API è aperta a chiunque — un API key header è sufficiente per beta |
| **Rate limiting** | Senza limiti, un singolo utente esaurisce tutti e quattro i budget tool in minuti |
| **Config validation at boot** | Senza Zod su `process.env`, il server parte silenziosamente rotto se manca una chiave |
| **LLM-based `decompose()`** | Attualmente spreca 3 chiamate Tavily su sub-query identiche — problema di costo reale |

**Importanti ma non bloccanti:**

| Gap | Note |
|-----|-------|
| Retry sui tool client | Un flap di rete causa failure permanente — `p-retry`, 2 righe per client |
| `outputFormat` e `maxSources` che funzionano davvero | Sono nel contratto API ma ignorati — inconsistenza che confonde i caller |
| Almeno smoke test su orchestrator e fusion | Per non deployare regressioni silenziose |
| Job persistence (Redis) | Il `ManusTaskStore` in-memory muore col processo — in beta non puoi perdere una ricerca da 15 min |

**Stima effort:** con focus, 1 settimana di sviluppo copre tutti i blockers.

---

### 9.2 Can it become agentic?

Sì — ed è la direzione naturale. Ma cambia il paradigma in modo fondamentale.

**Oggi** il sistema è una **fixed pipeline**:
```
query → [strategia depth hardcoded] → tool in parallelo → fusion → output
```

**Agentico** significa mettere un LLM come planner che decide dinamicamente:
```
query → LLM Planner
          ↓
     "Cosa so già? Cosa mi manca?"
          ↓
     seleziona tool + sub-query adattive
          ↓
     esegue, legge risultati intermedi
          ↓
     "È sufficiente? Ci sono contraddizioni?"
          ↓ [se no: loop]
     LLM Synthesizer → report finale
```

**Valore concreto che aggiungerebbe:**

- **Ricerca adattiva**: se Perplexity risponde "ci sono fonti contrastanti su X", il planner lancia una ricerca Tavily mirata su X invece di fermarsi
- **Decomposizione intelligente**: rimpiazza lo stub `decompose()` con un LLM che capisce la semantica della query
- **Multi-turn**: l'utente chiede un follow-up — "approfondisci l'angolo sulle sanzioni" — e il sistema continua la stessa sessione senza ripartire da zero
- **Sintesi reale**: invece del passthrough verbatim dal tool migliore, un LLM sintetizza i contributi di tutti i tool in un report coerente

L'architettura esistente ha già i building block giusti — `ToolResult[]` come interfaccia canonica, FusionEngine disaccoppiato dall'orchestrator. La migrazione sarebbe:

```
ResearchOrchestrator (routing hardcoded)
  → AgenticOrchestrator (LLM decide loop, tool, stop condition)
```

**Il rischio:** latenza e costo aumentano significativamente. Un loop agentico con 3–4 iterazioni può costare 10× una fixed pipeline. La soluzione: `quick` rimane pipeline sincrona, `deep` diventa agentico.

---

### 9.3 Does it make sense to use MCP servers?

**Risposta breve: sì, ma solo se il sistema diventa agentico.**

I server MCP (Model Context Protocol) espongono API di tool come interfacce standardizzate che un LLM può invocare direttamente via Claude. Esistono già server MCP in produzione per Brave Search, Firecrawl, Exa e altri.

**Se il sistema resta fixed pipeline (oggi):**
MCP non aggiunge nulla — hai già client diretti che funzionano, e mettere un LLM in mezzo a ogni chiamata API aggiunge latenza e costo senza benefici.

**Se diventa agentico:**
MCP ha senso perché Claude diventa il planner e deve invocare tool dinamicamente:

```
Claude (planner) ←→ MCP: Brave Search, Firecrawl, Exa
                 ←→ Client direct: Manus, Perplexity (no MCP server available)
```

Il beneficio principale: Claude decide quali tool chiamare, in che ordine, con quali parametri — senza che tu scriva logica di routing. Il `ResearchOrchestrator` diventa quasi vuoto.

**Stack agentico realistico:**

```
apps/api
  POST /research → crea Temporal Workflow (o BullMQ job)

packages/agent
  AgenticResearchWorkflow
    ├── Claude (claude-sonnet) con tool_use
    ├── MCP: Brave Search, Firecrawl, Exa
    ├── Direct client: Manus, Perplexity (no MCP disponibile)
    └── Loop: max 5 iterazioni o fino a stop condition
```

**Limitazioni MCP attuali:**
- Non tutti i tool hanno un MCP server maturo (Perplexity: no, Manus: no)
- Aggiunge un hop di latenza per ogni chiamata
- Il controllo di parallelismo fine (es. Tavily × 3 in parallelo) è più difficile con MCP che con client diretti

---

### 9.4 Phased evolution

```
Beta (1–2 settimane)
  → Async job (BullMQ), auth, rate limiting, Zod config, LLM decompose, retry
  → Fixed pipeline, direct clients, no MCP

V1 Agentic (2–3 mesi)
  → Sostituire orchestrator con LLM planner (Claude)
  → deep mode diventa adaptive loop invece di parallel batch
  → Manus + Perplexity restano client diretti
  → Brave / Firecrawl / Exa via MCP

V2 Production (dopo)
  → Temporal per workflow durability
  → Multi-turn research sessions con contesto persistente
  → RAG sulle sessioni di ricerca precedenti
```

**Principio chiave:** l'architettura attuale non va buttata per il salto agentico. `ToolResult` come interfaccia canonica, la separazione fusion/orchestrator, e l'astrazione `ManusTaskStore` sono tutte compatibili col piano agentico. È un'evoluzione, non un rewrite.

---

## 10. Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MANUS_API_KEY` | Yes | — | Manus API key |
| `MANUS_WEBHOOK_SECRET` | Recommended | `""` | HMAC secret for webhook verification |
| `PERPLEXITY_API_KEY` | Yes | — | Perplexity API key |
| `TAVILY_API_KEY` | Yes | — | Tavily API key |
| `FIRECRAWL_API_KEY` | Yes | — | Firecrawl API key |
| `WEBHOOK_BASE_URL` | Yes (deep mode) | `http://localhost:3000` | Public URL where Manus delivers results |
| `PORT` | No | `3000` | HTTP server port |
| `APP_ENV` | No | `development` | Environment label |
