import type { ResearchQuery, ResearchResult, ToolResult } from "@deep-research/types";
import { ManusClient } from "@deep-research/tools-manus";
import { PerplexityClient } from "@deep-research/tools-perplexity";
import { TavilyClient } from "@deep-research/tools-tavily";
import { FirecrawlClient } from "@deep-research/tools-firecrawl";
import { FusionEngine } from "@deep-research/fusion";

export class ResearchOrchestrator {
  constructor(
    private readonly manus: ManusClient,
    private readonly perplexity: PerplexityClient,
    private readonly tavily: TavilyClient,
    private readonly firecrawl: FirecrawlClient,
    private readonly fusion: FusionEngine,
  ) {}

  async research(request: ResearchQuery): Promise<ResearchResult> {
    const createdAt = new Date();
    try {
      const toolResults =
        request.depth === "quick"
          ? await this.runQuick(request.query)
          : request.depth === "standard"
            ? await this.runStandard(request.query)
            : await this.runDeep(request.query);

      const merged = this.fusion.merge(request.query, toolResults);

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
    } catch (err) {
      return {
        query: request.query,
        depth: request.depth,
        status: "failed",
        summary: `Research failed: ${String(err)}`,
        sources: [],
        toolResults: [],
        confidenceScore: 0,
        createdAt,
      };
    }
  }

  private async runQuick(query: string): Promise<ToolResult[]> {
    return Promise.all([
      this.perplexity.run(query),
      this.tavily.run(query, { maxResults: 5 }),
    ]);
  }

  private async runStandard(query: string): Promise<ToolResult[]> {
    const subQueries = decompose(query);
    const results = await Promise.all([
      this.perplexity.run(query),
      ...subQueries.map((q) => this.tavily.run(q)),
      this.firecrawl.run(query),
    ]);
    return results;
  }

  private async runDeep(query: string): Promise<ToolResult[]> {
    const subQueries = decompose(query);

    // Launch Manus as slow background task
    const manusPromise = this.manus.run(query);

    // Run fast tools in parallel
    const fastResults = await Promise.all([
      this.perplexity.run(query),
      ...subQueries.map((q) => this.tavily.run(q)),
      this.firecrawl.run(query),
    ]);

    const manusResult = await manusPromise;
    return [...fastResults, manusResult];
  }
}

function decompose(query: string, max = 4): string[] {
  return [
    query,
    `${query} latest news 2026`,
    `${query} comparison analysis`,
    `${query} best practices`,
  ].slice(0, max);
}

export { ManusClient, PerplexityClient, TavilyClient, FirecrawlClient, FusionEngine };
