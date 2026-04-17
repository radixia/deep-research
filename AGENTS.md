# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a TypeScript monorepo (pnpm workspaces) for a Deep Research Agent API. See `CLAUDE.md` and `README.md` for full architecture and commands.
For cloud-agent onboarding and practical run/test workflows, start with `docs/skills/cloud-agent-starter.md`.

### Services

| Service | Port | Command | Notes |
|---------|------|---------|-------|
| Hono API server | 3000 | `pnpm dev` | Builds all packages then starts tsx watch mode |
| MCP server | stdio | `node packages/mcp/dist/index.js` | Requires env vars, communicates via stdin/stdout |

No databases, Docker, or external infrastructure needed — all state is in-process memory.

### Key commands

Standard commands are in root `package.json` and documented in `README.md`. Quick reference:

- **Install**: `pnpm install`
- **Build**: `pnpm build`
- **Dev**: `pnpm dev` (builds first, then starts API with tsx --watch)
- **Test**: `pnpm test` (vitest, 47 tests across 8 files)
- **Lint**: `pnpm lint` (ESLint 9 flat config)
- **Typecheck**: `pnpm typecheck`

### Non-obvious caveats

1. **esbuild build scripts must be approved**: The root `package.json` has `pnpm.onlyBuiltDependencies: ["esbuild"]` to allow esbuild post-install scripts. Without this, `tsup` builds will fail silently.

2. **API keys required at startup**: The API server validates 5 API keys via Zod at boot (`apps/api/src/config.ts`): `MANUS_API_KEY`, `PERPLEXITY_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`, `BRAVE_API_KEY`. The server crashes immediately if any are missing. `ANTHROPIC_API_KEY` is optional.

3. **Auth middleware**: When `API_KEY` env var is set, the `/research` endpoint requires `x-api-key` header or `Authorization: Bearer` header matching it. When unset/empty, auth is skipped.

4. **Async job pattern**: `POST /research` returns `202 { jobId, status: "pending" }`. Poll `GET /research/:jobId` until status is `completed` or `failed`. Quick-mode research takes ~60-120s (Perplexity is the slow tool).

5. **`.env` location**: The API dev script loads env from `../../.env` relative to `apps/api/` (i.e., the workspace root `.env`). Copy `.env.example` to `.env` and populate keys.

6. **ESLint 9 flat config**: The project uses `eslint.config.js` (ESLint 9 flat config format). The `test/` directory is excluded from linting.

7. **Provider selection**: When `providers` array is set in the request body, depth-based routing is bypassed entirely — only specified providers run.

8. **Domain allowlisting**: When `allowedDomains` is set, each tool client restricts searches to those domains. The FusionEngine also filters citations as a final pass.

9. **MCP server**: The `@deep-research/mcp` package provides a stdio-based MCP server. It needs the same API keys as the HTTP server. Build first with `pnpm build` before running.

### Integration tests

Integration tests live alongside unit tests and run with `pnpm test`:

| File | What it tests |
|------|---------------|
| `packages/orchestrator/src/orchestrator.integration.test.ts` | Direct mode, domain routing, structured response, partial failure |
| `packages/fusion/src/fusion.integration.test.ts` | Reference numbering, domain filtering, exec summary, detail sections |
| `apps/api/src/api.integration.test.ts` | API routes with providers/domains, validation, response shape |
| `packages/mcp/src/mcp.integration.test.ts` | MCP server creation, result formatting, end-to-end flow |

All integration tests use mock tool clients — no real API keys needed.
