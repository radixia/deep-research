import { Agent, FunctionTool } from "@strands-agents/sdk";
import { AnthropicModel } from "@strands-agents/sdk/models/anthropic";
import type { ResearchQuery, ResearchResult, ToolClient, ToolResult } from "@deep-research/types";
import type { FusionEngine } from "@deep-research/fusion";

const TOOL_RESULTS_KEY = "toolResults";

/** Serialize ToolResult for StateStore (dates to ISO strings). */
function serializeToolResult(r: ToolResult): Record<string, unknown> {
  return {
    tool: r.tool,
    rawOutput: r.rawOutput,
    citations: (r.citations ?? []).map((c) => ({
      ...c,
      fetchedAt: c.fetchedAt instanceof Date ? c.fetchedAt.toISOString() : c.fetchedAt,
    })),
    latencyMs: r.latencyMs,
    success: r.success,
    error: r.error,
  };
}

/** Deserialize stored shape back to ToolResult (ISO strings to Date). */
function deserializeToolResult(stored: Record<string, unknown>): ToolResult {
  const citations = Array.isArray(stored.citations)
    ? (stored.citations as Record<string, unknown>[]).map((c) => ({
        url: c.url as string,
        title: c.title as string,
        snippet: c.snippet as string,
        sourceTool: c.sourceTool as ToolResult["citations"][0]["sourceTool"],
        fetchedAt: new Date((c.fetchedAt as string) ?? Date.now()),
        credibilityScore: Number(c.credibilityScore) || 0.5,
      }))
    : [];
  return {
    tool: stored.tool as string,
    rawOutput: stored.rawOutput ?? null,
    citations,
    latencyMs: Number(stored.latencyMs) || 0,
    success: Boolean(stored.success),
    error: stored.error as string | undefined,
  };
}

/** Anthropic requires input_schema to have type: "object" at the root. */
const QUERY_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    query: { type: "string" as const, description: "Search or research query" },
  },
  required: ["query"],
  additionalProperties: false,
};

function createStrandsTools(
  clients: Record<string, ToolClient>,
  signal?: AbortSignal
): FunctionTool[] {
  const toolNames = ["perplexity", "tavily", "firecrawl", "brave", "exa", "manus"] as const;
  return toolNames
    .filter((name) => clients[name])
    .map(
      (name) =>
        new FunctionTool({
          name,
          description: `Run a ${name} search or lookup. Use this to gather information for research.`,
          inputSchema: QUERY_INPUT_SCHEMA,
          callback: async (input: unknown, context) => {
            const query = typeof (input as { query?: string }).query === "string" ? (input as { query: string }).query : "";
            const client = clients[name]!;
            const result = await client.run(query, signal !== undefined ? { signal } : {});
            const list = (context?.agent.appState.get(TOOL_RESULTS_KEY) as Record<string, unknown>[]) ?? [];
            list.push(serializeToolResult(result));
            context?.agent.appState.set(TOOL_RESULTS_KEY, list);
            const summary = result.success
              ? `Found ${result.citations?.length ?? 0} citations in ${result.latencyMs}ms.`
              : `Error: ${result.error ?? "unknown"}`;
            return { summary, citationsCount: result.citations?.length ?? 0, success: result.success };
          },
        })
    );
}

const SYSTEM_PROMPT = `You are a research assistant. Your job is to answer the user's question by using the available search and lookup tools (perplexity, tavily, firecrawl, brave, exa, manus). Call one or more tools as needed to gather information, then synthesize a clear, well-sourced answer. Prefer multiple tools when the question benefits from different perspectives. After gathering enough information, provide a final answer in markdown.`;

export interface RunAgenticOptions {
  anthropicApiKey: string;
  tools: Record<string, ToolClient>;
  fusion: FusionEngine;
  signal?: AbortSignal;
  onToolEvent?: (evt: { tool: string; phase: "invoke" | "response"; queryPreview: string; success?: boolean; latencyMs?: number; citationsCount?: number }) => void;
}

export async function runAgenticResearch(
  request: ResearchQuery,
  options: RunAgenticOptions
): Promise<ResearchResult> {
  const { anthropicApiKey, tools, fusion, signal, onToolEvent } = options;
  const createdAt = new Date();

  const strandsTools = createStrandsTools(tools, signal);

  const model = new AnthropicModel({
    apiKey: anthropicApiKey,
    maxTokens: 4096,
  });

  const agent = new Agent({
    model,
    tools: strandsTools,
    systemPrompt: SYSTEM_PROMPT,
    appState: { [TOOL_RESULTS_KEY]: [] },
    printer: false,
  });

  if (onToolEvent) {
    const { BeforeToolCallEvent, AfterToolCallEvent } = await import("@strands-agents/sdk");
    agent.addHook(BeforeToolCallEvent, (evt) => {
      const use = (evt as { toolUse?: { name?: string; input?: { query?: string } } }).toolUse;
      onToolEvent({
        tool: use?.name ?? "unknown",
        phase: "invoke",
        queryPreview: (use?.input as { query?: string })?.query?.slice(0, 200) ?? "",
      });
    });
    agent.addHook(AfterToolCallEvent, (evt) => {
      const e = evt as { toolUse?: { name?: string }; result?: { summary?: string; success?: boolean; citationsCount?: number }; durationMs?: number };
      onToolEvent({
        tool: e.toolUse?.name ?? "unknown",
        phase: "response",
        queryPreview: "",
        success: e.result?.success ?? false,
        latencyMs: e.durationMs ?? 0,
        citationsCount: e.result?.citationsCount ?? 0,
      });
    });
  }

  const result = await agent.invoke(request.query);
  const stored = (agent.appState.get(TOOL_RESULTS_KEY) as Record<string, unknown>[] | undefined) ?? [];
  const toolResults: ToolResult[] = stored.map(deserializeToolResult);

  const merged = fusion.merge(request.query, toolResults, {
    outputFormat: request.outputFormat,
    maxSources: request.maxSources,
  });

  const summary = result.toString()?.trim() || merged.summary;

  return {
    query: request.query,
    depth: "agentic",
    status: "completed",
    summary,
    sources: merged.sources,
    toolResults,
    confidenceScore: merged.confidenceScore,
    createdAt,
    completedAt: new Date(),
  };
}
