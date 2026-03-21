# AGENTS.md

## Cursor Cloud specific instructions

### Overview

This is a TypeScript pnpm monorepo for a deep research agent. See `CLAUDE.md` for architecture, key commands, and conventions.

### Quick reference

| Action | Command |
|--------|---------|
| Install | `pnpm install` |
| Build | `pnpm build` |
| Dev server | `pnpm dev` (builds all packages then starts API with `tsx --watch`) |
| Tests | `pnpm test` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |

### Non-obvious caveats

- **API key auth**: The API server enforces `x-api-key` authentication on `/research` when the `API_KEY` env var is set. Include `-H "x-api-key: $API_KEY"` in curl requests.
- **Async job pattern**: `POST /research` returns `202 { jobId, status: "pending" }`. Poll `GET /research/:jobId` until status is `completed` or `failed`. Quick-mode research typically completes in ~60–100s.
- **esbuild build scripts**: pnpm 10 blocks postinstall scripts by default. The root `package.json` includes `pnpm.onlyBuiltDependencies: ["esbuild"]` to allow esbuild to build. If you see "Ignored build scripts: esbuild" warnings after install, the build step (`pnpm build`) will fail.
- **ESLint v9 flat config**: The project uses ESLint v9 with `eslint.config.js` (flat config). The `--ext .ts` flag in the lint script is a legacy flag that is ignored but harmless.
- **Pre-existing lint error**: `packages/orchestrator/src/index.ts` has an unused `err` variable in a catch block (`@typescript-eslint/no-unused-vars`). This is pre-existing.
- **Port conflicts**: The dev server binds to port 3000. If port 3000 is already in use, kill the existing process first (`lsof -t -i:3000` to find the PID). The tsx watch mode does not auto-recover from `EADDRINUSE` — you must restart.
- **.env file**: The dev server reads `.env` from the repo root via `tsx --env-file=../../.env`. Environment variables already set in the shell take precedence over `.env` file values.
- **All state is in-memory**: No database or Redis. Job results and Manus task store are lost on restart.
