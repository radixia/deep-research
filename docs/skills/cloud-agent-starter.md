# Cloud Agent Starter Skill: Run + Test This Monorepo

Use this skill first when you start in this repository.
It is intentionally minimal and command-first.

## 1) Immediate setup (first 2-3 minutes)

### 1.1 Verify CLI auth (GitHub)

```bash
gh auth status
```

If this fails, run:

```bash
gh auth login
```

### 1.2 Install and prepare env

```bash
pnpm install
cp .env.example .env
```

Populate `.env` with valid API keys:
- `MANUS_API_KEY`
- `PERPLEXITY_API_KEY`
- `TAVILY_API_KEY`
- `FIRECRAWL_API_KEY`
- `BRAVE_API_KEY`

Optional but common:
- `ANTHROPIC_API_KEY` (query decomposition fallback paths)
- `API_KEY` (enables request auth middleware on `/research`)
- `WEBHOOK_BASE_URL` (needed for real Manus webhook testing)

### 1.3 Mock-mode env for local-only checks (no real providers)

For builds, unit tests, `/health`, and webhook schema tests, fake keys are enough:

```env
MANUS_API_KEY=mock
PERPLEXITY_API_KEY=mock
TAVILY_API_KEY=mock
FIRECRAWL_API_KEY=mock
BRAVE_API_KEY=mock
APP_ENV=development
API_KEY=
WEBHOOK_BASE_URL=http://localhost:3000
```

Important: mock mode is **not** enough for successful `/research` completion.

---

## 2) Codebase area workflows

## Area A — API server (`apps/api`)

### Run

```bash
pnpm dev
```

### Test workflow A1: boot + health (fastest smoke)

```bash
curl -s http://localhost:3000/health
```

Success signal: JSON with `status: "healthy"`.

### Test workflow A2: async research flow (real keys required)

```bash
node test/e2e/research.e2e.mjs
```

If `API_KEY` is set in `.env`, run:

```bash
API_KEY=your_api_key node test/e2e/research.e2e.mjs
```

Success signal: script exits `0` after `completed`.

### Test workflow A3: auth middleware toggle (feature-flag style)

`API_KEY` behaves like an auth feature flag:
- empty/unset: `/research` is open
- set: `/research` requires `x-api-key` or `Authorization: Bearer ...`

Quick check:

```bash
curl -i -X POST http://localhost:3000/research \
  -H "Content-Type: application/json" \
  -d '{"query":"health check","depth":"quick"}'
```

When auth is enabled and header is missing, expect `401`.

---

## Area B — Shared core logic (`packages/orchestrator`, `packages/fusion`, `packages/types`)

### Run focused tests after edits

```bash
pnpm test -- packages/orchestrator/src/orchestrator.test.ts packages/fusion/src/fusion.test.ts
```

### Validate cross-package contracts

```bash
pnpm typecheck
```

Use this area when changing:
- depth routing
- query decomposition
- confidence/credibility ranking
- shared Zod schemas and TypeScript types

---

## Area C — Tool clients (`packages/tools/*`)

### Run focused tool tests (currently Tavily has unit tests)

```bash
pnpm test -- packages/tools/tavily/src/tavily.test.ts
```

### Validate build output for changed tool packages

```bash
pnpm build
```

Use this area when changing provider request/response mapping, retries, or citation extraction.

---

## Area D — Manus webhook + deep-mode plumbing

### Local webhook simulation (works in development without signatures)

```bash
curl -s -X POST http://localhost:3000/webhooks/manus \
  -H "Content-Type: application/json" \
  -d '{"event_type":"task_stopped","task_detail":{"task_id":"local_task_1","message":"done","stop_reason":"finish"}}'
```

Then confirm task-store growth:

```bash
curl -s http://localhost:3000/health
```

Success signal: `manusStoreTasks` increments.

### Real Manus webhook testing

Use a public URL tunnel and set `WEBHOOK_BASE_URL` accordingly.
If using ngrok, authenticate once in the cloud image:

```bash
ngrok config add-authtoken <token>
ngrok http 3000
```

---

## 3) Common failure signatures (fast triage)

- `Invalid config: ... is required`: missing env var in `.env`.
- `POST /research failed: 401`: server has `API_KEY` set; send key in header.
- `Cannot connect to API at http://localhost:3000`: API not running (`pnpm dev`).
- `status: failed` in E2E: provider API key invalid/quota/network issue.

---

## 4) Updating this skill as new runbook knowledge appears

When you discover a repeatable testing trick or pitfall:

1. Add it under the closest Area section above (A/B/C/D).
2. Keep it command-first (copy/pasteable).
3. Include four fields:
   - **When to use**
   - **Command(s)**
   - **Success signal**
   - **Common failure signal**
4. Remove stale steps in the same edit (do not let this skill grow noisy).

If a new workflow affects every area (for example, new auth, new queue, new local dependency), add it to section `1) Immediate setup`.
