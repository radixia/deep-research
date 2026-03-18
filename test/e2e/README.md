# E2E tests

End-to-end tests against the running API. **The API must be running** (e.g. `pnpm dev` from the repo root).

## Research flow

```bash
# From repo root, with API on default port
node test/e2e/research.e2e.mjs

# Custom base URL
API_BASE_URL=http://localhost:4000 node test/e2e/research.e2e.mjs

# With API key (when API_KEY is set in server .env)
API_KEY=your-api-key node test/e2e/research.e2e.mjs
```

The script:

1. `POST /research` with `{ query: "State of agentic AI in 2026", depth: "quick" }`
2. Polls `GET /research/:jobId` every 2s until `completed` or `failed` (timeout 90s for quick depth)
3. Exits 0 on success, 1 on failure or timeout

## Prerequisites

- Node.js 18+ (for `fetch`)
- API running: `pnpm dev`
- `.env` with required API keys (Perplexity, Tavily, etc.) for the research tools
