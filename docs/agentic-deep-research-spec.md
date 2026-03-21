# Agentic Deep Research: Definitive System Specification

**Version:** 1.0 — March 2026
**Scope:** Architecture, training, orchestration, and cost optimization for production-grade autonomous research agents.

---

## 1. Problem Definition

Agentic deep research is the autonomous decomposition of complex, open-ended queries into targeted sub-tasks — each involving iterative web search, evidence extraction, source evaluation, and synthesis — producing comprehensive, citation-grounded reports. The core challenge is doing this accurately at scale without blowing through token budgets.

The field has converged on a set of architectural primitives and training techniques between mid-2025 and early 2026. This spec distills the state of the art from 40+ papers, 10+ production systems, and 15+ open-source implementations cataloged in the Awesome-Deep-Research repository.

---

## 2. Taxonomy of Architectures

Two dominant paradigms have emerged, with a third hybrid gaining traction:

### 2.1 Single-Agent (Monolithic Reasoner)

One LLM handles planning, search, reading, reasoning, and synthesis in a single context window.

**Examples:** Tongyi DeepResearch, WebSailor-V2, SmartSearch, R1-Searcher++

**Characteristics:**
- Simpler orchestration, no inter-agent coordination overhead
- Context window is the hard constraint; requires aggressive summarization (see ReSum)
- RL training is straightforward — one policy, one reward signal
- Best for factoid QA, multi-hop reasoning, and constrained research tasks

**When to use:** Budget-constrained deployments, latency-sensitive applications, tasks with well-defined answer criteria.

### 2.2 Multi-Agent (Orchestrator-Worker)

A lead agent decomposes the task and delegates to specialized sub-agents operating in parallel with isolated context windows.

**Examples:** Anthropic Research, Enterprise Deep Research (Salesforce), DeerFlow, O-Researcher, GPT Researcher

**Characteristics:**
- Near-linear speedup through parallelization (Anthropic reports up to 90% latency reduction)
- Each sub-agent has a scoped context, avoiding the single-window bottleneck
- Requires explicit task boundary definitions to prevent overlap and gaps
- Training is harder — M-GRPO addresses this with hierarchical credit assignment

**When to use:** Complex open-ended research, multi-entity comparisons, report generation, enterprise analytics.

### 2.3 Hybrid: Dynamic Outline (Planner-Writer Separation)

A planner agent iteratively builds and refines a structured outline while acquiring evidence, then hands off to a writer agent for section-by-section synthesis.

**Examples:** WebWeaver (Alibaba), Multimodal DeepResearcher

**Characteristics:**
- Decouples evidence acquisition from content generation
- Dynamic outline serves as a persistent plan that evolves with new evidence
- Memory bank links outline nodes to source evidence with citations
- Achieves 93.37% citation accuracy (WebWeaver on DeepResearch Bench)

**When to use:** Long-form report generation, open-ended deep research requiring structured output.

---

## 3. Core Architectural Components

### 3.1 Query Decomposition Engine

Every system starts by breaking the input query into sub-tasks. The sophistication varies:

**Level 1 — Static decomposition:** Generate N sub-questions upfront, execute in parallel. (GPT Researcher)

**Level 2 — Adaptive decomposition:** Generate initial plan, spawn sub-agents, evaluate gaps, spawn more. (Anthropic Research: "1 agent for fact-finding, 2-4 for comparisons, 10+ for complex research")

**Level 3 — Dynamic outline:** Interleave planning with evidence acquisition; the plan itself mutates as evidence arrives. (WebWeaver)

**Recommendation:** Level 2 as the default, with Level 3 for open-ended report generation tasks. Level 1 is acceptable only for latency-constrained simple queries.

### 3.2 Search & Retrieval Layer

The action space for search agents typically includes:

| Action | Description |
|--------|-------------|
| `search(query)` | Execute web search with synthesized query |
| `visit(url)` | Fetch and extract content from a specific URL |
| `read_snippet(url, section)` | Read a specific section of a previously visited page |
| `refine_query(feedback)` | Reformulate search query based on gap analysis |
| `summarize_context()` | Compress accumulated evidence (ReSum paradigm) |
| `reflect()` | Evaluate current progress and identify gaps (WebSeer) |
| `answer()` | Produce candidate answer for validation |

**Search progression strategy** (Anthropic): Start broad, evaluate availability, then progressively narrow. Disable search temporarily when yielding no new URLs (Jina DeepResearch).

**Source quality heuristics:** Prefer primary sources (academic PDFs, official docs, personal blogs from domain experts) over SEO-optimized content farms. This was a hard-learned lesson from Anthropic's human evaluation — agents naturally gravitate toward highly-ranked but low-quality sources.

