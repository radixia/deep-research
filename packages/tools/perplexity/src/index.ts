/**
 * Perplexity Sonar client.
 * The "synthesizer" — real-time web-grounded answers with inline citations.
 */

import type { ToolResult, Citation } from "@deep-research/types";

const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";

export class PerplexityClient {
  constructor(
    private readonly apiKey: string,
    private readonly model = "sonar-deep-research",
  ) {}

  async run(query: string): Promise<ToolResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${PERPLEXITY_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: "system",
              content: "You are a research assistant. Provide a comprehensive, well-structured answer with citations.",
            },
            { role: "user", content: query },
          ],
          return_citations: true,
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) throw new Error(`Perplexity error: ${res.status}`);

      const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
        citations?: Array<string | { url: string; title?: string; snippet?: string }>;
      };

      const content = data.choices[0]?.message.content ?? "";
      const citations: Citation[] = (data.citations ?? []).map((c) => ({
        url: typeof c === "string" ? c : (c.url ?? ""),
        title: typeof c === "string" ? "" : (c.title ?? ""),
        snippet: typeof c === "string" ? "" : (c.snippet ?? ""),
        sourceTool: "perplexity" as const,
        fetchedAt: new Date(),
        credibilityScore: 0.5,
      }));

      return { tool: "perplexity", rawOutput: content, citations, latencyMs: Date.now() - start, success: true };
    } catch (err) {
      return { tool: "perplexity", rawOutput: null, citations: [], latencyMs: Date.now() - start, success: false, error: String(err) };
    }
  }
}
