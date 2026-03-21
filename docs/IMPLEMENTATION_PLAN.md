# Implementation Plan (Spec-Aligned Best Architecture)

This plan implements the architecture defined in `docs/BEST_ARCHITECTURE.md`, derived from `agentic-deep-research-spec`.

## 1) Target architecture goals

1. Hybrid adaptive system: router + pipeline mode + agent mode.
2. Direct provider selection with parallel fanout.
3. Small-model synthesis followed by citation verification.
4. Durable asynchronous jobs and artifact persistence in `output/`.
5. OpenTelemetry observability with non-blocking pino fallback.

## 2) Architecture decisions locked for implementation

1. **Tiered routing**
   - Route each query to `simple | medium | complex | open_ended`.
   - Tier controls budget, mode defaults, and max concurrency.

2. **Hybrid execution**
   - Pipeline mode for simple/medium by default.
   - Agent mode for complex/open-ended or explicit caller selection.
   - Dynamic outline enabled for open-ended report tasks.

3. **Evidence-first writing**
   - Memory bank stores normalized evidence entries.
   - Writer/synthesizer can only use retrieved evidence slices.

4. **Citation verification pass**
   - Separate verifier step validates claim-source support.
   - Unverified claims are explicitly marked.

5. **Durable async by default**
   - API and SDK use consistent job lifecycle contracts.
   - Repository abstraction allows in-memory and durable adapters.

## 3) Workstreams

## WS1 - Contract and planner foundations
- Extend request schema:
  - `mode`, `providers`, `tier`, `budget`, `execution`, `persistOutput`, `outputPath`
- Add internal `ExecutionPlan` and `ResearchState` contracts.
- Add compatibility shims for existing `depth` behavior.

## WS2 - Router and direct parallel scheduler
- Implement router for complexity tier prediction.
- Add orchestrator path for direct provider selection.
- Add bounded concurrency scheduler for provider fanout/fanin.

## WS3 - Synthesis and citation verification
- Add small-model synthesizer contract:
  - input: ranked evidence and tool outputs
  - output: final answer + source-linked claims
- Add citation verifier post-pass before finalization.

## WS4 - Agent runtime and dynamic outline
- Introduce `packages/agent`:
  - planner -> tool-use -> reflect -> iterate loop
- Introduce memory bank + outline state:
  - outline section status and evidence links
- Add stop criteria:
  - max iterations, confidence threshold, budget floor.

## WS5 - Durable jobs and local artifacts
- Build `JobRepository` abstraction:
  - in-memory adapter (dev),
  - Redis/Postgres adapter (durable).
- Add artifact writer:
  - `output/<jobId>.json`, optional markdown and per-tool raw files.
- Add checkpoint/resume for long-running sessions.

## WS6 - Observability and reliability
- Add OTel traces and metrics for:
  - routing, provider calls, synthesis, citation pass, persistence.
- Keep pino logs as fallback path.
- Add retry/backoff and timeout policy enforcement per provider.

## 4) Phase plan with concrete exits

## Phase A - Contracts + Router + Direct Mode
**Deliver**
- schema upgrades, router, direct provider scheduler.

**Exit**
- Caller can specify providers and execute in parallel.
- Existing API requests remain backward compatible.

## Phase B - Synthesis + Citation Verifier
**Deliver**
- small-model synthesis module + claim-source verification pass.

**Exit**
- Response includes one consolidated answer with verified citations.
- Graceful fallback works if synthesis model is unavailable.

## Phase C - Agent Mode + Dynamic Outline
**Deliver**
- planner loop, reflection/gap handling, memory bank, outline lifecycle.

**Exit**
- `mode=agent` runs iterative research and produces evidence-linked output.
- Open-ended report tasks use dynamic outline path.

## Phase D - Durable Persistence + Output Artifacts
**Deliver**
- durable job store adapter + output writer + checkpoint recovery.

**Exit**
- Jobs survive restarts and artifact files are generated consistently.

## Phase E - OTel + Operational Hardening
**Deliver**
- telemetry export, dashboards, retry policies, resilience checks.

**Exit**
- Traces and metrics are observable end-to-end.
- Telemetry failures do not impact request success.

## 5) Validation plan

- **Contract tests**: request compatibility and mode-specific schema guarantees.
- **Unit tests**: router, planner, scheduler, synthesizer, verifier, artifact writer.
- **Integration tests**:
  - pipeline direct mode,
  - agent mode,
  - durable resume path,
  - citation verification correctness.
- **Operational tests**:
  - load and budget exhaustion behavior,
  - telemetry outage fallback behavior.

## 6) Deliverables checklist

- [ ] `ResearchQuery` and `ResearchState` schema upgrades (`packages/types`)
- [ ] Router and direct scheduler (`packages/orchestrator`)
- [ ] Synthesizer + citation verifier modules
- [ ] Agent runtime package with dynamic outline support
- [ ] Durable `JobRepository` + checkpointing
- [ ] Output artifact persistence under `output/`
- [ ] OTel instrumentation + fallback logging
- [ ] Updated API/SDK examples for pipeline and agent modes
