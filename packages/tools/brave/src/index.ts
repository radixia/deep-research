/**
 * Brave Search Web API client.
 * Privacy-first web search with independent index.
 */

import type { ToolResult, Citation } from "@deep-research/types";

const BRAVE_WEB_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

interface BraveWebResult {
  title?: string;
  url?: string;
  description?: string;
  age?: string;
}

interface BraveWebResponse {
  web?: { results?: BraveWebResult[] };
}

export class BraveClient {
  constructor(private readonly apiKey: string) {}

  async run(
    query: string,
    options: { count?: number; signal?: AbortSignal; searchLang?: string } = {},
  ): Promise<ToolResult> {
    const { count = 10, signal, searchLang } = options;
    const start = Date.now();
    try {
      const url = new URL(BRAVE_WEB_SEARCH_URL);
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(Math.min(20, Math.max(1, count))));
      if (searchLang) url.searchParams.set("search_lang", searchLang);

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          "X-Subscription-Token": this.apiKey,
        },
        signal: signal ?? AbortSignal.timeout(30_000),
      });

      if (!res.ok) throw new Error(`Brave Search error: ${res.status}`);

      const data = (await res.json()) as BraveWebResponse;
      const results = data.web?.results ?? [];
      const citations: Citation[] = results
        .filter((r): r is BraveWebResult & { url: string } => Boolean(r.url?.trim()))
        .map((r) => ({
          url: r.url!,
          title: r.title ?? "",
          snippet: r.description ?? "",
          sourceTool: "brave" as const,
          fetchedAt: new Date(),
          credibilityScore: 0.6,
        }));

      return {
        tool: "brave",
        rawOutput: data,
        citations,
        latencyMs: Date.now() - start,
        success: true,
      };
    } catch (err) {
      return {
        tool: "brave",
        rawOutput: null,
        citations: [],
        latencyMs: Date.now() - start,
        success: false,
        error: String(err),
      };
    }
  }

  async runMulti(queries: string[], options = {}): Promise<ToolResult[]> {
    return Promise.all(queries.map((q) => this.run(q, options)));
  }
}
