import { createAnthropic } from "@ai-sdk/anthropic";
import type { ResearchQuery, ResearchResult, ToolResult } from "@deep-research/types";
import type { TavilyClient } from "@deep-research/tools-tavily";
import type { PerplexityClient } from "@deep-research/tools-perplexity";
import type { FirecrawlClient } from "@deep-research/tools-firecrawl";
import type { BraveClient } from "@deep-research/tools-brave";
import type { ExaClient } from "@deep-research/tools-exa";
import { planResearch } from "./planner.js";
import { researchSubTopic } from "./researcher.js";
import { synthesizeResearch } from "./synthesizer.js";
import { createAgentTools } from "./tools.js";

export { planResearch } from "./planner.js";
export { researchSubTopic } from "./researcher.js";
export { synthesizeResearch } from "./synthesizer.js";
export { createAgentTools } from "./tools.js";
export type { ResearchPlan } from "./planner.js";
export type { SubTopicResult } from "./researcher.js";
export type { SynthesisResult } from "./synthesizer.js";
export type { AgentToolClients } from "./tools.js";

export interface AgentConfig {
  anthropicApiKey: string;
  /** Model for the planning phase. Default: claude-haiku-4-5-20251001 (fast, cheap) */
  plannerModel?: string;
  /** Model for per-subtopic research loops. Default: claude-sonnet-4-6 */
  researchModel?: string;
  /** Model for final synthesis. Default: claude-sonnet-4-6 */
  synthModel?: string;
}

export interface AgentClients {
  tavily?: TavilyClient;
  perplexity?: PerplexityClient;
  firecrawl?: FirecrawlClient;
  brave?: BraveClient;
  exa?: ExaClient;
}

export type AgentProgressEvent =
  | { type: "planning"; query: string }
  | { type: "researching"; topic: string; index: number; total: number }
  | { type: "topic_complete"; topic: string; stepCount: number; citationsFound: number }
  | { type: "synthesizing"; subTopicsCount: number }
  | { type: "complete"; durationMs: number };

/**
 * Deep research agent powered by the Vercel AI SDK.
 *
 * Three-phase pipeline:
 *   1. Plan   — LLM decomposes the query into focused sub-topics
 *   2. Research — Sub-topics researched in parallel using agentic tool loops
 *   3. Synthesize — All findings merged by LLM into a structured Markdown report
 */
export class DeepResearchAgent {
  private readonly anthropic: ReturnType<typeof createAnthropic>;

  constructor(
    private readonly config: AgentConfig,
    private readonly clients: AgentClients,
    private readonly onProgress?: (event: AgentProgressEvent) => void,
  ) {
    this.anthropic = createAnthropic({
      apiKey: config.anthropicApiKey,
      baseURL: "https://api.anthropic.com/v1",
    });
  }

  private get plannerModel() {
    return this.anthropic(this.config.plannerModel ?? "claude-haiku-4-5");
  }

  private get researchModel() {
    return this.anthropic(this.config.researchModel ?? "claude-sonnet-4-6");
  }

  private get synthModel() {
    return this.anthropic(this.config.synthModel ?? "claude-sonnet-4-6");
  }

  async research(request: ResearchQuery, signal?: AbortSignal): Promise<ResearchResult> {
    const start = Date.now();
    const createdAt = new Date();

    try {
      // ── Phase 1: Plan ───────────────────────────────────────────────────────
      this.onProgress?.({ type: "planning", query: request.query });
      const plan = await planResearch(request.query, this.plannerModel, signal);

      // ── Phase 2: Parallel sub-topic research ───────────────────────────────
      const tools = createAgentTools(this.clients, signal);

      const subTopicResults = await Promise.all(
        plan.subTopics.map(async (topic, i) => {
          this.onProgress?.({
            type: "researching",
            topic,
            index: i,
            total: plan.subTopics.length,
          });
          const result = await researchSubTopic(
            topic,
            tools,
            this.researchModel,
            signal,
          );
          this.onProgress?.({
            type: "topic_complete",
            topic,
            stepCount: result.stepCount,
            citationsFound: result.citations.length,
          });
          return result;
        }),
      );

      // ── Phase 3: Synthesize ────────────────────────────────────────────────
      this.onProgress?.({ type: "synthesizing", subTopicsCount: plan.subTopics.length });
      const synthesis = await synthesizeResearch(
        request.query,
        subTopicResults,
        this.synthModel,
      );
      this.onProgress?.({ type: "complete", durationMs: Date.now() - start });

      const agentToolResult: ToolResult = {
        tool: "agent",
        rawOutput: synthesis.markdown,
        citations: synthesis.citations,
        latencyMs: Date.now() - start,
        success: true,
      };

      const successfulTopics = subTopicResults.filter((r) => r.citations.length > 0).length;
      const confidenceScore = Math.min(
        0.95,
        0.4 + (successfulTopics / Math.max(plan.subTopics.length, 1)) * 0.55,
      );

      return {
        query: request.query,
        depth: "agentic",
        status: "completed",
        summary: synthesis.markdown,
        sources: synthesis.citations,
        toolResults: [agentToolResult],
        confidenceScore,
        executiveSummary: synthesis.markdown,
        detailSections: [],
        references: synthesis.citations.map((c, i) => ({
          index: i + 1,
          url: c.url,
          title: c.title,
          snippet: c.snippet,
          sourceTool: c.sourceTool,
        })),
        createdAt,
        completedAt: new Date(),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        query: request.query,
        depth: "agentic",
        status: "failed",
        summary: `Agent research failed: ${message}`,
        sources: [],
        toolResults: [],
        confidenceScore: 0,
        executiveSummary: "",
        detailSections: [],
        references: [],
        createdAt,
      };
    }
  }
}
