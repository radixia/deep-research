# Issues

A brutally honest audit of everything wrong with this codebase, sorted by severity.

---

## P0 — This will break in production

### 1. `deep` mode holds an HTTP connection for up to 15 minutes

**File:** `packages/orchestrator/src/index.ts:71-86`

`runDeep()` is synchronous from the HTTP handler's perspective. It `await`s Manus for up to 15 minutes on the same request. Every reverse proxy, load balancer, CDN, and browser will time out long before that. This endpoint is unusable in any real deployment.

**Fix:** Return a job ID immediately. Poll via `GET /research/:jobId` or push via SSE/WebSocket.

---

### 2. No authentication on any endpoint

**File:** `apps/api/src/index.ts:42-67`

The `/research` endpoint is wide open. Anyone can hit it and burn through four paid API keys simultaneously. A single bot finds this, and the monthly bill explodes.

**Fix:** API key header (`x-api-key`) at minimum. Even a hardcoded token in env is better than nothing.

---

### 3. No rate limiting

**File:** `apps/api/src/index.ts:57-67`

One user can fire 1,000 concurrent `deep` requests. Each spawns 4+ API calls. There's no throttle, no queue, no backpressure. This is a self-inflicted DDoS on your own API budgets.

**Fix:** Rate limit per API key. Even a simple sliding window (`hono-rate-limiter` or in-memory counter) prevents budget runaway.

---

### 4. Config silently defaults to empty strings

**File:** `apps/api/src/config.ts:1-10`

```typescript
manusApiKey: process.env["MANUS_API_KEY"] ?? "",
```

If you forget to set an API key, the server starts fine, accepts requests, fires API calls with `Authorization: Bearer `, gets 401s from every tool, and returns a degraded result with no explanation. The failure is silent and delayed.

**Fix:** Zod-validate `process.env` at boot. Crash immediately with a clear error if any required key is missing.

---

### 5. Webhook HMAC verification is optional in production

**File:** `apps/api/src/index.ts:81-89`

```typescript
if (config.manusWebhookSecret) { ... }
```

If `MANUS_WEBHOOK_SECRET` is unset, anyone can `POST` to `/webhooks/manus` with a crafted `task_id` and inject arbitrary results into the research pipeline. This is a direct data poisoning vector.

**Fix:** Require the secret in production. Reject unsigned webhooks unless `APP_ENV === "development"`.

---

### 6. Zero tests

**Files:** None exist.

`pnpm test` runs vitest across an empty test suite. There are no unit tests, no integration tests, no smoke tests. Every deploy is a leap of faith. The orchestrator, fusion engine, dedup logic, credibility scoring, and citation extraction are all untested.

**Fix:** At minimum: unit tests for `FusionEngine` (dedup, scoring, summary selection), `decompose()`, and each tool client with mocked HTTP.

---

## P1 — Fundamentally broken logic

### 7. `decompose()` is a hardcoded joke

**File:** `packages/orchestrator/src/index.ts:89-96`

```typescript
function decompose(query: string, max = 4): string[] {
  return [
    query,
    `${query} latest news 2026`,
    `${query} comparison analysis`,
    `${query} best practices`,
  ].slice(0, max);
}
```

Every query gets the same four sub-queries regardless of content. "What is the capital of France" becomes "What is the capital of France best practices". This wastes 3 Tavily API calls per request on garbage queries and actively degrades result quality.

**Fix:** LLM-powered decomposition (Claude Haiku is cheap and fast enough) or remove sub-queries entirely until it's real.

---

### 8. `buildSummary()` is a verbatim passthrough, not synthesis

**File:** `packages/fusion/src/index.ts:62-76`

The "fusion" engine doesn't fuse anything. It picks the `rawOutput` from the highest-priority tool and returns it verbatim. If Manus returned a result, the Perplexity, Tavily, and Firecrawl data is completely ignored in the summary. The user sees one tool's output presented as "research from four tools."

