# One User Story per Epic

This document provides one representative user story for each epic defined in `docs/USER_STORIES.md`.

---

## Epic E1 — Unified invocation model (library, tool, subagent)

### US-E1-01 — Invoke from any integration surface
**As a** platform developer  
**I want** to invoke the deep-research engine as an SDK library, HTTP tool endpoint, or subagent module  
**So that** I can integrate the same capabilities into different runtime environments without rewriting business logic.

**Acceptance criteria**
- A single typed request contract works for SDK, API, and subagent entrypoints.
- All invocation surfaces return compatible job/result metadata.
- Documentation includes one runnable example per invocation surface.

---

## Epic E2 — Pipeline mode with direct provider control

### US-E2-01 — Direct provider selection with parallel execution
**As a** product engineer  
**I want** to specify provider IDs in a request and have them execute in parallel  
**So that** I can tune quality/latency per query while keeping turnaround fast.

**Acceptance criteria**
- Request accepts validated `providers: ProviderId[]`.
- Providers are scheduled concurrently (respecting optional concurrency limit).
- Response includes per-provider status, latency, and errors (if any).

---

## Epic E3 — Condensed ranked answer with a small LLM

### US-E3-01 — Consolidated synthesis from multi-provider outputs
**As a** research consumer  
**I want** one concise final answer synthesized from all successful provider outputs  
**So that** I can make decisions without manually reconciling multiple partial responses.

**Acceptance criteria**
- Synthesis step runs after provider collection and ranking.
- Final answer includes ranked citations with traceable evidence.
- If synthesizer fails, deterministic non-LLM fallback still returns a valid response.

---

## Epic E4 — Agent mode (provider tools + iterative reasoning)

### US-E4-01 — Adaptive research loop
**As a** power user  
**I want** an agent mode that iteratively chooses provider calls based on intermediate evidence  
**So that** complex questions can be explored adaptively instead of through a fixed one-pass pipeline.

**Acceptance criteria**
- `mode=agent` triggers planner -> tool calls -> evaluate loop.
- Loop termination is controlled by explicit stop rules (e.g., max iterations/confidence).
- Final output includes execution trace metadata for agent iterations.

---

## Epic E5 — Async jobs + persistence + output artifacts

### US-E5-01 — Durable async jobs with local artifacts
**As a** system operator  
**I want** each research job persisted durably and written to local output artifacts  
**So that** results survive restarts and can be audited/reused offline.

**Acceptance criteria**
- Job record is persisted at launch and updated through lifecycle transitions.
- Completed jobs produce `output/<jobId>.json` (minimum) plus optional markdown/raw tool artifacts.
- Jobs remain retrievable after process restart when durable backend is enabled.

---

## Epic E6 — Observability with OpenTelemetry + fallback

### US-E6-01 — End-to-end telemetry with safe fallback
**As an** SRE  
**I want** OpenTelemetry traces/metrics for request, provider, synthesis, and persistence stages with pino/console fallback  
**So that** I can monitor reliability in production and still debug when telemetry export is unavailable.

**Acceptance criteria**
- Core pipeline stages emit OTel spans/metrics with stable attributes.
- Telemetry exporter failures never fail user requests.
- Fallback logs remain structured and correlated by job/request identifiers.
