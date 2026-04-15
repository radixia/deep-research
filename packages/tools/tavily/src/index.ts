/**
 * Tavily Search client.
 * The "grounder" — fast AI-optimized search with LLM-ready snippets.
 */

import type { ToolResult, Citation } from "@deep-research/types";

const TAVILY_BASE_URL = "https://api.tavily.com";

interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score: number;
  raw_content?: string;
}

export class TavilyClient {
  constructor(private readonly apiKey: string) {}

  async run(
    query: string,
    options: {
      maxResults?: number;
      searchDepth?: "basic" | "advanced";
      includeRawContent?: boolean;
      signal?: AbortSignal;
      allowedDomains?: string[];
    } = {},
  ): Promise<ToolResult> {
    const { maxResults = 10, searchDepth = "advanced", includeRawContent = true, signal, allowedDomains } = options;
    const start = Date.now();
    try {
      const body: Record<string, unknown> = {
        query,
        search_depth: searchDepth,
        max_results: maxResults,
        include_raw_content: includeRawContent,
      };
      if (allowedDomains && allowedDomains.length > 0) {
        body.include_domains = allowedDomains;
      }

      const res = await fetch(`${TAVILY_BASE_URL}/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(30_000),
      });

      if (!res.ok) throw new Error(`Tavily error: ${res.status}`);

      const data = (await res.json()) as { results: TavilyResult[] };
      const citations: Citation[] = data.results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.content.length > 500 ? `${r.content.slice(0, 500)}…` : r.content,
        sourceTool: "tavily" as const,
        fetchedAt: new Date(),
        credibilityScore: Math.min(1, r.score ?? 0.5),
      }));

      return { tool: "tavily", rawOutput: data, citations, latencyMs: Date.now() - start, success: true };
    } catch (err) {
      return { tool: "tavily", rawOutput: null, citations: [], latencyMs: Date.now() - start, success: false, error: String(err) };
    }
  }

  async runMulti(queries: string[], options = {}): Promise<ToolResult[]> {
    return Promise.all(queries.map((q) => this.run(q, options)));
  }
}