**Fix:** At minimum, concatenate excerpts from all successful tools. Properly: LLM synthesis pass that combines findings.

---

### 9. `outputFormat` and `maxSources` are accepted but ignored

**File:** `packages/orchestrator/src/index.ts:17-51`, `packages/fusion/src/index.ts:27-39`

The API validates `outputFormat` and `maxSources` via Zod but never passes them downstream. A caller requesting `citations_list` gets a full markdown report. A caller requesting `maxSources: 5` gets all 50+. The API contract is a lie.

**Fix:** Either implement them or remove them from the schema. Don't advertise features that don't exist.

---

### 10. Credibility scores are meaningless

**Files:** `packages/tools/perplexity/src/index.ts:53`, `packages/tools/firecrawl/src/index.ts:55`, `packages/tools/manus/src/index.ts:130`

Three of four tool clients hardcode `credibilityScore: 0.5` on every citation. Only Tavily uses a real signal (its relevance score). The FusionEngine then applies tool-weight multipliers to these identical 0.5 values, producing a false sense of ranking. The "credibility-ranked" output is really just "which tool found it" ranking.

**Fix:** Incorporate real signals — domain authority, freshness (`fetchedAt` is captured but unused), cross-tool citation overlap.

---

### 11. Credibility formula inflates scores and compresses range

**File:** `packages/fusion/src/index.ts:55-59`

```typescript
credibilityScore: Math.min(1, c.credibilityScore * weight + weight * 0.1)
```

The `weight * 0.1` additive term means even a source with `credibilityScore: 0` gets boosted to 0.09 (Manus) or 0.075 (Tavily). Combined with the universal 0.5 baseline, all scores land between 0.42 and 0.55. The ranking is effectively random within this narrow band.

**Fix:** Drop the additive bonus. Use `score * weight` directly, or introduce real signals that actually differentiate sources.

---

## P2 — Architectural debt

### 12. `ManusTaskStore` is single-process only

**File:** `packages/tools/manus/src/store.ts`

The store is an in-memory `Map`. If you run two instances behind a load balancer, the webhook hits one instance but the `waitFor()` poll runs on the other. The task never resolves. Horizontal scaling is impossible without replacing this.

**Fix:** Abstract behind an interface, swap to Redis/Postgres when scaling.

---

### 13. `ManusTaskStore.waitFor()` busy-polls every 500ms

**File:** `packages/tools/manus/src/store.ts:59-77`

For a 15-minute Manus task, this fires 1,800 `Map.get()` calls. It's not expensive in isolation, but it's an anti-pattern. Any event-driven notification (EventEmitter, Promise resolution on set) would be zero-overhead.

**Fix:** Use an EventEmitter or a resolve-on-set pattern. The `set()` method should resolve a pending Promise, not require polling.

---

### 14. Orchestrator is tightly coupled to concrete tool classes

**File:** `packages/orchestrator/src/index.ts:1-15`

The orchestrator imports and depends on all four concrete tool classes. There's no interface — you can't swap a tool, mock it, or add a 5th without modifying the orchestrator constructor and all three `run*` methods. The "adding a tool is just implementing one interface" claim in the README is false.

**Fix:** Define a `ToolClient` interface in `packages/types`. Orchestrator accepts `Record<string, ToolClient>`. Tool selection is config-driven, not constructor-driven.

---

### 15. Orchestrator re-exports everything

**File:** `packages/orchestrator/src/index.ts:98`

```typescript
export { ManusClient, PerplexityClient, TavilyClient, FirecrawlClient, FusionEngine };
```

The orchestrator re-exports all tool clients and the fusion engine. The API server imports `ManusClient` and `FusionEngine` from `@deep-research/orchestrator` instead of from their own packages. This creates a false dependency graph — the orchestrator appears to "own" things it doesn't.

**Fix:** Import each package directly where it's used. Remove re-exports from the orchestrator.

---

### 16. No request timeout or cancellation on the `/research` endpoint

