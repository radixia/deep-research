import type { ResearchQuery, ResearchResult, ToolClient, ToolResult } from "@deep-research/types";
import { FusionEngine } from "@deep-research/fusion";
import { decompose } from "./decompose.js";
import { decomposeWithLlm } from "./decompose-llm.js";

export interface DepthConfig {
  quick: string[];
  standard: { main: string[]; subQueries: string[] };
  deep: { main: string[]; subQueries: string[]; slow: string[] };
}

const DEFAULT_DEPTH_CONFIG: DepthConfig = {
  quick: ["perplexity", "tavily", "brave"],
  standard: { main: ["perplexity", "firecrawl", "brave"], subQueries: ["tavily"] },
  deep: { main: ["perplexity", "firecrawl", "brave"], subQueries: ["tavily"], slow: ["manus"] },
};

/** Emitted before each tool.run and after it resolves (for observability). */
export type ToolOrchestratorEvent =
  | {
      phase: "invoke";
      tool: string;
      queryPreview: string;
      opts?: { maxResults?: number; count?: number; searchLang?: string };
    }
  | {
      phase: "response";
      tool: string;
      queryPreview: string;
      success: boolean;
      latencyMs: number;
      citationsCount: number;
      error?: string;
      /** First chars of textual rawOutput when present (never full API dumps). */
      outputPreview?: string;
    };

function summarizeToolResponse(result: ToolResult): { outputPreview?: string } {
  const raw = result.rawOutput;
  if (raw == null) return {};
  if (typeof raw === "string") {
    const t = raw.trim();
    return { outputPreview: t.length > 600 ? `${t.slice(0, 600)}…` : t };
  }
  try {
    const s = JSON.stringify(raw);
    return { outputPreview: s.length > 600 ? `${s.slice(0, 600)}…` : s };
  } catch {
    return { outputPreview: "[unserializable]" };
  }
}

export class ResearchOrchestrator {
  private readonly depthConfig: DepthConfig;

  constructor(
    private readonly tools: Record<string, ToolClient>,
    private readonly fusion: FusionEngine,
    depthConfig?: DepthConfig,
    private readonly anthropicApiKey?: string,
    private readonly onToolEvent?: (e: ToolOrchestratorEvent) => void,
  ) {
    this.depthConfig = depthConfig ?? DEFAULT_DEPTH_CONFIG;
  }

  private async getSubQueries(query: string, signal?: AbortSignal): Promise<string[]> {
    if (this.anthropicApiKey) {
      return decomposeWithLlm(query, this.anthropicApiKey, 4, signal);
    }
    return Promise.resolve(decompose(query));
  }

  async research(request: ResearchQuery, signal?: AbortSignal): Promise<ResearchResult> {
    const createdAt = new Date();
    try {
      const toolResults =
        request.depth === "quick"
          ? await this.runQuick(request, signal)
          : request.depth === "standard"
            ? await this.runStandard(request, signal)
            : await this.runDeep(request, signal);

      const merged = this.fusion.merge(request.query, toolResults, {
        outputFormat: request.outputFormat,
        maxSources: request.maxSources,
      });

      return {
        query: request.query,
        depth: request.depth,
        status: "completed",
        summary: merged.summary,
        sources: merged.sources,
        toolResults,
        confidenceScore: merged.confidenceScore,
        createdAt,
        completedAt: new Date(),
      };
    } catch {
      return {
        query: request.query,
        depth: request.depth,
        status: "failed",
        summary: "Research failed. Please try again.",
        sources: [],
        toolResults: [],
        confidenceScore: 0,
        createdAt,
      };
    }
  }

  private runTool(
    name: string,
    query: string,
    opts?: { maxResults?: number; count?: number; searchLang?: string },
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    const queryPreview = query.length > 200 ? `${query.slice(0, 200)}…` : query;
    const optsSummary =
      opts && (opts.maxResults != null || opts.count != null || opts.searchLang != null)
        ? {
            ...(opts.maxResults != null && { maxResults: opts.maxResults }),
            ...(opts.count != null && { count: opts.count }),
            ...(opts.searchLang != null && { searchLang: opts.searchLang }),
          }
        : undefined;

    this.onToolEvent?.({
      phase: "invoke",
      tool: name,
      queryPreview,
      ...(optsSummary && Object.keys(optsSummary).length > 0 ? { opts: optsSummary } : {}),
    });

    const tool = this.tools[name];
    if (!tool) {
      const missing: ToolResult = {
        tool: name,
        success: false,
        citations: [],
        rawOutput: null,
        latencyMs: 0,
        error: `Unknown tool: ${name}`,
      };
      this.onToolEvent?.({
        phase: "response",
        tool: name,
        queryPreview,
        success: false,
        latencyMs: 0,
        citationsCount: 0,
        ...(missing.error ? { error: missing.error } : {}),
      });
      return Promise.resolve(missing);
    }

    return tool.run(query, { ...opts, ...(signal !== undefined && { signal }) }).then((result) => {
      const { outputPreview } = summarizeToolResponse(result);
      this.onToolEvent?.({
        phase: "response",
        tool: name,
        queryPreview,
        success: result.success,
        latencyMs: result.latencyMs,
        citationsCount: result.citations.length,
        ...(result.error && { error: result.error.slice(0, 2000) }),
        ...(outputPreview && { outputPreview }),
      });
      return result;
    });
  }

  private async runQuick(request: ResearchQuery, signal?: AbortSignal): Promise<ToolResult[]> {
    const { query, language } = request;
    return Promise.all([
      this.runTool("perplexity", query, undefined, signal),
      this.runTool("tavily", query, { maxResults: 5 }, signal),
      this.runTool("brave", query, { count: 5, searchLang: language }, signal),
    ]);
  }

  private async runStandard(request: ResearchQuery, signal?: AbortSignal): Promise<ToolResult[]> {
    const { standard } = this.depthConfig;
    const { query, language } = request;
    const subQueries = await this.getSubQueries(query, signal);
    const mainResults = await Promise.all(
      standard.main.map((name) =>
        this.runTool(name, query, name === "brave" ? { searchLang: language } : undefined, signal),
      ),
    );
    const subResults = await Promise.all(
      subQueries.flatMap((q) =>
        standard.subQueries.map((name) => this.runTool(name, q, undefined, signal)),
      ),
    );
    return [...mainResults, ...subResults];
  }

  private async runDeep(request: ResearchQuery, signal?: AbortSignal): Promise<ToolResult[]> {
    const { deep } = this.depthConfig;
    const { query, language } = request;
    const subQueries = await this.getSubQueries(query, signal);
    const slowPromise = Promise.all(
      deep.slow.map((name) => this.runTool(name, query, undefined, signal)),
    );
    const mainResults = await Promise.all(
      deep.main.map((name) =>
        this.runTool(name, query, name === "brave" ? { searchLang: language } : undefined, signal),
      ),
    );
    const subResults = await Promise.all(
      subQueries.flatMap((q) =>
        deep.subQueries.map((name) => this.runTool(name, q, undefined, signal)),
      ),
    );
    const slow = await slowPromise;
    return [...mainResults, ...subResults, ...slow];
  }
}

export { decompose } from "./decompose.js";
