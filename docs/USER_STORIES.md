# User Stories: Matching Target Expectations

This backlog is aligned to the expected capabilities for library/tool/subagent usage, pipeline/agent execution, async persistence, local outputs, and OpenTelemetry.

---

## Epic E1 — Unified invocation model (library, tool, subagent)

### US-001 — Library invocation
**As a** backend developer  
**I want** to call the research engine from Node code as a library  
**So that** I can embed it in an existing service without HTTP overhead.

**Acceptance criteria**
- `@deep-research/sdk` exposes a stable typed entrypoint for pipeline and agent modes.
- Example code in docs runs with the same request contract as HTTP.
- Library invocation returns a job reference or result according to configured async policy.

### US-002 — Tool/API invocation
**As a** platform integrator  
**I want** to invoke research over HTTP as a tool endpoint  
**So that** external systems can trigger research asynchronously.

**Acceptance criteria**
- `POST /research` accepts the expanded request contract.
- `GET /research/:jobId` returns lifecycle state and final result/error.
- API behavior is consistent with SDK behavior for equivalent requests.

### US-003 — Subagent invocation
**As a** parent-agent developer  
**I want** a subagent-facing interface  
**So that** the research engine can be used as a callable subagent step.

**Acceptance criteria**
- A subagent module is exported with deterministic input/output schema.
- Subagent calls can run in both pipeline and agent mode.
- Subagent outputs include result metadata and artifact locations.

---

## Epic E2 — Pipeline mode with direct provider control

### US-004 — Caller-specified provider sequence
**As a** product engineer  
**I want** to pass provider IDs in the request  
**So that** I can control which sources are used per query.

**Acceptance criteria**
- Request accepts `providers: ProviderId[]`.
- Invalid provider IDs fail validation with clear error messages.
- When `providers` is omitted, depth defaults still apply.

### US-005 — Parallel provider execution
**As a** performance-focused user  
**I want** selected providers executed in parallel  
**So that** end-to-end latency is reduced.

**Acceptance criteria**
- Scheduler fans out provider calls concurrently.
- Optional `maxConcurrency` is respected.
- Response includes per-provider latency and success/failure metadata.

### US-006 — Deterministic fallback behavior
**As a** reliability engineer  
**I want** partial results when some providers fail  
**So that** requests degrade gracefully instead of hard failing.

**Acceptance criteria**
- Failed providers produce `ToolResult.success=false` without crashing full pipeline.
- Fusion/synthesis proceeds with successful results.
- Final response includes clear failure diagnostics per provider.

---

## Epic E3 — Condensed ranked answer with a small LLM

### US-007 — LLM synthesis step
**As a** decision-maker  
**I want** one consolidated answer from all provider outputs  
**So that** I do not have to manually merge conflicting results.

**Acceptance criteria**
- Synthesis step is invoked after provider collection/fusion.
- Output contains a single answer and ranked citations.
- Claims in synthesis are traceable to source citations.

### US-008 — Configurable small model
**As a** platform owner  
**I want** a configurable low-cost summarization model  
**So that** operating cost remains predictable.

**Acceptance criteria**
- Request and/or config can set synthesizer model.
- Default model is lightweight and documented.
- If model call fails, deterministic non-LLM fallback is used.

---

## Epic E4 — Agent mode (provider tools + iterative reasoning)

### US-009 — Agent planner loop
**As a** research user  
**I want** agent mode to iteratively decide which provider to use next  
**So that** hard queries can be explored adaptively.

**Acceptance criteria**
- `mode=agent` triggers planner/executor loop.
- Loop uses tool outputs as context for next steps.
- Loop stops on explicit criteria (`maxIterations` or confidence threshold).

### US-010 — Shared provider adapters
**As a** maintainer  
**I want** one provider adapter interface used by both modes  
**So that** provider integrations are not duplicated.

**Acceptance criteria**
- Pipeline and agent runners use same provider registry.
- Adding a new provider requires implementing one adapter interface.
- Existing providers pass compatibility tests in both modes.

---

## Epic E5 — Async jobs + persistence + output artifacts

### US-011 — Durable job repository
**As a** operator  
**I want** job state stored in a durable backend  
**So that** restarts do not lose job history or results.

**Acceptance criteria**
- Repository interface supports in-memory and durable adapters.
- Durable adapter survives process restart and serves job state by `jobId`.
- Job state transitions are auditable (`pending -> running -> completed/failed`).

### US-012 — Local output folder artifacts
**As a** user/integrator  
**I want** every job result saved in a local output folder  
**So that** I can inspect and reuse artifacts offline.

**Acceptance criteria**
- Completed jobs create `output/<jobId>.json` at minimum.
- Optional markdown report and per-tool raw artifacts are generated.
- Output path is configurable and defaults to `output/`.

### US-013 — Async result retrieval parity
**As a** consumer of SDK or API  
**I want** consistent async retrieval semantics  
**So that** integration logic is the same across invocation channels.

**Acceptance criteria**
- SDK exposes async job-handle style retrieval or equivalent abstraction.
- API and SDK provide equivalent status/result/error shapes.
- Documentation includes examples for both access paths.

---

## Epic E6 — Observability with OpenTelemetry + fallback

### US-014 — OTel traces and metrics
**As a** SRE  
**I want** traces and key metrics for requests, provider calls, and synthesis  
**So that** latency/cost/failure hotspots are visible.

**Acceptance criteria**
- Request span encloses full job execution.
- Child spans exist per provider invocation and synthesis step.
- Metrics include job duration, provider latency, provider error rate.

### US-015 — Console fallback behavior
**As a** developer  
**I want** observability to continue when OTel exporter is unavailable  
**So that** local/dev and degraded prod environments remain diagnosable.

**Acceptance criteria**
- If OTel exporter is disabled/unreachable, no request fails because of telemetry.
- Pino/console logs still capture request and provider events.
- Fallback mode is explicitly documented.

---

## Definition of Done (across all stories)

- Automated tests cover new contracts, mode behavior, and persistence paths.
- Existing behavior remains backward-compatible unless explicitly versioned.
- Docs include runnable examples for library, API tool, and subagent usage.
- Security and observability defaults are safe for production use.