### 3.3 Context Management

The single biggest engineering challenge. Three proven approaches:

**a) ReSum (Context Summarization):**
Periodically compress the interaction history into structured summaries, then resume exploration from these compact states. Delivers 4.5% average accuracy improvement over ReAct, with an additional 8.2% after ReSum-GRPO training. Enables effectively unbounded search horizons despite fixed context windows.

**b) External Memory / Filesystem Offloading (DeerFlow):**
Offload intermediate results to disk. Summarize completed sub-tasks aggressively. Load only what's needed for the current reasoning step. Progressive skill loading to keep context lean.

**c) Sub-Agent Isolation (Anthropic):**
Each sub-agent gets its own context window. Only condensed findings flow back to the lead agent. This is the most effective for parallelism but requires careful delegation instructions.

**Recommendation:** Combine (a) and (c). Sub-agents use ReSum internally for long-horizon search; the lead agent receives only condensed outputs.

### 3.4 Reflection & Self-Correction

A distinguishing feature of high-performing systems:

**WebSeer's two-stage reflection:** Cold-start on reflection-annotated data, then RL fine-tuning within a self-reflection paradigm. The agent actively prolongs search trajectories and incorporates reflection steps when uncertainty is detected. Achieves 72.3% on HotpotQA and 90.0% on SimpleQA.

**Jina DeepResearch's gap queue:** When an answer is produced but deemed non-definitive, the system resets context and returns to a queue of unresolved sub-questions rather than terminating.

**ResearStudio's transparency model:** All plans, intermediate artifacts, and actions are visible. Humans and AI have symmetrical control to modify any element. Dynamic role fluidity allows seamless shifts between AI-led and human-led workflows.

### 3.5 Citation & Attribution Engine

A dedicated post-processing stage, not an afterthought:

- Anthropic uses a separate Citation Agent that identifies specific source locations for claims
- WebWeaver's memory bank maintains evidence-to-outline-node links throughout the process
- Enterprise Deep Research includes a Visualization Agent for data-driven claims

**Key metric:** Citation accuracy. WebWeaver achieves 93.37%. Systems without dedicated citation handling typically fall below 70%.

### 3.6 Budget-Aware Execution

From the "Budget-Aware Tool-Use" paper (Google DeepMind, Nov 2025):

**Budget Tracker:** A lightweight plug-in providing continuous budget awareness. Results: 40.4% fewer search calls, 19.9% fewer browse calls, 31.3% overall cost reduction at comparable accuracy.

**BATS (Budget Aware Test-time Scaling):** Maintains a continuous signal of remaining resources and dynamically adapts behavior. At ~23 cents per query, BATS achieves accuracy that parallel scaling only reaches at 50+ cents.

**Recommendation:** Budget awareness is non-negotiable for production. Embed remaining-budget signals directly into the agent's context at every step.

---

## 4. Training Pipeline

The field has converged on a three-stage training pipeline, with the RL stage being the primary differentiator.

### 4.1 Stage 1: Agentic Mid-Training (Optional but Recommended)

Pre-train on tool-use trajectories to initialize the agent's ability to interleave reasoning with actions. Tongyi DeepResearch uses a fully automatic data synthesis pipeline, avoiding costly human annotation.

### 4.2 Stage 2: Supervised Fine-Tuning (Cold Start)

SFT on expert-like trajectories to establish baseline search and reasoning behavior.

**Data sources:**
- Multi-agent distillation: Use a strong multi-agent system (e.g., GPT-4 + search tools) to generate trajectories, then distill into a single model (O-Researcher, Chain-of-Agents)
- Synthetic trajectory generation: SimpleDeepSearcher synthesizes web-powered reasoning trajectories for SFT
- Reflection-annotated data: WebSeer constructs datasets annotated with reflection patterns for cold-start

**Key insight from O-Researcher:** Multi-agent collaboration to generate training data (decompose → debate → verify) produces higher-fidelity trajectories than single-model self-play.

### 4.3 Stage 3: Reinforcement Learning (Self-Evolution)

The RL stage is where performance gains concentrate. Multiple algorithms have been validated:

#### GRPO (Group Relative Policy Optimization)
The dominant RL algorithm for search agents. Used by Tongyi DeepResearch, Atom-Searcher, SmartSearch, WebExplorer, and many others.

**Tongyi's modifications for stability:**
- Strict on-policy training
- Binary reward signals for correctness
- Clip-higher strategy for exploration
- Token-level policy gradients with leave-one-out advantage estimation
- Negative samples conservatively filtered (exclude incomplete/truncated rollouts to avoid format collapse)

