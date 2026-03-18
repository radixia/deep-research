/**
 * Firecrawl Agent client.
 * The "extractor" — schema-first structured data extraction.
 * Researches autonomously without predefined URLs.
 */

import type { ToolResult, Citation } from "@deep-research/types";

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev";

export class FirecrawlClient {
  private readonly headers: Record<string, string>;

  constructor(private readonly apiKey: string) {
    this.headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };
  }

  async run(query: string, options?: { schema?: Record<string, unknown>; signal?: AbortSignal }): Promise<ToolResult> {
    const { schema, signal } = options ?? {};
    const start = Date.now();
    try {
      const endpoint = schema
        ? `${FIRECRAWL_BASE_URL}/v1/extract`
        : `${FIRECRAWL_BASE_URL}/v1/search`;

      const body = schema
        ? { prompt: query, schema }
        : { query, scrapeOptions: { formats: ["markdown"] } };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
        signal: signal ?? AbortSignal.timeout(60_000),
      });

      if (!res.ok) throw new Error(`Firecrawl error: ${res.status}`);

      const data = (await res.json()) as {
        data?: Array<{ url?: string; title?: string; markdown?: string }>;
        success?: boolean;
      };

      const citations: Citation[] = (data.data ?? [])
        .filter((item) => item.url)
        .map((item) => ({
          url: item.url!,
          title: item.title ?? "",
          snippet: (() => {
          const md = item.markdown ?? "";
          return md.length > 500 ? `${md.slice(0, 500)}…` : md;
        })(),
          sourceTool: "firecrawl" as const,
          fetchedAt: new Date(),
          credibilityScore: 0.5,
        }));

      return { tool: "firecrawl", rawOutput: data, citations, latencyMs: Date.now() - start, success: true };
    } catch (err) {
      return { tool: "firecrawl", rawOutput: null, citations: [], latencyMs: Date.now() - start, success: false, error: String(err) };
    }
  }

  async scrapeUrl(url: string, options?: { signal?: AbortSignal }): Promise<ToolResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${FIRECRAWL_BASE_URL}/v1/scrape`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ url, formats: ["markdown"] }),
        signal: options?.signal ?? AbortSignal.timeout(30_000),
      });

      if (!res.ok) throw new Error(`Firecrawl scrape error: ${res.status}`);

      const data = (await res.json()) as {
        data?: { metadata?: { title?: string }; markdown?: string };
      };

      return {
        tool: "firecrawl",
        rawOutput: data,
        citations: [{
          url,
          title: data.data?.metadata?.title ?? "",
          snippet: (data.data?.markdown ?? "").slice(0, 500),
          sourceTool: "firecrawl",
          fetchedAt: new Date(),
          credibilityScore: 0.5,
        }],
        latencyMs: Date.now() - start,
        success: true,
      };
    } catch (err) {
      return { tool: "firecrawl", rawOutput: null, citations: [], latencyMs: Date.now() - start, success: false, error: String(err) };
    }
  }
}
