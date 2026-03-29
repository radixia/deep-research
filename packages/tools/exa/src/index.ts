/**
 * Exa neural / semantic search API client.
 * @see https://docs.exa.ai/reference/search
 */

import type { ToolResult, Citation } from "@deep-research/types";

const EXA_SEARCH_URL = "https://api.exa.ai/search";

export interface ExaRunOptions {
  signal?: AbortSignal;
  /** Result count (maps to Exa `numResults`, max 100 for most search types). */
  numResults?: number;
  /** Alias for `numResults` (orchestrator passes this for parity with Tavily). */
  maxResults?: number;
  /** Exa search type; default `auto` blends neural and keyword search. */
  type?: "neural" | "fast" | "auto" | "deep" | "deep-reasoning" | "instant";
}

interface ExaResultItem {
  title?: string;
  url?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
}

interface ExaSearchResponse {
  results?: ExaResultItem[];
  requestId?: string;
}

function snippetFromItem(r: ExaResultItem): string {
  if (r.highlights?.length) return r.highlights.join(" ").trim();
  if (r.summary?.trim()) return r.summary.trim();
  if (r.text?.trim()) return r.text.trim().slice(0, 2000);
  return "";
}

export class ExaClient {
  constructor(private readonly apiKey: string) {}

  async run(query: string, options: ExaRunOptions = {}): Promise<ToolResult> {
    const { signal, type = "auto", numResults: n0, maxResults: m0 } = options;
    const numResults = Math.min(100, Math.max(1, n0 ?? m0 ?? 10));
    const start = Date.now();
    try {
      const res = await fetch(EXA_SEARCH_URL, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          type,
          numResults,
          contents: {
            highlights: { maxCharacters: 2000 },
          },
        }),
        signal: signal ?? AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Exa search error: ${res.status}${errText ? ` ${errText.slice(0, 200)}` : ""}`);
      }

      const data = (await res.json()) as ExaSearchResponse;
      const results = data.results ?? [];
      const citations: Citation[] = results
        .filter((r): r is ExaResultItem & { url: string } => Boolean(r.url?.trim()))
        .map((r) => ({
          url: r.url!,
          title: r.title ?? "",
          snippet: snippetFromItem(r),
          sourceTool: "exa" as const,
          fetchedAt: new Date(),
          credibilityScore: 0.72,
        }));

      return {
        tool: "exa",
        rawOutput: data,
        citations,
        latencyMs: Date.now() - start,
        success: true,
      };
    } catch (err) {
      return {
        tool: "exa",
        rawOutput: null,
        citations: [],
        latencyMs: Date.now() - start,
        success: false,
        error: String(err),
      };
    }
  }
}