#### M-GRPO (Multi-Agent GRPO)
Extension for vertical multi-agent systems. Computes group-relative advantages for both main and sub-agents with hierarchical credit assignment. Decoupled training pipeline deploys agents on separate servers exchanging minimal statistics via a shared store.

#### HRPO (Hop-Grouped Relative Policy Optimization)
From Dr. Zero (Meta). Clusters structurally similar questions to construct group-level baselines, significantly reducing compute requirements for solver training.

#### Process vs. Outcome Rewards

**Outcome rewards only:** Binary correctness signal. Simple but suffers from reward sparsity and conflicting gradients on long trajectories.

**Process rewards (HiPRAG):** Hierarchical, knowledge-aware process reward evaluating the necessity of each search decision. Reduces over-search rate from 27% to 2.3%. Average accuracy: 65.4% (3B) / 67.2% (7B).

**Atomic Thought Rewards (Atom-Searcher):** Decomposes reasoning into fine-grained functional units supervised by Reasoning Reward Models. Curriculum-inspired schedule: prioritize process-level ATR early, transition to outcome rewards. 8.5% improvement on in-domain, 2.5% on out-of-domain tasks over previous SOTA.

**Recommendation:** Start with outcome rewards + format rewards for baseline stability. Layer in process rewards (HiPRAG-style) to reduce over/under-search. Use atomic thought rewards for maximum accuracy when compute budget allows training RRMs.

### 4.4 Self-Evolution Without Training Data

Dr. Zero (Meta, Jan 2026) demonstrates that complex reasoning and search capabilities can emerge solely through self-evolution:
- A proposer generates diverse questions to train a solver (same base model)
- As the solver improves, the proposer generates harder but solvable tasks
- Automated curriculum — no human annotation needed
- Matches or surpasses fully supervised search agents

This is the most cost-effective training approach when labeled data is unavailable.

---

## 5. Recommended Reference Architecture

Based on synthesis across all surveyed systems, here is a production-grade architecture optimized for accuracy and cost:

### Layer 1: Intake & Planning
- Parse user query
- Classify complexity tier (simple → medium → complex → open-ended report)
- Select execution strategy: single-agent for simple, multi-agent for complex, planner-writer for reports
- Initialize budget tracker with tier-appropriate limits

### Layer 2: Orchestration
- **Lead Agent:** Owns the research plan, delegates to sub-agents, maintains the outline (for report tasks)
- **Sub-Agents (N, dynamic):** Each receives scoped task description with clear boundaries, output format spec, and tool guidance
- **Coordination:** Synchronous — lead waits for sub-agent batch completion before next planning cycle
- Sub-agents operate with ReSum-enabled context management for long-horizon search

### Layer 3: Search & Evidence
- Unified search interface abstracting multiple backends (web, academic, code, enterprise data)
- URL deduplication and ranking
- Content extraction with structured parsing
- Source quality scoring (prefer primary over secondary, penalize SEO-optimized farms)

### Layer 4: Reasoning & Reflection
- Each sub-agent runs a search-reason-reflect loop
- Gap queue maintains unresolved sub-questions
- Self-reflection triggers query reformulation when uncertainty exceeds threshold
- Beast mode / final synthesis activates when budget approaches limit

### Layer 5: Synthesis & Output
- Citation Agent validates all claims against sources
- Report writer (for open-ended tasks) generates section-by-section with hierarchical retrieval from memory bank
- Visualization Agent generates charts/figures for data-heavy claims
- Final quality check: factual accuracy, citation accuracy, completeness, source quality

### Cross-Cutting Concerns
- **Budget awareness:** Remaining-budget signal embedded in every agent prompt
- **Observability:** Full trace logging of every agent decision, tool call, and intermediate result
- **Error recovery:** Durable execution with checkpoint/resume from failure points
- **Human-in-the-loop (optional):** ResearStudio-style symmetrical control for high-stakes research

---

## 6. Cost Optimization Strategies

Ranked by impact:

1. **Complexity-based routing:** Simple queries → single agent, 3-10 tool calls. Don't spawn 10 sub-agents for a factoid question. This alone can reduce average cost by 5-10x.

2. **Budget-aware execution (BATS):** 31.3% cost reduction at comparable accuracy. Non-negotiable for production.

3. **Model tiering:** Use a fast/cheap model (e.g., Flash-tier) for sub-agent search execution, a capable model (e.g., Pro-tier) for planning and synthesis. DeerFlow implements this as "flash" / "pro" / "ultra" configurations.

4. **ReSum context compression:** Prevents context window overflow that forces expensive re-processing or truncation. Enables longer effective search horizons within the same token budget.

5. **HiPRAG-trained search behavior:** Eliminates over-search (27% → 2.3%), directly reducing unnecessary API calls.