**File:** `apps/api/src/index.ts:57-67`

If the client disconnects mid-request, the orchestrator keeps running all tool calls to completion. For `deep` mode that's 15 minutes of wasted API spend after the user has walked away. Individual tool clients have timeouts, but there's no top-level abort signal threaded through.

**Fix:** Thread an `AbortSignal` from the request through to all tool calls. Cancel in-flight work when the client disconnects.

---

### 17. No structured logging

**File:** `apps/api/src/index.ts:123`

```typescript
console.log(`Deep Research Agent starting on port ${config.port}`);
```

All logging is `console.log` (via Hono's logger middleware). No structured JSON, no log levels, no request IDs, no correlation between a research request and the tool calls it spawned. Debugging production issues means grep-ing unstructured text.

**Fix:** Pino or similar structured logger. Add request IDs that propagate to tool calls.

---

## P3 — Code quality and correctness

### 18. Webhook body parsed twice

**File:** `apps/api/src/index.ts:77-92`

The webhook handler reads the body as `arrayBuffer`, converts to `Buffer` for HMAC, then `JSON.parse`s the string. But if HMAC verification is skipped (no secret configured), the body is still read as `arrayBuffer` and manually parsed instead of using Hono's `c.req.json()`. This works but is needlessly fragile.

---

### 19. Webhook payload is unvalidated

**File:** `apps/api/src/index.ts:92-97`

```typescript
const data = JSON.parse(rawBody.toString()) as { task_id?: string; ... };
```

The webhook payload is cast with `as` — no runtime validation. A malformed payload (wrong types, missing fields, extra data) passes silently. Combined with the optional HMAC (issue #5), this is a double vulnerability.

**Fix:** Zod schema for the webhook payload. You already have the pattern in `ResearchQuerySchema`.

---

### 20. `timingSafeEqual` crashes on different-length buffers

**File:** `apps/api/src/index.ts:87`

```typescript
if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
```

`timingSafeEqual` throws if the two buffers have different lengths. If the attacker sends a signature of different length (or an empty string), the server crashes with an unhandled exception instead of returning 401.

**Fix:** Check `expected.length === signature.length` before calling `timingSafeEqual`, or catch the error.

---

### 21. `c.req.json()` can throw on invalid JSON

**File:** `apps/api/src/index.ts:58`

```typescript
const body = await c.req.json();
```

If the request body is not valid JSON, this throws an unhandled error. Hono doesn't catch this automatically — the client gets a 500 instead of a 400 with a useful error message.

**Fix:** Wrap in try/catch or use a middleware that handles JSON parse errors.

---

### 22. Error responses leak internal details

**Files:** `packages/orchestrator/src/index.ts:46`, all tool clients

```typescript
summary: `Research failed: ${String(err)}`,
error: String(err),
```

Raw error objects (including stack traces, internal URLs, API keys in headers) are stringified and returned to the client. This leaks implementation details.

**Fix:** Return generic error messages to clients. Log full details server-side.

---

### 23. `dev` script runs built JS, not source

**File:** `apps/api/package.json:8`

```json
"dev": "node --env-file=.env --watch dist/index.js"
```

The dev script watches `dist/index.js`, not the TypeScript source. You have to `pnpm build` first, and changes to source files don't trigger reloads unless tsup is also running in watch mode separately. This is a broken DX loop.

**Fix:** Use `tsx --env-file=.env --watch src/index.ts` for dev, or run tsup in watch mode alongside.

---

### 24. Manus citation extraction is naive regex

**File:** `packages/tools/manus/src/index.ts:119-134`

```typescript
const mdLink = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
```

This regex only finds markdown-style links. If Manus returns URLs in plain text, footnotes, HTML, or any other format, they're missed entirely. Citations are the core value prop — undercounting them directly degrades the research output.

---

### 25. Perplexity citations with empty URLs are included

**File:** `packages/tools/perplexity/src/index.ts:48`

```typescript
url: typeof c === "string" ? c : (c.url ?? ""),
```

If a citation has no URL (the `?? ""` fallback), it's still included in the results with `url: ""`. This fails the `z.string().url()` Zod validation in `CitationSchema` — but the schema is never actually applied to tool output at runtime.

**Fix:** Filter out citations without valid URLs.

---

### 26. Tavily snippet is silently truncated to 500 chars

**File:** `packages/tools/tavily/src/index.ts:49`

```typescript
snippet: r.content.slice(0, 500),
```

Arbitrary truncation with no indication to the caller. If the first 500 chars are a cookie notice or boilerplate, the useful content is discarded. Firecrawl does the same thing (`index.ts:52`).

---

### 27. `ResearchQuery.language` is never used

**File:** `packages/types/src/index.ts:27`

The schema accepts a `language` field (default `"en"`) but no tool client, orchestrator method, or fusion step ever reads it. The API promises multilingual support it doesn't deliver.

---

### 28. `sort()` mutates in place

**File:** `packages/fusion/src/index.ts:33`

```typescript
const scored = this.applyCredibility(unique);
const ranked = scored.sort((a, b) => b.credibilityScore - a.credibilityScore);
```

`Array.sort()` mutates the original array. `scored` and `ranked` are the same reference. Not a bug today, but a landmine if anyone later uses `scored` expecting the unsorted order.

**Fix:** Use `toSorted()` (available in ES2023+, which this project targets) or spread first.

---

### 29. `SIGTERM` handler doesn't await in-flight requests

**File:** `apps/api/src/index.ts:116-119`

```typescript
process.on("SIGTERM", () => {
  manusStore.destroy();
  process.exit(0);
});
```

On SIGTERM, the process kills the store and exits immediately. Any in-flight research requests are abandoned mid-execution. Tool API calls may complete but their results are lost.

**Fix:** Stop accepting new requests, wait for in-flight ones to complete (with a timeout), then exit.

---

### 30. No `SIGINT` handler

**File:** `apps/api/src/index.ts:116-119`

Only `SIGTERM` is handled. `SIGINT` (Ctrl+C during development) kills the process without cleanup. The `manusStore` cleanup timer leaks (though `.unref()` mitigates this for Node.js specifically).

---

### 31. Monorepo `workspaces` field is in `package.json` but pnpm uses `pnpm-workspace.yaml`

**File:** `package.json:15-19`

```json
"workspaces": ["packages/*", "packages/tools/*", "apps/*"]
```

pnpm ignores the `workspaces` field in `package.json` — it reads `pnpm-workspace.yaml`. This field is dead config that misleads anyone reading it. If the two files ever diverge, the actual workspace config is in the YAML file.

---

### 32. `tsconfig.json` has `rootDir: "src"` at root level

**File:** `tsconfig.json:18`

The root `tsconfig.json` sets `rootDir: "src"`, but the root of the monorepo has no `src/` directory. Each package has its own `src/`. This config only works because each package (presumably) overrides it or tsup ignores it during build. It's misleading.

---

### 33. No `.gitignore` for `dist/` directories visible

If `dist/` directories are not gitignored, built artifacts end up in version control, creating merge conflicts and bloating the repo.

---

## Summary

| Priority | Count | Theme |
|----------|-------|-------|
| **P0** | 6 | Will break or cost money in production |
| **P1** | 5 | Core logic is fake or misleading |
| **P2** | 6 | Architecture prevents scaling and testing |
| **P3** | 16 | Code quality, correctness, DX |
| **Total** | **33** | |

The bones are reasonable — the layered architecture (orchestrator / fusion / tools), the `ToolResult` canonical shape, and the depth-mode routing are solid ideas. But the implementation is a prototype wearing a production costume. The most damaging issues are the ones that look like they work (fake decomposition, fake fusion, fake credibility scores) while actually producing garbage output that happens to be formatted nicely.
