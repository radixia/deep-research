# Implementation Plan: Library / Tool / Subagent Expectations

This plan translates the target expectations into an implementation sequence that can be executed incrementally.

## 1) Target capabilities

The solution must:

1. Run as a **library**, **tool (HTTP API)**, or **subagent component**.
2. Support **pipeline mode** and **agent mode**.
3. Support **direct mode** where caller specifies providers; provider jobs run in parallel.
4. Condense multi-provider results with a **small LLM** into one ranked answer.
5. Launch and store all jobs asynchronously.
6. Return results to caller and persist local artifacts in an `output/` folder.
7. Emit observability to **OpenTelemetry**, with fallback to console/pino logs.

## 2) Baseline (already present)

- Async API job pattern exists (`POST /research` + `GET /research/:jobId`).
- SDK factory exists (`createResearchOrchestrator`).
- Provider clients exist (Manus/Perplexity/Tavily/Firecrawl/Brave).
- Fusion exists for ranking and confidence.
- Structured logging exists via pino.

## 3) Workstreams

### WS1 — Contract and execution model
- Extend `ResearchQuery` with:
  - `mode: "pipeline" | "agent"`
  - `providers?: ProviderId[]`
  - `execution?: { parallel?: boolean; maxConcurrency?: number }`
  - `synthesizer?: { enabled?: boolean; model?: string }`
  - `persistOutput?: boolean`
  - `outputPath?: string`
- Introduce `ExecutionPlan` type (normalized execution instructions).
- Add contract tests to enforce backward compatibility.

### WS2 — Direct pipeline mode
- Add `runDirect()` in orchestrator.
- Build a scheduler for provider fan-out/fan-in with bounded concurrency.
- Keep existing depth routes as default fallback when `providers` is omitted.

### WS3 — Synthesis layer (small LLM)
- Add a dedicated synthesizer component:
  - input: `query + normalized tool results + ranked citations`
  - output: `final answer + citation-backed ranking`
- Preserve deterministic fallback when LLM is disabled/unavailable.

### WS4 — Agent mode
- Add an agent runner (`packages/agent` recommended) with:
  - planner step,
  - tool invocation step,
  - evaluate/continue step,
  - stop criteria (`maxIterations`, confidence threshold, no-new-evidence).
- Reuse same provider adapters and synthesis endpoint.

### WS5 — Job persistence and output artifacts
- Abstract job storage behind repository interface:
  - in-memory adapter (dev),
  - durable adapter (Redis/Postgres/file-backed).
- Persist artifacts under `output/`:
  - `output/<jobId>.json` (full result),
  - `output/<jobId>.md` (rendered report),
  - optional `output/<jobId>/<tool>.json` (raw captures).

### WS6 — Observability
- Add tracing spans:
  - request/job span,
  - per-tool invocation span,
  - synthesis span,
  - persistence span.
- Add OTel exporter wiring + disable/fallback behavior.
- Keep pino logs as always-available fallback.

## 4) Phased delivery sequence

## Phase A — Contracts + direct execution kernel
**Scope**
- Schema updates, execution-plan normalization, direct mode scheduler.

**Exit criteria**
- API accepts provider list and executes selected providers in parallel.
- SDK can invoke same direct execution path.
- Existing depth mode behavior remains functional.

## Phase B — LLM condensation
**Scope**
- Add synthesizer module and integrate post-fusion summarization.

**Exit criteria**
- For multi-provider runs, final response includes one consolidated ranked answer.
- Synthesizer can be disabled; non-LLM fallback remains stable.

## Phase C — Agent mode + subagent integration
**Scope**
- Add planner loop and iterative tool-use flow.
- Introduce subagent wrapper API and package exports.

**Exit criteria**
- Request with `mode=agent` executes planner loop and returns persisted result.
- Subagent entrypoint can be invoked from a parent agent runtime.

## Phase D — Durable jobs + output folder persistence
**Scope**
- Durable repository adapter + output writer.

**Exit criteria**
- Jobs survive process restarts (with durable adapter enabled).
- Every completed/failed job has output artifacts in configured path.

## Phase E — OpenTelemetry + reliability hardening
**Scope**
- OTel instrumentation and exporter config.
- Retry, timeout, and error-budget controls on provider calls.

**Exit criteria**
- Traces visible in configured OTel backend.
- If OTel is unavailable, execution continues with pino/console fallback.

## 5) Technical design decisions to lock early

1. **Provider registry**
   - canonical IDs (`manus`, `perplexity`, `tavily`, `firecrawl`, `brave`)
   - one adapter interface for both pipeline and agent runner

2. **Execution plan normalization**
   - transform request into internal graph/list before any provider call
   - single place for defaults, validation, and compatibility logic

3. **Result persistence model**
   - store pointers to artifact files and metadata in job record
   - avoid oversized payloads in durable store

4. **Synthesis constraints**
   - ensure every synthesized claim references source citations
   - provide strict JSON schema output from synthesizer for deterministic parsing

## 6) Validation strategy

- **Unit tests**
  - execution planner
  - scheduler parallelism/limits
  - synthesizer parser and fallback
  - output writer and path safety
- **Integration tests**
  - end-to-end job lifecycle in pipeline mode
  - end-to-end job lifecycle in agent mode
  - restart recovery with durable store adapter
- **Contract tests**
  - backward compatibility for existing request/response shapes
  - mode-specific response guarantees

## 7) Deliverables checklist

- [ ] Extended request/response contracts in `packages/types`
- [ ] Direct-mode scheduler in orchestrator
- [ ] Synthesizer module with provider-agnostic input contract
- [ ] Agent runner package and public API
- [ ] Durable job repository interface + adapter
- [ ] Local output artifact writer
- [ ] OpenTelemetry instrumentation and config
- [ ] Updated docs and runnable examples for all modes