6. **Parallel execution:** Anthropic's approach of 3-5 sub-agents with 3+ parallel tool calls each cuts wall-clock time by up to 90%. Time is cost in infrastructure terms.

7. **Self-evolution training (Dr. Zero):** Eliminates the need for expensive human-annotated training data.

---

## 7. Evaluation Framework

### Benchmarks (by task type)

| Benchmark | Focus | Difficulty |
|-----------|-------|------------|
| HotpotQA | Multi-hop factoid QA | Medium |
| SimpleQA | Single-hop factoid QA | Low |
| FRAMES | Multi-step reasoning | Medium |
| GAIA | General AI assistant tasks | High |
| BrowseComp / BrowseComp-ZH | Complex web browsing | Very High |
| WebWalkerQA | Web navigation | High |
| Humanity's Last Exam (HLE) | Extreme difficulty | Extreme |
| DeepResearch Bench (RACE) | Open-ended report quality | High |
| xbench-DeepSearch | Comprehensive search eval | High |

### Evaluation Dimensions (LLM-as-Judge)

1. **Factual accuracy** — Do claims match sources?
2. **Citation accuracy** — Do sources actually support the claims? (Target: >90%)
3. **Completeness** — Are all aspects of the query covered?
4. **Source quality** — Primary over secondary, authoritative over SEO
5. **Tool efficiency** — Appropriate tool selection, minimal wasted calls
6. **Cost per query** — Total token spend and API calls

### Human Evaluation (Essential)

Automated metrics miss: hallucinated answers on unusual queries, subtle source selection biases, system failures on edge cases. Anthropic found that starting with ~20 queries reveals dramatic effect sizes, enabling rapid iteration before scaling to hundreds.

---

## 8. Key Decisions for Implementation

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Single vs. multi-agent | Multi-agent for production | Parallelism, context isolation, specialization |
| RL algorithm | GRPO with process rewards | Best accuracy/stability tradeoff, validated across model families |
| Context management | ReSum + sub-agent isolation | Unbounded effective horizon + parallel execution |
| Search strategy | Broad → narrow progressive | Validated by Anthropic at scale |
| Report generation | Dynamic outline (WebWeaver) | 93% citation accuracy, structured evidence linking |
| Budget control | BATS-style continuous signal | 31% cost reduction, proven at scale |
| Human-in-the-loop | Optional, ResearStudio pattern | Symmetrical control, no performance penalty in auto mode |
| Training data | Multi-agent distillation + self-evolution | Cost-effective, no human annotation needed |

---

## 9. Current SOTA Performance Reference Points

As of early 2026:

| System | HLE | BrowseComp | GAIA | FRAMES |
|--------|-----|------------|------|--------|
| Tongyi DeepResearch (30B-A3B) | 32.9 | 43.4 | 70.9 | 90.6 |
| O-Researcher-RL (72B) | — | — | SOTA | — |
| WebSeer (14B) | — | — | — | — |
| OpenAI o3 | < Tongyi | < Tongyi | < Tongyi | < Tongyi |

The open-source frontier (Tongyi at 30B active params) now matches or exceeds proprietary systems on most benchmarks.

---

## 10. Sources & References

### Production Systems
- Anthropic Research System: https://www.anthropic.com/engineering/built-multi-agent-research-system
- GPT Researcher: https://github.com/assafelovic/gpt-researcher
- DeerFlow (ByteDance): https://github.com/bytedance/deer-flow
- Enterprise Deep Research (Salesforce): https://github.com/SalesforceAIResearch/enterprise-deep-research
- ResearStudio: https://github.com/ResearAI/ResearStudio

### Key Papers
- Tongyi DeepResearch Technical Report: https://arxiv.org/abs/2510.24701
- M-GRPO Multi-Agent Training: https://arxiv.org/abs/2511.13288
- O-Researcher (Multi-Agent Distillation + RL): https://arxiv.org/abs/2601.03743
- WebWeaver (Dynamic Outlines): https://arxiv.org/abs/2509.13312
- ReSum (Context Summarization): https://arxiv.org/abs/2509.13313
- WebSeer (Self-Reflection RL): https://arxiv.org/abs/2510.18798
- Atom-Searcher (Atomic Thought Rewards): https://arxiv.org/abs/2508.12800
- HiPRAG (Hierarchical Process Rewards): https://arxiv.org/abs/2510.07794
- Dr. Zero (Self-Evolution): https://arxiv.org/abs/2601.07055
- Budget-Aware Tool-Use: https://arxiv.org/abs/2511.17006
- Jina DeepResearch: https://github.com/jina-ai/node-DeepResearch

### Repository Index
- Awesome Deep Research: https://github.com/DavidZWZ/Awesome-Deep-Research
