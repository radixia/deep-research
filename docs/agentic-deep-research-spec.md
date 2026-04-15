# Agentic Deep Research: Definitive System Specification

**Version:** 2.0 — March 2026
**Scope:** Architecture, training, orchestration, cost optimization, and production deployment for production-grade autonomous research agents.
**Audience:** Senior engineers implementing research agent systems from scratch.

---

## Table of Contents

1. [Problem Definition](#1-problem-definition)
2. [Taxonomy of Architectures](#2-taxonomy-of-architectures)
3. [Core Architectural Components](#3-core-architectural-components)
4. [Training Pipeline — Deep Dive](#4-training-pipeline--deep-dive)
5. [Recommended Reference Architecture](#5-recommended-reference-architecture)
6. [Data Schemas & Type Definitions](#6-data-schemas--type-definitions)
7. [Prompt Engineering Patterns](#7-prompt-engineering-patterns)
8. [Production Deployment](#8-production-deployment)
9. [Evaluation Framework](#9-evaluation-framework)
10. [Cost Optimization Strategies](#10-cost-optimization-strategies)
11. [Anti-Patterns & Failure Modes](#11-anti-patterns--failure-modes)
12. [Architecture Decision Tree](#12-architecture-decision-tree)
13. [Key Implementation Decisions](#13-key-implementation-decisions)
14. [Current SOTA Performance Reference Points](#14-current-sota-performance-reference-points)
15. [Sources & References](#15-sources--references)

---

## 1. Problem Definition

Agentic deep research is the autonomous decomposition of complex, open-ended queries into targeted sub-tasks — each involving iterative web search, evidence extraction, source evaluation, and synthesis — producing comprehensive, citation-grounded reports. The core challenge is doing this accurately at scale without blowing through token budgets.

The field has converged on a set of architectural primitives and training techniques between mid-2025 and early 2026. This spec distills the state of the art from 40+ papers, 10+ production systems, and 15+ open-source implementations cataloged in the Awesome-Deep-Research repository.

### 1.1 What Makes Deep Research Distinct from RAG

Standard RAG: fixed retrieval → fixed generation. One step.

Deep research: adaptive planning → iterative retrieval → multi-step reasoning → synthesis. The plan changes as evidence arrives. The system decides what to search next based on what it already knows. This is fundamentally different and requires:

- **Long-horizon context management** — evidence accumulates over dozens of search rounds
- **Dynamic search strategy** — queries evolve based on intermediate findings
- **Self-correction loops** — the agent detects gaps and corrects course
- **Structured output generation** — final reports with citations, not just text

### 1.2 Complexity Tiers

| Tier | Description | Tool Calls | Agents | Typical Cost |
|------|-------------|------------|--------|-------------|
| Simple | Factoid lookup, single-hop | 3–10 | 1 | $0.02–0.10 |
| Medium | Multi-hop, entity comparison | 10–30 | 1–3 | $0.10–0.50 |
| Complex | Multi-entity research, synthesis | 30–100 | 3–10 | $0.50–2.00 |
| Open-ended | Long-form report, full research | 100–300+ | 5–20 | $2.00–20.00 |

**Critical design decision:** Route to the correct tier before execution. Misrouting a Simple query to Open-ended wastes 100x resources. Misrouting an Open-ended query to Simple produces an incomplete answer.

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

**Implementation note:** Single-agent with ReSum context management effectively extends the context window to unbounded depth. The constraint shifts from window size to total search budget.

### 2.2 Multi-Agent (Orchestrator-Worker)

A lead agent decomposes the task and delegates to specialized sub-agents operating in parallel with isolated context windows.

**Examples:** Anthropic Research, Enterprise Deep Research (Salesforce), DeerFlow, O-Researcher, GPT Researcher

**Characteristics:**
- Near-linear speedup through parallelization (Anthropic reports up to 90% latency reduction)
- Each sub-agent has a scoped context, avoiding the single-window bottleneck
- Requires explicit task boundary definitions to prevent overlap and gaps
- Training is harder — M-GRPO addresses this with hierarchical credit assignment
- Multi-agent systems use approximately 15× more tokens than single-agent chat interactions (Anthropic empirical measurement)

**Anthropic's scaling rules (from production):**
- 1 sub-agent with 3–10 tool calls: simple fact-finding
- 2–4 sub-agents with 10–15 calls each: direct comparisons
- 10+ sub-agents with clearly divided responsibilities: complex open-ended research

**When to use:** Complex open-ended research, multi-entity comparisons, report generation, enterprise analytics.

### 2.3 Hybrid: Dynamic Outline (Planner-Writer Separation)

A planner agent iteratively builds and refines a structured outline while acquiring evidence, then hands off to a writer agent for section-by-section synthesis.

**Examples:** WebWeaver (Alibaba), Multimodal DeepResearcher

**Characteristics:**
- Decouples evidence acquisition from content generation
- Dynamic outline serves as a persistent plan that evolves with new evidence
- Memory bank links outline nodes to source evidence with citations
- Achieves 93.37% citation accuracy (WebWeaver on DeepResearch Bench FACT)
- Writer operates with targeted retrieval from memory bank, not full context — prevents "lost in the middle" hallucination

**WebWeaver's key insight:** Previous approaches either (a) search-then-generate without outline guidance producing incoherent output, or (b) static outline that doesn't update as evidence arrives. WebWeaver's planner continuously interleaves outline refinement with search, so the outline and search strategy co-evolve.

**When to use:** Long-form report generation, open-ended deep research requiring structured output.

---

## 3. Core Architectural Components

### 3.1 Query Decomposition Engine

Every system starts by breaking the input query into sub-tasks. The sophistication varies:

**Level 1 — Static decomposition:** Generate N sub-questions upfront, execute in parallel. (GPT Researcher)

**Level 2 — Adaptive decomposition:** Generate initial plan, spawn sub-agents, evaluate gaps, spawn more. (Anthropic Research: "1 agent for fact-finding, 2-4 for comparisons, 10+ for complex research")

**Level 3 — Dynamic outline:** Interleave planning with evidence acquisition; the plan itself mutates as evidence arrives. (WebWeaver)

**Recommendation:** Level 2 as the default, with Level 3 for open-ended report generation tasks. Level 1 is acceptable only for latency-constrained simple queries.

#### Decomposition Failure Modes

From Anthropic's engineering blog (production lessons):
- **Over-decomposition:** 50 sub-agents spawned for a simple query. Fix: embed explicit scaling rules in the orchestrator prompt.
- **Task overlap:** Multiple sub-agents investigate the same aspect (e.g., three agents all researching "2025 supply chains"). Fix: force the orchestrator to define non-overlapping responsibility boundaries in each delegation.
- **Vague delegation:** Sub-agent gets "research the semiconductor shortage" without scope. Fix: require objective + output format + tool guidance + task boundaries in every delegation.

### 3.2 Search & Retrieval Layer

The action space for search agents typically includes:

| Action | Description | Notes |
|--------|-------------|-------|
| `search(query)` | Execute web search with synthesized query | Multi-query batching supported (ReSum uses top-10 per query) |
| `visit(url)` | Fetch and extract content from a specific URL | Use Jina or similar content extractor |
| `read_snippet(url, section)` | Read a specific section of a previously visited page | Reduces token usage vs full re-fetch |
| `refine_query(feedback)` | Reformulate search query based on gap analysis | Triggered when search yields no new URLs |
| `summarize_context()` | Compress accumulated evidence (ReSum paradigm) | Triggered at token threshold or round limit |
| `reflect()` | Evaluate current progress and identify gaps (WebSeer) | Extends search trajectories when uncertainty detected |
| `answer()` | Produce candidate answer for validation | |

**Search progression strategy** (Anthropic): Start broad, evaluate availability, then progressively narrow. Disable search temporarily when yielding no new URLs (Jina DeepResearch).

**Source quality heuristics:** Prefer primary sources (academic PDFs, official docs, personal blogs from domain experts) over SEO-optimized content farms. This was a hard-learned lesson from Anthropic's human evaluation — agents naturally gravitate toward highly-ranked but low-quality sources.

**URL deduplication:** Track visited URLs in a set. Before visiting, check against visited set. Implement a URL normalization step (strip tracking params, normalize trailing slashes).

#### Search Tool Configuration (Concrete)

```python
# Minimal search tool interface
class SearchTool:
    def search(self, queries: list[str], top_k: int = 10) -> list[SearchResult]:
        """
        queries: batch of queries to submit simultaneously
        top_k: results per query
        Returns deduplicated, ranked results
        """
        pass
    
    def visit(self, url: str, goal: str) -> str:
        """
        url: page to fetch
        goal: what to extract (guides content filtering)
        Returns extracted text relevant to goal
        """
        pass

# Concrete hyperparameters (from ReSum, validated)
SEARCH_CONFIG = {
    "max_queries_per_call": 3,     # Batch up to 3 queries simultaneously
    "results_per_query": 10,        # Top-10 per query
    "max_visit_chars": 8000,        # Truncate page content to 8K chars
    "dedup_window": 200,            # Track last 200 visited URLs
}
```

### 3.3 Context Management

The single biggest engineering challenge. Three proven approaches:

#### a) ReSum (Context Summarization)

**Paper:** arxiv 2509.13313 — Tongyi Lab, Alibaba Group

**How it works:**

The agent follows standard ReAct until a **compression trigger** fires. At that point, a `summary tool` (a separate, specialized LLM) is invoked to compress the accumulated history into a goal-oriented `<summary>` block that:
1. Consolidates verified evidence found so far
2. Explicitly lists information gaps not yet filled
3. Proposes actionable next steps

The working history is then **reset** to just `(original_query, summary)`. The agent resumes exploration from this compressed state.

**Compression triggers:**
- **Token budget trigger:** History exceeds `max_context_tokens * 0.8` (e.g., at 80% of 32K context)
- **Round limit trigger:** Every N rounds (e.g., every 10 search rounds)
- **Agent-initiated:** Agent calls `summarize_context()` when it detects circular search or context confusion

**Trajectory segmentation for RL training:**
A trajectory with K summarization events → K+1 independent training segments. Each segment is an episode with input = compressed state, output = reasoning + actions until next summary or final answer.

```
Trajectory:  q → [round 1..t1] → SUMMARY s1 → [round t1+1..t2] → SUMMARY s2 → ANSWER
Training:    Episode 1: (q, →, s1)
             Episode 2: (q+s1, →, s2)  
             Episode 3: (q+s2, →, answer)
```

**Reward propagation:** Single trajectory-level reward (correctness of final answer) broadcast to all segments. No per-segment rewards needed — avoids manual reward engineering.

**ReSum-GRPO key modification:** The trajectory-level advantage is computed for the final segment and then broadcast to all prior segments in the same rollout. Segments from the same rollout that end in failure get reward=0 for all segments.

**Empirical results:**
- 4.5% average accuracy improvement over ReAct baseline
- Additional 8.2% after ReSum-GRPO training (reward signal for adapting to summary-conditioned reasoning)

**Implementation tip:** The summary tool requires strong web-context reasoning. A generic 7B model is insufficient — it struggles to extract verifiable evidence from noisy interaction histories. The Tongyi team fine-tuned Qwen3-30B-A3B-Thinking specifically for this role (ReSumTool-30B).

#### b) External Memory / Filesystem Offloading (DeerFlow)

**Architecture:** LangGraph StateGraph with isolated sub-agent nodes

```
DeerFlow components:
- Agent Runtime: LangGraph StateGraph orchestration
- REST API Gateway: FastAPI service layer
- Web Frontend: Research UI
- Sandbox Provisioner: Optional isolated execution
- Memory: Persistent filesystem + session state
```

**Memory bank pattern:**
- Completed sub-task summaries written to disk
- Lead agent loads only current-relevant summaries via targeted lookup
- Progressive skill loading: load tool definitions only when needed

**DeerFlow model tiers (configurable):**
- `flash`: Fast/cheap model for sub-agent search (e.g., Gemini Flash, GPT-4o-mini)
- `pro`: Capable model for planning and synthesis (e.g., Gemini Pro, GPT-4o)
- `ultra`: Max capability for final report generation (e.g., Gemini Ultra, Claude Opus)

#### c) Sub-Agent Isolation (Anthropic)

Each sub-agent gets its own context window. Only condensed findings flow back to the lead agent.

**Lead agent's memory management:** When the lead's context approaches the 200K token limit, it saves its plan to a persistent memory store before the context is truncated. The plan is loaded back after truncation.

**Anthropic's token reality check:**
- Chat interactions: baseline token usage
- Single-agent with search tools: ~4× chat tokens
- Multi-agent research systems: ~15× chat tokens
- Implication: only use multi-agent when task value justifies the cost

**Recommendation:** Combine (a) and (c). Sub-agents use ReSum internally for long-horizon search; the lead agent receives only condensed outputs.

### 3.4 Reflection & Self-Correction

A distinguishing feature of high-performing systems:

**WebSeer's two-stage reflection (arxiv 2510.18798):**
1. Cold-start on reflection-annotated data (teaches the agent *when* to reflect)
2. RL fine-tuning within a self-reflection paradigm (teaches the agent *how* to reflect effectively)

The agent actively prolongs search trajectories and incorporates reflection steps when uncertainty is detected. Achieves 72.3% on HotpotQA and 90.0% on SimpleQA.

**Jina DeepResearch's gap queue:**
When an answer is produced but deemed non-definitive, the system resets context and returns to a queue of unresolved sub-questions rather than terminating. This prevents premature convergence on incomplete answers.

**ResearStudio's transparency model (github.com/ResearAI/ResearStudio):**
All plans, intermediate artifacts, and actions are visible. Humans and AI have symmetrical control to modify any element. Dynamic role fluidity allows seamless shifts between AI-led and human-led workflows.

#### Reflection Trigger Logic

```python
def should_reflect(state: AgentState) -> bool:
    """Decide whether to inject a reflection step."""
    # Trigger on low-confidence answers
    if state.last_answer_confidence < CONFIDENCE_THRESHOLD:
        return True
    # Trigger on circular search pattern
    if is_circular_search(state.search_history, window=5):
        return True
    # Trigger on gap detection
    if len(state.unresolved_subquestions) > 0:
        return True
    # Trigger every N rounds as insurance
    if state.round_count % REFLECTION_INTERVAL == 0:
        return True
    return False

CONFIDENCE_THRESHOLD = 0.7
REFLECTION_INTERVAL = 15
```

### 3.5 WebWeaver Dynamic Outline — Implementation Details

**Paper:** arxiv 2509.13312 — Tongyi Lab / Alibaba Group

The planner agent operates in a loop:

```
PLANNER LOOP:
1. Initialize empty outline (or initial hypothesis from query)
2. Identify underdeveloped sections / knowledge gaps
3. Generate search queries targeting gaps
4. Execute searches → collect evidence
5. Parse evidence → extract relevant facts + source URLs
6. Update outline sections with new evidence
7. Store evidence in memory bank with citations
8. If outline is sufficiently complete → EXIT
9. Otherwise → GOTO 2
```

**Memory bank structure:**
```typescript
interface MemoryBank {
  entries: MemoryEntry[];
}

interface MemoryEntry {
  id: string;                    // Unique entry ID
  content: string;               // Extracted text snippet
  source_url: string;            // Source page URL
  source_title: string;          // Page title
  relevance_score: number;       // 0–1, how relevant to query
  outline_citations: string[];   // Which outline section IDs cite this entry
  extracted_at: string;          // ISO timestamp
}

interface OutlineSection {
  id: string;                    // Section identifier
  title: string;                 // Section heading
  key_points: string[];          // Bullet points to cover
  evidence_ids: string[];        // Memory bank entry IDs supporting this section
  status: "empty" | "partial" | "complete";
  subsections: OutlineSection[];
}
```

**Writer's hierarchical retrieval:**
For each section, the writer fetches only the memory bank entries cited in that section's `evidence_ids`. This is the key to preventing "lost in the middle" hallucinations — the writer never sees the full evidence corpus at once.

```python
def write_section(section: OutlineSection, memory_bank: MemoryBank) -> str:
    # Load only relevant evidence
    evidence = [
        memory_bank.get(eid) 
        for eid in section.evidence_ids
    ]
    
    prompt = f"""
    Write the section "{section.title}" for a research report.
    
    Key points to cover:
    {format_bullets(section.key_points)}
    
    Evidence (cite by source URL):
    {format_evidence(evidence)}
    
    Requirements:
    - Every factual claim must cite at least one source
    - Use inline citations [Source N]
    - Be precise and technical
    - Do not introduce facts not supported by evidence
    """
    return llm.generate(prompt)
```

### 3.6 Citation & Attribution Engine

A dedicated post-processing stage, not an afterthought:

**Anthropic's Citation Agent pattern:**
After the research loop completes, a dedicated Citation Agent processes:
1. The full research report (draft)
2. All source documents collected during research

For each factual claim in the report, it identifies the specific source location (page, paragraph, quote) that supports it. This is a separate agent with a different focus than the research agents.

**WebWeaver's inline citation approach:**
Citations are embedded during writing by the hierarchical retrieval process. Each evidence entry has a source URL; when the writer uses evidence from entry `e42`, it must emit a `[Source: {e42.source_url}]` inline citation.

**Citation accuracy metrics:**
- Effective citations: % of citations that point to real, accessible sources
- Citation accuracy: % of citations where the source actually supports the claim
- Coverage: % of factual claims that have at least one citation

WebWeaver achieves 93.37% citation accuracy. Systems without dedicated citation handling typically fall below 70%.

### 3.7 Budget-Aware Execution (BATS)

**Paper:** arxiv 2511.17006 — Google Cloud AI Research + Google DeepMind

**Problem:** Simply giving an agent more tool-call budget doesn't improve performance. Agents without budget awareness quickly hit a performance ceiling, saturating their capabilities regardless of extra budget because they lack the ability to strategically allocate remaining resources.

#### Budget Tracker (Lightweight Plugin)

```python
class BudgetTracker:
    def __init__(self, total_tool_calls: int, total_tokens: int):
        self.total_calls = total_tool_calls
        self.remaining_calls = total_tool_calls
        self.total_tokens = total_tokens
        self.remaining_tokens = total_tokens
    
    def get_budget_signal(self) -> str:
        """Returns a natural language budget signal for injection into agent context."""
        call_pct = self.remaining_calls / self.total_calls
        token_pct = self.remaining_tokens / self.total_tokens
        
        if call_pct > 0.5:
            urgency = "You have ample budget remaining. Explore broadly."
        elif call_pct > 0.2:
            urgency = "Budget is moderate. Prioritize high-value leads."
        else:
            urgency = "Budget is nearly exhausted. Finalize your answer with current evidence."
        
        return f"""
        [BUDGET STATUS]
        Tool calls remaining: {self.remaining_calls}/{self.total_calls}
        Tokens remaining: ~{self.remaining_tokens:,}
        {urgency}
        """
    
    def consume(self, tool_calls: int = 0, tokens: int = 0):
        self.remaining_calls -= tool_calls
        self.remaining_tokens -= tokens
```

**BATS (Budget Aware Test-time Scaling):**

BATS adds two modules on top of Budget Tracker:

1. **Planning Module:** Adjusts stepwise effort to match current budget. High budget → thorough multi-source verification. Low budget → fast single-source lookup.

2. **Verification Module:** Decides whether to "dig deeper" on a promising lead or "pivot" to alternative paths based on remaining resources.

```python
class BATSOrchestrator:
    def decide_next_action(self, state: AgentState, budget: BudgetTracker) -> AgentAction:
        call_pct = budget.remaining_calls / budget.total_calls
        
        if state.current_lead_confidence > 0.8 and call_pct > 0.3:
            # High confidence + enough budget → dig deeper for verification
            return AgentAction.DIG_DEEPER
        elif state.current_lead_confidence < 0.4 and call_pct > 0.2:
            # Low confidence + enough budget → pivot to new path
            return AgentAction.PIVOT
        elif call_pct < 0.15:
            # Low budget regardless → synthesize with current evidence
            return AgentAction.SYNTHESIZE
        else:
            # Default → continue current direction
            return AgentAction.CONTINUE
```

**Empirical results (from BATS paper):**
- Budget Tracker alone: 40.4% fewer search calls, 19.9% fewer browse calls, 31.3% overall cost reduction at comparable accuracy
- BATS at ~$0.23 per query: achieves accuracy that naive parallel scaling only reaches at $0.50+
- Pareto-dominates standard approaches across all cost/accuracy operating points

---

## 4. Training Pipeline — Deep Dive

The field has converged on a three-stage training pipeline, with the RL stage being the primary differentiator.

### 4.1 Stage 1: Agentic Mid-Training (Optional but Recommended)

Pre-train on tool-use trajectories to initialize the agent's ability to interleave reasoning with actions. Tongyi DeepResearch uses a fully automatic data synthesis pipeline, avoiding costly human annotation.

**Data collection strategy:**
1. Run a capable model (e.g., GPT-4o) on diverse search tasks with tools enabled
2. Collect successful trajectories (correct final answers with valid tool call sequences)
3. Filter by trajectory quality: correct format, valid JSON tool calls, successful execution
4. Fine-tune target model on these trajectories

### 4.2 Stage 2: Supervised Fine-Tuning (Cold Start)

SFT on expert-like trajectories to establish baseline search and reasoning behavior.

**Data sources:**

1. **Multi-agent distillation:** Use a strong multi-agent system (e.g., GPT-4 + search tools) to generate trajectories, then distill into a single model (O-Researcher, Chain-of-Agents)

2. **Synthetic trajectory generation:** SimpleDeepSearcher synthesizes web-powered reasoning trajectories for SFT

3. **Reflection-annotated data:** WebSeer constructs datasets annotated with reflection patterns for cold-start. Annotation format:
   ```
   <search>query text</search>
   <result>search result</result>
   <think>Am I confident enough? What's missing?</think>
   <reflect>
     I found X but still need Y. I should search for Z next.
   </reflect>
   <search>refined query</search>
   ...
   <answer>final answer</answer>
   ```

**Key insight from O-Researcher:** Multi-agent collaboration to generate training data (decompose → debate → verify) produces higher-fidelity trajectories than single-model self-play.

#### SFT Data Quality Checklist

- [ ] Final answer is correct (verified against ground truth)
- [ ] Tool calls are syntactically valid JSON
- [ ] No hallucinated search results (verify actual tool execution)
- [ ] Trajectory length is reasonable (not over-searched or under-searched)
- [ ] Format tags are consistent (`<think>`, `<search>`, `<answer>`)
- [ ] At least one reflection step for complex multi-hop queries

### 4.3 Stage 3: Reinforcement Learning — Deep Dive

The RL stage is where performance gains concentrate.

#### 4.3.1 GRPO (Group Relative Policy Optimization)

The dominant RL algorithm for search agents. Used by Tongyi DeepResearch, Atom-Searcher, SmartSearch, WebExplorer, and many others.

**Algorithm overview:**

```python
# GRPO Training Loop (simplified pseudocode)
for batch in training_batches:
    queries = batch.queries
    
    # Generate G rollouts per query (the "group")
    rollouts = []
    for query in queries:
        group = [policy.rollout(query) for _ in range(G)]
        rollouts.append(group)
    
    # Compute rewards for each rollout
    for group in rollouts:
        for rollout in group:
            rollout.reward = compute_reward(rollout)
    
    # Compute group-relative advantages
    for group in rollouts:
        group_mean = mean(r.reward for r in group)
        group_std = std(r.reward for r in group)
        for rollout in group:
            rollout.advantage = (rollout.reward - group_mean) / (group_std + eps)
    
    # Policy gradient update
    loss = -mean(rollout.advantage * log_prob(rollout.tokens) for rollout in all_rollouts)
    loss.backward()
    optimizer.step()
```

**Tongyi DeepResearch's stability modifications:**
- **Strict on-policy training:** Never reuse rollouts from old checkpoints
- **Binary reward signals:** Correctness is 0 or 1, no fuzzy rewards — reduces reward hacking
- **Clip-higher strategy:** Asymmetric clipping; allow larger positive updates than negative updates to encourage exploration
- **Token-level policy gradients with LOO (Leave-One-Out) advantage estimation:** Standard advantage estimation; each token's gradient is scaled by the trajectory advantage
- **Negative sample filtering:** Exclude incomplete or truncated rollouts from gradient computation — these are format failures, not reasoning failures, and penalizing them causes format collapse

**Validated hyperparameters (from GTPO/GRPO-S paper, arxiv 2508.04349):**
```
GPU count: 64
Global batch size: 128
Group size (G): 16
Learning rate: 1e-6
Generation temperature: 1.0
Generation top-p: 1.0
Max prompt length: 2048 tokens
Max response length: 4096 tokens
KL coefficient: 0.01–0.05
```

**Why GRPO over PPO for search agents:**
- No value/critic model → 40–60% memory savings → can fit larger policy models
- Simpler training loop → fewer implementation failure modes
- Group-relative normalization → naturally handles reward scale variation across queries

#### 4.3.2 M-GRPO (Multi-Agent GRPO)

**Paper:** arxiv 2511.13288 — Ant Group + Imperial College London

**Problem M-GRPO solves:** In vertical multi-agent systems, the main agent (ℳ) may invoke sub-agents (𝒮₁, 𝒮₂, ...) a variable number of times per rollout. This creates unequal rollout sizes, making standard batched gradient updates impossible. Also, credit assignment is ambiguous: if the final answer is correct, which agent contributed?

**Solution:**

1. **Hierarchical credit assignment:** Compute separate group-relative advantages for ℳ and each 𝒮ᵢ. The main agent receives a trajectory-level reward. Sub-agents receive rewards based on the quality of their specific output (verified by ℳ's subsequent actions — if ℳ immediately reformulates or discards 𝒮ᵢ's output, it was low quality).

2. **Trajectory alignment for fixed batch shapes:**
   - Choose target `D_max` = maximum sub-agent invocations per rollout
   - If a rollout has fewer than `D_max` invocations → pad with masked (zero-weight) trajectories
   - If a rollout has more than `D_max` invocations → drop lowest-priority sub-trajectories
   - This produces fixed-shape batches without destabilizing the group baseline

3. **Decoupled training pipeline:** Main agent and sub-agents run on separate GPU servers. Gradient updates are computed locally; only aggregated advantage statistics are shared via a lightweight shared store (Redis-compatible).

```python
# M-GRPO Training Architecture
class MGRPOTrainer:
    def __init__(self, main_model, sub_model, D_max=5):
        self.main_trainer = GRPOTrainer(main_model)
        self.sub_trainer = GRPOTrainer(sub_model)
        self.D_max = D_max
        self.shared_store = SharedAdvantageStore()
    
    def align_batch(self, rollouts: list[Rollout]) -> AlignedBatch:
        """Pad/drop sub-trajectories to fixed shape D_max."""
        for rollout in rollouts:
            sub_count = len(rollout.sub_trajectories)
            if sub_count < self.D_max:
                # Pad with masked zero-weight entries
                rollout.sub_trajectories += [
                    MaskedTrajectory() for _ in range(self.D_max - sub_count)
                ]
            elif sub_count > self.D_max:
                # Drop lowest-quality sub-trajectories
                rollout.sub_trajectories = sorted(
                    rollout.sub_trajectories, 
                    key=lambda t: t.quality_score, 
                    reverse=True
                )[:self.D_max]
        return AlignedBatch(rollouts)
    
    def train_step(self, queries: list[str]):
        rollouts = self.collect_rollouts(queries)
        aligned = self.align_batch(rollouts)
        
        # Compute advantages for main and sub agents separately
        main_advantages = compute_group_advantages([r.main_trajectory for r in rollouts])
        sub_advantages = compute_group_advantages([
            t for r in rollouts for t in r.sub_trajectories
        ])
        
        # Decouple updates (can run in parallel on separate servers)
        self.main_trainer.update(aligned, main_advantages)
        self.sub_trainer.update(aligned, sub_advantages)
```

**Empirical results:** Consistently outperforms single-agent GRPO and multi-agent GRPO with frozen sub-agents on GAIA, XBench-DeepSearch, and WebWalkerQA.

#### 4.3.3 HiPRAG (Hierarchical Process Rewards)

**Paper:** arxiv 2510.07794 — UT Dallas + Adobe
**Code:** github.com/qualidea1217/HiPRAG

**Problem:** Outcome-only rewards (binary correctness) suffer from reward sparsity. Over-search (retrieving already-known information) and under-search (failing to retrieve when needed) both go uncorrected by outcome rewards alone.

**HiPRAG reward structure:**

```
Total Reward = Format Check × (Answer Check + Process Bonus)

Where:
  Format Check = 1 if trajectory is parseable, 0 otherwise (gate)
  Answer Check = 1 if final answer is correct, 0 otherwise
  Process Bonus = α × (optimal_steps / total_steps)
  
  optimal_steps = total_steps - over_search_steps - under_search_steps
```

**Over-search detection (on-the-fly during training):**

```python
def detect_over_search(
    reasoning_step: str, 
    prior_knowledge: str,
    detector_llm: LLM
) -> bool:
    """
    Returns True if this search was unnecessary (info already known).
    Uses a fast external LLM as verifier.
    """
    prompt = f"""
    The agent has accumulated this knowledge:
    {prior_knowledge}
    
    The agent then performed this search step:
    {reasoning_step}
    
    Question: Was the information retrieved by this search already 
    present in the agent's prior knowledge? Answer YES or NO only.
    """
    return detector_llm.generate(prompt).strip() == "YES"

def detect_under_search(
    reasoning_step: str,
    question: str,
    detector_llm: LLM  
) -> bool:
    """
    Returns True if the agent should have searched but didn't.
    """
    prompt = f"""
    For the question: {question}
    
    The agent made this reasoning step without searching:
    {reasoning_step}
    
    Question: Does this step make a factual claim that should have been 
    verified with a search? Answer YES or NO only.
    """
    return detector_llm.generate(prompt).strip() == "YES"
```

**Process bonus gating:** The process bonus is only applied when the format AND answer are correct. This prevents over-penalizing an agent that takes suboptimal search steps but still reaches a correct answer — which would harm reasoning ability.

**Empirical results:**
- Over-search rate: 27% (baseline) → 2.3% (HiPRAG) — 12× reduction
- Under-search rate: reduced concurrently
- Average accuracy: 65.4% (3B) / 67.2% (7B) — outperforms strong baselines
- Generalizes across: Qwen2.5, Llama-3.2, PPO, GRPO, 3B/7B models

#### 4.3.4 Atom-Searcher (Atomic Thought Rewards)

**Paper:** arxiv 2508.12800

**Key concept:** Decompose the agent's reasoning chain into "atomic thoughts" — fine-grained functional units (e.g., "identify the search gap", "formulate the refined query", "evaluate source credibility"). Each atomic thought is scored by a **Reasoning Reward Model (RRM)**.

**Curriculum reward schedule:**
```
Early training (epochs 1–N_warmup):
  reward = α * ATR + (1-α) * outcome_reward
  α starts at 0.8 (heavy process reward)

Late training (epochs N_warmup–N_total):
  reward = β * ATR + (1-β) * outcome_reward  
  β decreases toward 0.2 (heavy outcome reward)
```

This schedule first teaches correct reasoning processes, then fine-tunes for correct outcomes. Prevents the model from finding outcome shortcuts that bypass sound reasoning.

**RRM training:**
The RRM is trained separately on human-annotated reasoning quality scores. A 7B model can serve as the RRM if fine-tuned on sufficient examples. The RRM receives an atomic thought + context and outputs a quality score [0, 1].

**Results:** 8.5% improvement on in-domain, 2.5% on out-of-domain tasks over previous SOTA.

#### 4.3.5 ReSum-GRPO

**Paper:** arxiv 2509.13313

Extends GRPO to handle segmented trajectories (those with periodic summarization events).

**Key innovation:** Reward is computed only from the final segment's answer. The same reward is **broadcast** to all prior segments in the rollout. This enables the agent to learn that effective summarization in segment 1 leads to better outcomes in segment 3.

**Format enforcement:** If the agent fails to emit required format tokens (`<think>`, `<tool_call>`, etc.) at any step → terminate entire trajectory → assign reward=0 to all segments. This implicitly teaches format compliance without needing explicit format rewards.

#### 4.3.6 HRPO (Hop-Grouped Relative Policy Optimization)

**Used in:** Dr. Zero (Meta, arxiv 2601.07055)

Standard GRPO normalizes within a group of rollouts for the same query. HRPO normalizes within a group of structurally similar queries (same hop-count, same entity type). This produces better baseline estimates and reduces variance in the advantage signal.

**Curriculum:** Dr. Zero's proposer generates questions at progressively increasing difficulty. As the solver gets better, the proposer increases difficulty to stay at the solver's capability frontier. This self-adversarial curriculum requires no human annotation.

```python
# Dr. Zero self-evolution loop (pseudocode)
proposer = base_model  # Same base model as solver initially
solver = base_model

for round in range(max_rounds):
    # Proposer generates diverse questions at current difficulty
    questions = proposer.generate_questions(
        difficulty=current_difficulty,
        n=batch_size,
        diversity_penalty=0.3  # Penalize repetitive questions
    )
    
    # Solver attempts questions
    answers = solver.solve(questions)
    
    # Measure solver accuracy
    accuracy = evaluate(answers, questions)
    
    # Adjust difficulty based on solver performance
    if accuracy > 0.8:
        current_difficulty += difficulty_step  # Too easy → harder
    elif accuracy < 0.4:
        current_difficulty -= difficulty_step  # Too hard → easier
    # Goldilocks zone: 40–80% accuracy
    
    # Train solver on questions with known correct answers
    solver = train_with_HRPO(solver, questions, answers)
    
    # Optionally update proposer to generate harder questions
    if round % proposer_update_freq == 0:
        proposer = update_proposer(proposer, solver)
```

### 4.4 Reward Functions — Implementation Reference

```python
class ResearchAgentReward:
    """Composite reward for research agent training."""
    
    def __init__(self, weights: dict):
        self.w = weights
        # Default weights
        self.w.setdefault("correctness", 1.0)
        self.w.setdefault("format", 0.1)
        self.w.setdefault("process", 0.3)
        self.w.setdefault("efficiency", 0.2)
    
    def compute(self, rollout: Rollout, ground_truth: str) -> float:
        # 1. Correctness: is the final answer correct?
        correctness = self._judge_correctness(rollout.final_answer, ground_truth)
        
        # 2. Format: is the trajectory parseable?
        format_ok = self._check_format(rollout.trajectory)
        
        # 3. Process quality (HiPRAG style)
        if format_ok and correctness > 0:
            process = self._compute_process_bonus(rollout)
        else:
            process = 0.0  # Gate: only reward process if outcome is correct
        
        # 4. Efficiency: penalize excessive tool calls
        efficiency = max(0, 1 - rollout.tool_call_count / self.max_tool_calls)
        
        return (
            self.w["correctness"] * correctness +
            self.w["format"] * float(format_ok) +
            self.w["process"] * process +
            self.w["efficiency"] * efficiency
        )
    
    def _judge_correctness(self, answer: str, ground_truth: str) -> float:
        """LLM-as-judge for open-ended answers; exact match for factoid."""
        if self.use_exact_match:
            return float(normalize(answer) == normalize(ground_truth))
        else:
            return self.judge_llm.score(answer, ground_truth)
    
    def _compute_process_bonus(self, rollout: Rollout) -> float:
        """Count optimal steps (not over/under-search)."""
        steps = parse_steps(rollout.trajectory)
        optimal = sum(1 for s in steps 
                      if not detect_over_search(s) and not detect_under_search(s))
        return optimal / len(steps)
```

---

## 5. Recommended Reference Architecture

Based on synthesis across all surveyed systems, here is a production-grade architecture optimized for accuracy and cost:

### Layer 0: Intake & Routing

```python
class QueryRouter:
    def classify(self, query: str) -> ComplexityTier:
        """
        Uses a fast, cheap model to classify query complexity.
        Returns: SIMPLE | MEDIUM | COMPLEX | OPEN_ENDED
        """
        features = {
            "entity_count": count_entities(query),
            "hop_count_estimate": estimate_hops(query),
            "is_report_request": detect_report_intent(query),
            "is_comparison": detect_comparison_intent(query),
        }
        return self.classifier.predict(features)
    
    def get_config(self, tier: ComplexityTier) -> ExecutionConfig:
        configs = {
            SIMPLE: ExecutionConfig(
                max_tool_calls=10, max_agents=1, 
                planner_model="flash", writer_model="flash"
            ),
            MEDIUM: ExecutionConfig(
                max_tool_calls=30, max_agents=3,
                planner_model="flash", writer_model="pro"
            ),
            COMPLEX: ExecutionConfig(
                max_tool_calls=100, max_agents=10,
                planner_model="pro", writer_model="pro"
            ),
            OPEN_ENDED: ExecutionConfig(
                max_tool_calls=300, max_agents=20,
                planner_model="pro", writer_model="ultra",
                enable_dynamic_outline=True
            ),
        }
        return configs[tier]
```

### Layer 1: Planning

- Parse user query
- Classify complexity tier (simple → medium → complex → open-ended report)
- Select execution strategy: single-agent for simple, multi-agent for complex, planner-writer for reports
- Initialize budget tracker with tier-appropriate limits
- Initialize memory bank (empty)
- Generate initial research plan / outline hypothesis

### Layer 2: Orchestration

- **Lead Agent:** Owns the research plan, delegates to sub-agents, maintains the outline (for report tasks)
- **Sub-Agents (N, dynamic):** Each receives scoped task description with clear boundaries, output format spec, and tool guidance
- **Coordination:** Synchronous — lead waits for sub-agent batch completion before next planning cycle
- Sub-agents operate with ReSum-enabled context management for long-horizon search

**Delegation message template** (validated by Anthropic):
```
TASK: {specific_research_objective}

SCOPE: You are responsible for {explicit_scope}. Do NOT investigate {out_of_scope_areas}.

OUTPUT FORMAT:
{
  "findings": [{
    "fact": "...",
    "source_url": "...", 
    "confidence": 0.0-1.0
  }],
  "gaps": ["what was not found"],
  "summary": "2-3 sentence summary"
}

TOOLS AVAILABLE: web_search, visit_url
TOOL GUIDANCE: Use web_search for broad exploration, visit_url for specific sources.
Prefer academic papers and official sources over news aggregators.

BUDGET: Maximum {N} tool calls.
```

### Layer 3: Search & Evidence

- Unified search interface abstracting multiple backends (web, academic, code, enterprise data)
- URL deduplication and ranking
- Content extraction with structured parsing
- Source quality scoring (prefer primary over secondary, penalize SEO-optimized farms)
- Budget tracker updated after each tool call

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

## 6. Data Schemas & Type Definitions

### 6.1 Core State Schema

```typescript
interface ResearchState {
  session_id: string;
  query: string;
  complexity_tier: "simple" | "medium" | "complex" | "open_ended";
  
  // Planning
  research_plan: ResearchPlan;
  outline: OutlineSection[];           // For open-ended tasks
  
  // Execution
  agents: AgentInstance[];
  active_agent_count: number;
  
  // Evidence
  memory_bank: MemoryBank;
  visited_urls: Set<string>;
  search_history: SearchRecord[];
  
  // Budget
  budget: BudgetState;
  
  // Output
  draft_report: string;
  citations: Citation[];
  final_answer: string;
  
  // Meta
  started_at: string;           // ISO timestamp
  current_phase: ResearchPhase;
  reflection_count: number;
}

interface ResearchPlan {
  main_objective: string;
  sub_questions: SubQuestion[];
  strategy: "single_agent" | "multi_agent" | "dynamic_outline";
}

interface SubQuestion {
  id: string;
  text: string;
  assigned_agent_id?: string;
  status: "pending" | "in_progress" | "complete" | "failed";
  answer?: string;
  confidence: number;
}

interface BudgetState {
  total_tool_calls: number;
  used_tool_calls: number;
  total_tokens: number;
  used_tokens: number;
  estimated_cost_usd: number;
  budget_fraction_remaining: number;  // 0.0–1.0
}

interface Citation {
  claim: string;
  source_url: string;
  source_title: string;
  quote: string;              // Verbatim text from source supporting claim
  verified: boolean;          // Did Citation Agent verify?
}

type ResearchPhase = 
  | "planning"
  | "decomposition"
  | "execution"
  | "synthesis"
  | "citation_verification"
  | "complete";
```

### 6.2 Agent Instance Schema

```typescript
interface AgentInstance {
  id: string;
  role: "lead" | "researcher" | "planner" | "writer" | "citation";
  
  // Configuration
  model: string;              // e.g., "claude-sonnet-4", "gemini-pro"
  temperature: number;        // 0.0–1.0
  max_tokens: number;
  
  // Task
  task: AgentTask;
  
  // Execution
  status: "pending" | "running" | "complete" | "failed";
  context: ContextWindow;
  tool_calls: ToolCallRecord[];
  
  // Output
  findings: Finding[];
  gaps: string[];
  summary: string;
  
  // Timing
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
}

interface AgentTask {
  objective: string;
  scope: string;
  out_of_scope: string[];
  output_format: string;
  tool_guidance: string;
  budget_calls: number;
}

interface ContextWindow {
  tokens_used: number;
  tokens_max: number;
  summary_count: number;      // How many ReSum summarizations occurred
  current_summary?: string;   // Active compressed state
}

interface ToolCallRecord {
  tool: "search" | "visit" | "summarize" | "reflect";
  input: Record<string, unknown>;
  output_chars: number;
  success: boolean;
  timestamp: string;
}
```

### 6.3 Training Data Schema

```typescript
interface TrainingExample {
  id: string;
  query: string;
  ground_truth: string;
  
  // Trajectory
  trajectory: TrajectoryStep[];
  
  // Labels
  is_correct: boolean;
  reward: number;
  
  // Quality metadata
  hop_count: number;
  difficulty: "easy" | "medium" | "hard";
  source_dataset: string;
}

interface TrajectoryStep {
  step_id: number;
  type: "think" | "search" | "visit" | "summarize" | "reflect" | "answer";
  content: string;
  tool_call?: ToolCall;
  tool_result?: string;
  
  // Process reward labels (for HiPRAG training)
  is_over_search?: boolean;
  is_under_search?: boolean;
  atomic_thought_quality?: number;  // 0.0–1.0 RRM score
}
```

---

## 7. Prompt Engineering Patterns

This section documents proven prompt patterns validated in production and research.

### 7.1 Lead Agent System Prompt

```
You are a research orchestrator. Your job is to plan and coordinate research 
to answer complex questions.

PLANNING PRINCIPLES:
- Decompose the query into independent sub-tasks that can be researched in parallel
- Assign clear, non-overlapping responsibilities to each sub-agent
- Match effort to complexity: simple facts need 1 agent; complex analysis needs many

DELEGATION FORMAT:
Each sub-agent must receive:
1. A specific objective (not vague like "research X" — be precise)
2. Explicit scope boundaries (what to cover AND what NOT to cover)
3. Expected output format
4. Tool guidance (which tools to prioritize)
5. Budget limit (max tool calls)

SCALING RULES:
- Simple fact (date, person, single fact): 1 sub-agent, max 5 tool calls
- Comparison or list: 2–4 sub-agents, max 15 tool calls each
- Complex analysis: up to 10 sub-agents, max 30 tool calls each
- Never spawn sub-agents for information you already have

COMMON MISTAKES TO AVOID:
- Do NOT spawn multiple agents that will do the same searches
- Do NOT continue searching when you already have sufficient evidence
- Do NOT use verbose search queries; keep them specific and targeted
- Do NOT delegate vague tasks; every delegation must have measurable success criteria

{budget_signal}
```

### 7.2 Sub-Agent System Prompt

```
You are a specialized research agent. You have been assigned a specific task.
Complete your task efficiently using the available tools.

YOUR TASK:
{task_objective}

YOUR SCOPE:
Cover: {scope}
Do NOT cover: {out_of_scope}

SEARCH STRATEGY:
1. Start with broad searches to understand the landscape
2. Follow the most promising leads with targeted follow-up searches
3. Visit primary sources (academic papers, official docs, expert blogs)
4. Avoid revisiting URLs you've already visited

SOURCE QUALITY:
Prefer: Academic papers, official documentation, primary research, expert blogs
Avoid: SEO content farms, aggregator sites without original content, Wikipedia for facts

OUTPUT FORMAT:
{output_format}

REFLECTION:
- After every 5 tool calls, assess: "Do I have enough evidence to answer?"
- If you're going in circles (same searches, no new info), stop and report gaps
- If you find conflicting information from different sources, report both with sources

{budget_signal}
```

### 7.3 ReSum Summary Tool Prompt

```
You are a goal-oriented research summarizer. You will receive a long conversation 
history of a web research agent. Your job is to produce a compressed summary 
that enables the agent to continue researching effectively.

ORIGINAL QUESTION:
{original_query}

CONVERSATION HISTORY:
{history}

Produce a <summary> with these sections:

<summary>
## Verified Evidence Found
[List specific facts found, each with source URL]
- Fact 1 [source: URL]
- Fact 2 [source: URL]

## Information Gaps
[List specific information still needed to answer the question]
- Gap 1: [what specific information is missing]
- Gap 2: [what specific information is missing]

## Recommended Next Steps
[Concrete search actions to fill the gaps]
1. Search for: [specific query to fill Gap 1]
2. Visit: [specific URL if you know a good source]

## Search History
[URLs already visited, to avoid re-visiting]
- URL 1
- URL 2
</summary>
```

### 7.4 Reflection Prompt

```
REFLECTION CHECKPOINT

After {N} search rounds, take stock of your progress.

CURRENT STATE:
{current_findings}

ORIGINAL QUESTION:
{query}

Answer these questions:
1. COMPLETENESS: What fraction of the question can I answer with current evidence? (0–100%)
2. CONFIDENCE: How confident am I in the evidence quality? (low/medium/high)
3. GAPS: What specific information am I still missing?
4. STRATEGY: Should I (a) continue current search direction, (b) try a different angle, or (c) synthesize now?

Provide your reflection in <reflect> tags, then continue with your next action.
```

### 7.5 Citation Agent Prompt

```
You are a citation verification agent. You will receive a research report draft 
and a collection of source documents. Your job is to verify that every factual 
claim in the report has accurate, specific citation support.

REPORT DRAFT:
{report_draft}

SOURCE DOCUMENTS:
{source_documents}

For each factual claim in the report:
1. Find the specific text in the source documents that supports it
2. If found: add inline citation [Source: URL, Quote: "exact quote from source"]
3. If NOT found: mark the claim as [UNVERIFIED - needs source]
4. If the source contradicts the claim: mark as [INCORRECT - source says: "..."]

Return the annotated report.
```

### 7.6 Budget Signal Template

```
[BUDGET STATUS]
Tool calls: {used}/{total} used ({pct_remaining:.0%} remaining)
Estimated cost: ${cost:.3f}

{urgency_message}
```

Where `urgency_message` is:
- `> 70% remaining`: "You have ample budget. Explore thoroughly."
- `30–70% remaining`: "Budget is moderate. Prioritize high-value leads."
- `10–30% remaining`: "Budget is limited. Focus on essential gaps only."
- `< 10% remaining`: "Budget nearly exhausted. Synthesize immediately with current evidence."

---

## 8. Production Deployment

### 8.1 System Architecture

```
                    ┌─────────────────────────────────────────┐
                    │            API Gateway                   │
                    │   Rate limiting, auth, request routing   │
                    └───────────────┬─────────────────────────┘
                                    │
                    ┌───────────────▼─────────────────────────┐
                    │           Query Router                   │
                    │   Classify complexity, assign config     │
                    └───────────────┬─────────────────────────┘
                                    │
            ┌───────────────────────▼──────────────────────┐
            │              Orchestration Layer              │
            │   Lead Agent + Sub-Agent coordination        │
            │   Budget Tracker embedded                    │
            └──────┬──────────────────────┬───────────────┘
                   │                      │
       ┌───────────▼──────┐   ┌──────────▼──────────────┐
       │   Search Engine  │   │   Memory / State Store   │
       │   (Brave, Serper,│   │   (Redis / PostgreSQL)   │
       │   Jina, Tavily)  │   │   Research state, URLs   │
       └──────────────────┘   └─────────────────────────┘
                   │
       ┌───────────▼──────────────────┐
       │      Observability Stack     │
       │   Langfuse / OpenTelemetry   │
       │   Trace every agent decision │
       └──────────────────────────────┘
```

### 8.2 Docker Compose Configuration

```yaml
version: "3.9"

services:
  api:
    image: research-agent:latest
    ports:
      - "8000:8000"
    environment:
      - MODEL_PROVIDER=anthropic
      - SEARCH_PROVIDER=brave
      - REDIS_URL=redis://redis:6379
      - LANGFUSE_HOST=http://langfuse:3000
      - MAX_CONCURRENT_SESSIONS=50
      - DEFAULT_TOOL_CALL_BUDGET=100
      - DEFAULT_TOKEN_BUDGET=200000
    depends_on:
      - redis
      - postgres
    deploy:
      resources:
        limits:
          memory: 4G

  worker:
    image: research-agent:latest
    command: python -m worker
    environment:
      - REDIS_URL=redis://redis:6379
      - WORKER_CONCURRENCY=10
    deploy:
      replicas: 3  # Scale workers independently

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: research_agent
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data

  langfuse:
    image: langfuse/langfuse:latest
    ports:
      - "3000:3000"

volumes:
  redis_data:
  pg_data:
```

### 8.3 Rate Limiting Strategy

Rate limiting for research agents is multi-dimensional:

```python
class ResearchRateLimiter:
    """
    Multi-layer rate limiting for production research agents.
    Limits: per-user, per-session, and global API limits.
    """
    
    def __init__(self, redis_client):
        self.redis = redis_client
        
    # User-level limits
    USER_DAILY_QUERIES = 100
    USER_CONCURRENT_SESSIONS = 3
    USER_DAILY_TOKEN_BUDGET = 10_000_000  # 10M tokens/day
    
    # Global limits (protect API provider costs)
    GLOBAL_CONCURRENT_SESSIONS = 500
    GLOBAL_SEARCH_RPM = 1000      # Requests per minute to search APIs
    GLOBAL_LLM_RPM = 200          # Requests per minute to LLM APIs
    
    def check_user_limits(self, user_id: str) -> RateLimitResult:
        pipe = self.redis.pipeline()
        
        # Check daily query count (sliding window)
        query_key = f"rl:user:{user_id}:daily_queries"
        pipe.incr(query_key)
        pipe.expire(query_key, 86400)
        
        # Check concurrent sessions
        session_key = f"rl:user:{user_id}:active_sessions"
        pipe.get(session_key)
        
        results = pipe.execute()
        daily_count = results[0]
        active_sessions = int(results[2] or 0)
        
        if daily_count > self.USER_DAILY_QUERIES:
            return RateLimitResult(allowed=False, reason="daily_query_limit")
        if active_sessions >= self.USER_CONCURRENT_SESSIONS:
            return RateLimitResult(allowed=False, reason="concurrent_session_limit")
        
        return RateLimitResult(allowed=True)
    
    def token_bucket_search(self, session_id: str) -> bool:
        """Token bucket for search API calls."""
        key = f"rl:search:bucket"
        current = self.redis.get(key)
        
        if current is None or int(current) < self.GLOBAL_SEARCH_RPM:
            self.redis.incr(key)
            self.redis.expire(key, 60)  # Reset every minute
            return True
        return False
```

### 8.4 Error Recovery & Durable Execution

Research sessions can run for minutes to hours. Durable execution is essential.

```python
class DurableResearchSession:
    """
    Checkpoint-based durable execution for long-running research.
    Survives process crashes and restarts.
    """
    
    def __init__(self, session_id: str, state_store: StateStore):
        self.session_id = session_id
        self.store = state_store
    
    def save_checkpoint(self, state: ResearchState):
        """Save current state to durable store."""
        self.store.set(
            f"checkpoint:{self.session_id}",
            state.serialize(),
            ttl=86400  # 24 hour TTL
        )
    
    def load_checkpoint(self) -> Optional[ResearchState]:
        """Restore state from checkpoint after failure."""
        data = self.store.get(f"checkpoint:{self.session_id}")
        if data:
            return ResearchState.deserialize(data)
        return None
    
    async def run_with_recovery(self, research_fn: Callable):
        """Execute research function with automatic retry on failure."""
        state = self.load_checkpoint()
        if state:
            logger.info(f"Resuming session {self.session_id} from checkpoint")
        
        max_retries = 3
        for attempt in range(max_retries):
            try:
                result = await research_fn(state)
                self.store.delete(f"checkpoint:{self.session_id}")
                return result
            except TransientError as e:
                logger.warning(f"Transient error attempt {attempt}: {e}")
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
            except PermanentError as e:
                logger.error(f"Permanent failure: {e}")
                raise
```

### 8.5 Caching Strategy

```python
class ResearchCache:
    """
    Two-tier cache: in-memory for hot data, Redis for shared state.
    """
    
    # Cache search results for 1 hour (within a research session)
    SEARCH_RESULT_TTL = 3600
    
    # Cache visited page content for 24 hours (across sessions)
    PAGE_CONTENT_TTL = 86400
    
    # Never cache: LLM reasoning, final answers (always fresh)
    
    def get_search_results(self, query: str) -> Optional[list[SearchResult]]:
        key = f"cache:search:{hashlib.sha256(query.encode()).hexdigest()}"
        cached = self.redis.get(key)
        if cached:
            return SearchResult.deserialize_list(cached)
        return None
    
    def set_search_results(self, query: str, results: list[SearchResult]):
        key = f"cache:search:{hashlib.sha256(query.encode()).hexdigest()}"
        self.redis.setex(key, self.SEARCH_RESULT_TTL, serialize(results))
    
    def get_page_content(self, url: str) -> Optional[str]:
        key = f"cache:page:{hashlib.sha256(url.encode()).hexdigest()}"
        return self.redis.get(key)
    
    def set_page_content(self, url: str, content: str):
        key = f"cache:page:{hashlib.sha256(url.encode()).hexdigest()}"
        self.redis.setex(key, self.PAGE_CONTENT_TTL, content)
```

### 8.6 Observability & Tracing

```python
# Using Langfuse for full trace visibility
from langfuse import Langfuse

langfuse = Langfuse()

class TracedResearchAgent:
    def __init__(self, agent_id: str, session_trace):
        self.agent_id = agent_id
        self.trace = session_trace
    
    def search(self, query: str) -> list[SearchResult]:
        span = self.trace.span(
            name=f"search:{self.agent_id}",
            input={"query": query}
        )
        results = self._actual_search(query)
        span.end(output={"result_count": len(results)})
        return results
    
    def reason(self, prompt: str, context: str) -> str:
        generation = self.trace.generation(
            name=f"reason:{self.agent_id}",
            model="claude-sonnet-4",
            input=prompt,
            metadata={"context_chars": len(context)}
        )
        response = self._actual_llm_call(prompt)
        generation.end(
            output=response,
            usage={"input": count_tokens(prompt), "output": count_tokens(response)}
        )
        return response
```

### 8.7 Production Lessons from 1,200 LLM Deployments (ZenML Database)

Key patterns from real production systems (December 2025 analysis):

1. **LLM proxy layer is essential.** Build an internal LLM proxy service on top of your API provider for: traffic management, model fallback, bandwidth allocation, prompt caching. Stripe's approach on AWS Bedrock is the canonical example.

2. **Just-In-Time instructions beat massive system prompts.** Shopify found that scaling from 20 to 50+ tools with overlapping functionality caused agent confusion. Their solution: provide relevant guidance exactly when the specific tool is needed, not upfront.

3. **Context engineering is a distinct discipline.** The teams shipping production systems invest heavily in what to include in context (not what model to use). Model upgrades provide less gain than context quality improvements.

4. **Prompt caching addresses quadratic cost problem.** For agents with long system prompts (research agents have large system prompts by nature), prompt caching is critical for cost management.

5. **Cursor's discovery:** Dropping reasoning traces from training data caused 30% performance degradation. Always preserve thinking tokens in training data.

---

## 9. Evaluation Framework

### 9.1 Benchmarks (by task type)

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
| DeepResearch Bench (FACT) | Citation accuracy | High |
| xbench-DeepSearch | Comprehensive search eval | High |
| SailorFog-QA | Long-horizon multi-step | High |

**Benchmark selection guidance:**
- For factoid QA systems → HotpotQA + SimpleQA
- For report generation → DeepResearch Bench RACE + FACT
- For production readiness → GAIA + BrowseComp
- For training signal → SailorFog-QA (requires summary tool invocation)

### 9.2 LLM-as-Judge Setup

```python
class ResearchQualityJudge:
    """
    LLM-as-judge for research quality evaluation.
    Uses structured rubric to reduce variance.
    """
    
    JUDGE_PROMPT = """
    You are evaluating the quality of a research report.
    
    QUESTION: {question}
    GROUND TRUTH: {ground_truth}  
    REPORT: {report}
    
    Score each dimension from 0 to 10:
    
    1. FACTUAL ACCURACY (0-10): Do the claims match the ground truth?
    2. COMPLETENESS (0-10): Are all aspects of the question covered?
    3. CITATION ACCURACY (0-10): Do sources actually support the claims?
    4. SOURCE QUALITY (0-10): Are sources authoritative and primary?
    5. CLARITY (0-10): Is the report well-organized and clear?
    
    Return ONLY a JSON object:
    {
      "factual_accuracy": N,
      "completeness": N,
      "citation_accuracy": N,
      "source_quality": N,
      "clarity": N,
      "overall": N,
      "reasoning": "brief explanation"
    }
    """
    
    def evaluate(self, question: str, ground_truth: str, report: str) -> EvalResult:
        # Use multiple judge models to reduce single-model bias
        judges = [self.judge_claude, self.judge_gpt4]
        results = [j.score(question, ground_truth, report) for j in judges]
        
        # Average scores across judges
        # Cohen's Kappa > 0.7 indicates reliable inter-judge agreement
        return aggregate_results(results)
```

### 9.3 Evaluation Dimensions

1. **Factual accuracy** — Do claims match sources?
2. **Citation accuracy** — Do sources actually support the claims? (Target: >90%, WebWeaver baseline)
3. **Completeness** — Are all aspects of the query covered?
4. **Source quality** — Primary over secondary, authoritative over SEO
5. **Tool efficiency** — Appropriate tool selection, minimal wasted calls
6. **Cost per query** — Total token spend and API calls
7. **Latency** — Time to first result, time to complete report

### 9.4 Automated Citation Verification

```python
def verify_citation(claim: str, source_url: str, source_content: str) -> CitationVerdict:
    """
    Verifies that source_content actually supports claim.
    Returns SUPPORTED | UNSUPPORTED | CONTRADICTED | NOT_FOUND
    """
    prompt = f"""
    CLAIM: {claim}
    
    SOURCE CONTENT:
    {source_content[:3000]}  # Truncate to relevant portion
    
    Does the source content support, contradict, or not address the claim?
    
    Answer: SUPPORTED | UNSUPPORTED | CONTRADICTED | NOT_FOUND
    Quote the relevant text if SUPPORTED.
    """
    
    response = judge_llm.generate(prompt)
    return parse_verdict(response)
```

### 9.5 Human Evaluation Protocol

From Anthropic's engineering experience:
- Start with **~20 diverse queries** — reveals dramatic effect sizes, sufficient for rapid iteration
- Scale to **hundreds of queries** only after automated metrics have stabilized
- Human evaluation catches what automated metrics miss:
  - Hallucinated answers on unusual queries
  - Subtle source selection biases (agent picks low-quality high-ranking sources)
  - System failures on edge cases
  - Misleading citations (source exists but doesn't support the claim)

**Query diversity for human eval:**
- 5 simple factoid queries (control group)
- 5 multi-hop comparison queries
- 5 open-ended research requests
- 3 controversial or contested topics (tests balanced sourcing)
- 2 queries with known incorrect popular beliefs (tests hallucination resistance)

---

## 10. Cost Optimization Strategies

Ranked by impact:

### 10.1 Complexity-Based Routing (5–10× cost reduction)

Simple queries routed to a single-agent with 3–10 tool calls instead of a 10-agent parallel system. This is the highest-leverage optimization because the cost difference between tiers is multiplicative.

```python
# Routing decision + cost estimate
def estimate_query_cost(query: str) -> CostEstimate:
    tier = router.classify(query)
    config = router.get_config(tier)
    
    estimated_tool_calls = config.max_tool_calls * 0.6  # Assume 60% utilization
    estimated_tokens = estimated_tool_calls * 2000  # ~2K tokens per tool call round trip
    
    return CostEstimate(
        tier=tier,
        estimated_tool_calls=estimated_tool_calls,
        estimated_tokens=estimated_tokens,
        estimated_cost_usd=estimated_tokens * 0.000003  # $3/1M tokens (pro tier estimate)
    )
```

### 10.2 Budget-Aware Execution (31% cost reduction)

BATS-style budget tracking embedded in every agent prompt. See Section 3.7 for implementation.

### 10.3 Model Tiering (2–5× cost reduction)

| Agent Role | Model Tier | Example |
|------------|------------|---------|
| Query classification | Nano | Gemini Flash Lite |
| Sub-agent search execution | Flash | Gemini Flash, GPT-4o-mini |
| Lead agent planning | Pro | Gemini Pro, GPT-4o |
| Final synthesis | Pro/Ultra | Claude Sonnet, Claude Opus |
| Citation verification | Flash | Fast + cheap |

### 10.4 ReSum Context Compression

Prevents context window overflow that forces expensive re-processing or truncation. Enables longer effective search horizons within the same token budget. See Section 3.3a for implementation.

### 10.5 HiPRAG-Trained Search Behavior

Post-training with HiPRAG eliminates over-search (27% → 2.3%), directly reducing unnecessary API calls. One-time training cost; permanent inference savings.

### 10.6 Prompt Caching

For systems with large system prompts (research agents), prompt caching (AWS Bedrock, Anthropic API) can reduce input token costs by 60–90% on repeated calls with the same system prompt.

### 10.7 Parallel Execution

Anthropic's approach of 3–5 sub-agents with 3+ parallel tool calls each cuts wall-clock time by up to 90%. Time is cost in infrastructure terms — faster completion reduces resource lock time.

### 10.8 Self-Evolution Training (Dr. Zero)

Eliminates the need for expensive human-annotated training data. The same base model acts as both proposer and solver in a self-adversarial curriculum. One-time training infrastructure investment.

---

## 11. Anti-Patterns & Failure Modes

### 11.1 Training Anti-Patterns

| Anti-Pattern | Symptom | Fix |
|-------------|---------|-----|
| Including truncated rollouts in gradient | Format collapse — model stops generating complete trajectories | Filter: exclude rollouts where `<answer>` tag is missing |
| Reward scale mismatch | Training unstable, high variance | Normalize rewards within group; use running mean/std |
| Too-high learning rate | Catastrophic forgetting of base capabilities | Use 1e-6 as starting point; reduce if instability seen |
| Underpowered summary tool (ReSum) | Context quality degrades after summarization | Use ≥30B model fine-tuned on summarization; generic models fail |
| Process rewards without outcome gating (HiPRAG) | Model learns to "optimize" search without getting correct answers | Gate process bonus on format+correctness: `bonus *= (format_ok AND answer_correct)` |
| Group size too small (GRPO) | High variance, poor baseline estimates | G ≥ 8; G = 16 is the recommended default |
| On-policy violations | Distribution shift, degraded performance | Regenerate rollouts at each training step; never reuse from old checkpoint |

### 11.2 Inference Anti-Patterns

| Anti-Pattern | Symptom | Fix |
|-------------|---------|-----|
| Circular search | Agent keeps searching the same URLs/queries | URL deduplication + query similarity threshold; reflection trigger at round N |
| Over-decomposition | 50 sub-agents for a factoid question | Embed scaling rules in orchestrator prompt; enforce max agent limits |
| Vague delegation | Sub-agents duplicate work or leave gaps | Require explicit scope + out-of-scope in every delegation |
| Premature termination | Agent stops searching when answer is uncertain | Gap queue: if answer confidence < threshold, push to gap queue and continue |
| Context accumulation without summarization | Context fills up → truncation → information loss | Set ReSum trigger at 80% context utilization |
| Citation hallucination | Agent cites sources that don't exist or don't support the claim | Dedicated Citation Agent; hierarchical retrieval links claims to specific memory bank entries |
| SEO source bias | Agent cites content farms instead of primary sources | Explicit source quality heuristics in tool guidance; train on quality-filtered data |
| Budget blindness | Agent burns through budget on low-value searches | Budget Tracker in every agent prompt; BATS for adaptive allocation |

### 11.3 Orchestration Anti-Patterns

| Anti-Pattern | Symptom | Fix |
|-------------|---------|-----|
| No task boundaries | Sub-agents investigate identical areas | Orchestrator must enumerate both scope AND explicit out-of-scope for each sub-agent |
| Synchronous sub-agent spawning | Slow, no parallelism benefit | Spawn all sub-agents for a phase in parallel; wait for batch completion |
| Lead context overflow | Plan gets truncated, lead forgets early decisions | Lead saves plan to persistent memory before context limit; loads plan after truncation |
| Single model for all roles | Too expensive (using Pro for classification) | Tier models: nano for routing, flash for search, pro for synthesis |
| No error recovery | Single sub-agent failure kills entire session | Checkpoint after each phase; retry failed sub-agents independently |

### 11.4 Documented Edge Cases

1. **Queries about very recent events:** Search may return news with incorrect initial reporting. Mitigation: prefer sources with explicit dates; corroborate across multiple independent sources.

2. **Questions with contested facts:** Agent may confidently cite one side. Mitigation: detect controversy signals in sources; explicitly surface disagreement in output.

3. **Questions about private individuals:** Searching may return outdated or incorrect information. Mitigation: require multiple corroborating sources for claims about private individuals.

4. **Technical documentation that changes frequently:** Cached page content may be stale. Mitigation: shorter cache TTL for documentation domains; explicitly check document publication date.

5. **Non-English source material:** Search engines may not return best sources if they're in another language. Mitigation: include language-specific search queries; use multilingual embedding models for relevance ranking.

---

## 12. Architecture Decision Tree

Use this to select the right architecture for your use case:

```
START: What type of research are you building?

Is the output primarily a structured report (10+ pages)?
├── YES → Use WebWeaver Dynamic Outline architecture
│         (planner-writer separation, memory bank, hierarchical retrieval)
│         Training: GRPO or ReSum-GRPO on open-ended report datasets
│
└── NO: What's the complexity of typical queries?
    │
    ├── SIMPLE (single-hop, factoid): 
    │   → Single Agent with Budget Tracker
    │   Training: Standard GRPO with outcome rewards
    │   Context: ReSum only if query requires >10 search rounds
    │
    ├── MEDIUM (multi-hop, entity comparison):
    │   → Multi-Agent (3–5 agents, static decomposition)
    │   Training: M-GRPO if training separate agent models
    │   Context: ReSum in sub-agents
    │
    └── COMPLEX (open-ended analysis, many entities):
        → Multi-Agent (10+ agents, adaptive decomposition)
        Training: M-GRPO + HiPRAG process rewards
        Context: Sub-agent isolation + ReSum within sub-agents
        Budget: BATS for adaptive allocation

TRAINING BUDGET:
├── Abundant (can annotate data, train RRMs):
│   → Atom-Searcher (ATR + curriculum) → highest accuracy
│
├── Moderate (can run RL, but not RRM training):
│   → GRPO + HiPRAG (on-the-fly detection, no RRM needed)
│
└── Limited (no training budget):
    → Dr. Zero self-evolution (no labeled data needed)
    or use a pre-trained open-source agent (Tongyi, WebSeer)

DEPLOYMENT SCALE:
├── Research / prototype → Single server, no Redis, simple logging
├── Small production (< 100 QPS) → Redis + Postgres + Langfuse
└── Large production (100+ QPS) → Horizontal worker scaling + 
                                   dedicated model serving + 
                                   rate limiting stack
```

---

## 13. Key Implementation Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Single vs. multi-agent | Multi-agent for production | Parallelism, context isolation, specialization; 90%+ latency reduction |
| RL algorithm | GRPO with process rewards | Best accuracy/stability tradeoff, validated across model families |
| Context management | ReSum + sub-agent isolation | Unbounded effective horizon + parallel execution |
| Search strategy | Broad → narrow progressive | Validated by Anthropic at scale |
| Report generation | Dynamic outline (WebWeaver) | 93% citation accuracy, structured evidence linking |
| Budget control | BATS-style continuous signal | 31% cost reduction, proven at scale |
| Human-in-the-loop | Optional, ResearStudio pattern | Symmetrical control, no performance penalty in auto mode |
| Training data | Multi-agent distillation + self-evolution | Cost-effective, no human annotation needed |
| Model tiers | Nano/Flash/Pro/Ultra by role | 2–5× cost reduction; match capability to task requirements |
| Summary tool (ReSum) | Fine-tuned 30B+ model | Generic models fail at goal-oriented web-context summarization |
| Citation verification | Dedicated Citation Agent | Separate pass with specialized focus; prevents hallucinated citations |
| Over-search | HiPRAG process rewards | Reduces over-search from 27% → 2.3% |
| Training group size | G=16 for GRPO | Validated default; smaller → high variance, larger → slow iteration |
| Learning rate | 1e-6 | Conservative; use with strict on-policy training |

---

## 14. Current SOTA Performance Reference Points

As of early 2026:

| System | HLE | BrowseComp | GAIA | FRAMES | Citation Acc. |
|--------|-----|------------|------|--------|---------------|
| Tongyi DeepResearch (30B-A3B) | 32.9 | 43.4 | 70.9 | 90.6 | — |
| O-Researcher-RL (72B) | — | — | SOTA | — | — |
| WebSeer (14B) | — | — | — | 72.3 (HotpotQA) | — |
| WebWeaver | — | — | — | — | 93.37% |
| HiPRAG (7B) | — | — | 67.2 avg QA | — | — |
| OpenAI o3 | < Tongyi | < Tongyi | < Tongyi | < Tongyi | — |

The open-source frontier (Tongyi at 30B active params) now matches or exceeds proprietary systems on most benchmarks.

**Token usage reality check (Anthropic production data):**
- Chat: 1× baseline
- Single-agent with search: ~4× baseline
- Multi-agent research: ~15× baseline
- Implication: only use multi-agent when task value justifies the cost

---

## 15. Sources & References

### Production Systems
- Anthropic Research System: https://www.anthropic.com/engineering/multi-agent-research-system
- GPT Researcher: https://github.com/assafelovic/gpt-researcher
- DeerFlow (ByteDance): https://github.com/bytedance/deer-flow
- Enterprise Deep Research (Salesforce): https://github.com/SalesforceAIResearch/enterprise-deep-research
- ResearStudio: https://github.com/ResearAI/ResearStudio
- HiPRAG (code): https://github.com/qualidea1217/HiPRAG

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
- Budget-Aware Tool-Use (BATS): https://arxiv.org/abs/2511.17006
- GRPO is Secretly a PRM: https://arxiv.org/abs/2509.21154
- GTPO/GRPO-S (hyperparameters): https://arxiv.org/abs/2508.04349
- Search-P1 (path-centric rewards): https://arxiv.org/abs/2602.22576
- Jina DeepResearch: https://github.com/jina-ai/node-DeepResearch

### Production Deployment Resources
- What 1,200 Production Deployments Reveal About LLMOps (ZenML): https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025
- DeerFlow System Architecture (DeepWiki): https://deepwiki.com/bytedance/deer-flow/2-system-architecture

### Repository Index
- Awesome Deep Research: https://github.com/DavidZWZ/Awesome-Deep-Research
