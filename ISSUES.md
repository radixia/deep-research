# Issues (audit status)

Historical audit items and how they stand **after fixes in-repo**. Use this as a backlog for remaining work, not as a claim that everything below is still broken.

---

## Resolved in codebase

| # | Topic | Resolution |
|---|--------|--------------|
| P0-1 | Long `deep` request blocking HTTP | `POST /research` returns **202** with `jobId`; poll **`GET /research/:jobId`**. |
| P0-2 | No API auth | **`x-api-key`** (or `Authorization: Bearer`) when **`API_KEY`** is set; **required in production** (`APP_ENV=production`). |
| P0-3 | No rate limiting | Sliding window in **`middleware.ts`** (per key, depth-aware). |
| P0-4 | Silent empty env | **`config.ts`** uses **Zod**; missing required keys fail fast at boot. |
| P0-5 | Webhook security | **RSA signature** verification via Manus public key (`manus-webhook-verify.ts`); dev fallback only when verification cannot run. |
| P0-6 | No tests | **Vitest** suites (e.g. fusion, orchestrator, job-store, tools). |
| P1-7 | Naive `decompose()` | **LLM decomposition** when `ANTHROPIC_API_KEY` is set; improved **fallback** in `decompose.ts`. |
| P1-8 | Fusion passthrough only | **Multi-tool summary**: primary text plus **Additional sources**; formats vary by `outputFormat`. |
| P1-9 | `outputFormat` / `maxSources` ignored | **Fusion `merge()`** applies **`maxSources`** and handles **`citations_list`**, **`executive_summary`**, **`structured_json`**, **`rag_chunks`**, default markdown. |
| P1-11 | Credibility formula | **`score * toolWeight`** (no additive inflation). |
| P2-13 | Manus store polling | **`ManusTaskStore`**: **resolve-on-set**, no busy-poll. |
| P2-14 | No `ToolClient` | **`ToolClient`** in **`@deep-research/types`**; orchestrator uses **`Record<string, ToolClient>`**. |
| P2-16 | No abort | **`AbortSignal`** from request passed into **`orchestrator.research()`** and tools. |
| P2-17 | Unstructured logs | **`pino`** + structured fields in **`logger.ts`** / request logs. |
| P3-21 | `c.req.json()` throws | **`try/catch`** → **400** “Invalid JSON body”. |
| P3-23 | Broken `dev` script | **`tsx --watch src/index.ts`** in **`apps/api`**. |
| P3-25 | Perplexity empty URLs | **Filtered** before mapping to citations. |
| P3-28 | `sort()` mutates | **`slice().sort()`** in fusion. |
| P3-30 | No `SIGINT` | **`SIGINT`** and **`SIGTERM`** both trigger shutdown. |
| P3-31 | Dead `workspaces` in `package.json` | **Removed**; **`pnpm-workspace.yaml`** is the source of truth. |
| P3-33 | `dist/` not ignored | **`dist/`** in **`.gitignore`**. |

---

## Partially addressed / follow-ups

| # | Topic | Notes |
|---|--------|--------|
| P1-10 | Credibility signals | **Per-order** heuristics for Perplexity/Firecrawl/Manus; Tavily still uses API **score**. Further: domain reputation, freshness weighting. |
| P1-8 | True multi-tool synthesis | Still **not** a single LLM merge of all tool bodies; upgrade path is an LLM synthesis pass. |
| P2-12 | Manus store multi-instance | Still **in-memory** per process; scale-out needs **Redis/DB** + shared store. |
| P2-15 | SDK re-exports | **`@deep-research/sdk`** re-exports tools/orchestrator for convenience; consumers can import packages directly. |
| P3-18 | Webhook body parsing | Still **raw buffer** for signature; acceptable for crypto; could refactor for clarity only. |
| P3-20 | `timingSafeEqual` | **N/A** for current **RSA** verifier (uses `createVerify`). |
| P3-22 | Error leakage | Orchestrator returns **generic** failure summary; tool **`ToolResult.error`** may still contain provider messages — sanitize at API boundary if needed. |
| P3-24 | Manus citations | **Markdown + plain URL** extraction; still not HTML/footnotes. |
| P3-26 | Snippet truncation | **Ellipsis (`…`)** marks truncation in snippets. |
| P3-27 | `language` | Used for **Brave** `searchLang`; not passed to every provider. |
| P3-29 | Graceful shutdown | **Waits** (up to timeout) for **in-flight background research** before exit; refine with drain of server connections if needed. |
| P3-32 | Root `tsconfig` | No misleading **`rootDir: "src"`** at repo root in current config. |

---

## Backlog (not implemented)

- **Semantic dedup** in fusion (embeddings).
- **Langfuse** / full **OpenTelemetry** correlation IDs across all logs.
- **Streaming** / SSE for long jobs.
- **Load-test** timeouts and CDN limits for your host.
- **Replace** optional details in **`structured_json`** if you need to hide tool timings from clients.

---

## Summary

| Priority | Theme |
|----------|--------|
| **Done** | Async jobs, auth (prod), rate limits, env validation, webhook verification, tests, fusion formats, abort, logging, DX. |
| **Next** | Shared Manus store for HA, LLM synthesis layer, stronger citation scoring. |
