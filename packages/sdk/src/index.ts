import type { ToolClient } from "@deep-research/types";
import { FusionEngine } from "@deep-research/fusion";
import {
  ResearchOrchestrator,
  type DepthConfig,
  type ToolOrchestratorEvent,
} from "@deep-research/orchestrator";
import { ManusClient, ManusTaskStore } from "@deep-research/tools-manus";
import { PerplexityClient } from "@deep-research/tools-perplexity";
import { TavilyClient } from "@deep-research/tools-tavily";
import { FirecrawlClient } from "@deep-research/tools-firecrawl";
import { BraveClient } from "@deep-research/tools-brave";

export {
  ResearchDepth,
  ResearchStatus,
  OutputFormat,
  ResearchQuerySchema,
  ResearchResultSchema,
  ToolResultSchema,
  CitationSchema,
  type ResearchQuery,
  type ResearchResult,
  type ToolResult,
  type ToolClient,
  type Citation,
} from "@deep-research/types";

export { FusionEngine, type FusionResult, type MergeOptions } from "@deep-research/fusion";

export {
  ResearchOrchestrator,
  runAgenticResearch,
  type DepthConfig,
  type ToolOrchestratorEvent,
  type RunAgenticOptions,
} from "@deep-research/orchestrator";

export { ManusClient, ManusTaskStore } from "@deep-research/tools-manus";
export { PerplexityClient } from "@deep-research/tools-perplexity";
export { TavilyClient } from "@deep-research/tools-tavily";
export { FirecrawlClient } from "@deep-research/tools-firecrawl";
export { BraveClient } from "@deep-research/tools-brave";

/** API keys and options shared by the reference HTTP app and library consumers. */
export interface DeepResearchApiKeys {
  manusApiKey: string;
  perplexityApiKey: string;
  tavilyApiKey: string;
  firecrawlApiKey: string;
  braveApiKey: string;
  anthropicApiKey?: string;
  /** Base URL where your app serves `POST /webhooks/manus` (trailing slash optional). */
  webhookBaseUrl: string;
}

export interface CreateResearchOrchestratorOptions {
  /** Shared store for Manus webhook delivery; reuse the same instance in your webhook route. */
  manusStore?: ManusTaskStore;
  fusion?: FusionEngine;
  onToolEvent?: (e: ToolOrchestratorEvent) => void;
  depthConfig?: DepthConfig;
}

export function createResearchTools(
  keys: DeepResearchApiKeys,
  manusStore: ManusTaskStore,
): Record<string, ToolClient> {
  const base = keys.webhookBaseUrl.replace(/\/$/, "");
  return {
    manus: new ManusClient(keys.manusApiKey, `${base}/webhooks/manus`, manusStore),
    perplexity: new PerplexityClient(keys.perplexityApiKey),
    tavily: new TavilyClient(keys.tavilyApiKey),
    firecrawl: new FirecrawlClient(keys.firecrawlApiKey),
    brave: new BraveClient(keys.braveApiKey),
  };
}

export function createResearchOrchestrator(
  keys: DeepResearchApiKeys,
  options?: CreateResearchOrchestratorOptions,
): ResearchOrchestrator {
  const store = options?.manusStore ?? new ManusTaskStore();
  const tools = createResearchTools(keys, store);
  const fusion = options?.fusion ?? new FusionEngine();
  return new ResearchOrchestrator(
    tools,
    fusion,
    options?.depthConfig,
    keys.anthropicApiKey,
    options?.onToolEvent,
  );
}
