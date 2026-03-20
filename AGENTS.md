# Agent memory (continual learning)

## Learned User Preferences

- When something fails in the terminal or tests, expect the agent to reproduce the problem locally (run the same commands), then fix code or config rather than only suggesting steps.
- Requests like “try it now” or “run the test” mean actually execute the command and report the outcome.
- The user sometimes writes in Italian; respond in Italian when the user message is in Italian.

## Learned Workspace Facts

- Research job state is persisted by default to a file (`JOB_STORE_PATH`, default `output/jobs.json`) via `FileJobSessionStore` in `apps/api/src/job-session-store/`; an in-memory store and types remain in `apps/api/src/job-store.ts`. No Redis or database yet.
- E2E checks live under `test/e2e/` (e.g. `research.e2e.mjs`); they need the API running (`pnpm dev`) and `API_KEY` in the environment when the server requires it.
- Root `package.json` uses `"type": "module"` so Vitest and Node scripts run as ESM without the Vite Node CJS deprecation warning.
- Brave Search is integrated as a research tool alongside Perplexity, Tavily, Firecrawl, and Manus; depth modes control which tools run.
- Manus callbacks use `POST /webhooks/manus`; for local dev the public base URL (tunnel such as ngrok) must match `WEBHOOK_BASE_URL` and signature verification must succeed or the hook returns 401.
