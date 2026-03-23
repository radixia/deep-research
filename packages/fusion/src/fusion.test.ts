import { describe, it, expect } from "vitest";
import { FusionEngine } from "./index.js";
import type { Citation, ToolResult } from "@deep-research/types";

const baseCitation = (
  overrides: Partial<Citation> & { url: string; sourceTool: Citation["sourceTool"] }
): Citation => ({
  url: overrides.url,
  title: overrides.title ?? "",
  snippet: overrides.snippet ?? "",
  sourceTool: overrides.sourceTool,
  fetchedAt: new Date(),
  credibilityScore: overrides.credibilityScore ?? 0.5,
});

describe("FusionEngine", () => {
  const engine = new FusionEngine();

  it("deduplicates by URL and keeps higher credibility", () => {
    const results: ToolResult[] = [
      {
        tool: "tavily",
        success: true,
        citations: [
          baseCitation({ url: "https://a.com", sourceTool: "tavily", credibilityScore: 0.5 }),
        ],
        rawOutput: null,
        latencyMs: 0,
      },
      {
        tool: "brave",
        success: true,
        citations: [
          baseCitation({ url: "https://a.com", sourceTool: "brave", credibilityScore: 0.8 }),
        ],
        rawOutput: null,
        latencyMs: 0,
      },
    ];
    const out = engine.merge("q", results);
    expect(out.sources).toHaveLength(1);
    expect(out.sources[0]!.url).toBe("https://a.com");
    expect(out.sources[0]!.credibilityScore).toBeGreaterThan(0.5);
  });

  it("ranks sources by credibility", () => {
    const results: ToolResult[] = [
      {
        tool: "tavily",
        success: true,
        citations: [
          baseCitation({ url: "https://low.com", sourceTool: "tavily", credibilityScore: 0.3 }),
        ],
        rawOutput: null,
        latencyMs: 0,
      },
      {
        tool: "perplexity",
        success: true,
        citations: [
          baseCitation({
            url: "https://high.com",
            sourceTool: "perplexity",
            credibilityScore: 0.9,
          }),
        ],
        rawOutput: null,
        latencyMs: 0,
      },
    ];
    const out = engine.merge("q", results);
    expect(out.sources[0]!.url).toBe("https://high.com");
    expect(out.sources[1]!.url).toBe("https://low.com");
  });

  it("builds summary from highest-priority tool with text output", () => {
    const results: ToolResult[] = [
      {
        tool: "tavily",
        success: true,
        citations: [],
        rawOutput: null,
        latencyMs: 0,
      },
      {
        tool: "perplexity",
        success: true,
        citations: [],
        rawOutput: "Synthesized answer here.",
        latencyMs: 0,
      },
    ];
    const out = engine.merge("test query", results);
    expect(out.summary).toContain("test query");
    expect(out.summary).toContain("Primary source: perplexity");
    expect(out.summary).toContain("Synthesized answer here.");
  });

  it("returns no synthesis when all tools fail", () => {
    const results: ToolResult[] = [
      { tool: "tavily", success: false, citations: [], rawOutput: null, latencyMs: 0 },
      { tool: "perplexity", success: false, citations: [], rawOutput: null, latencyMs: 0 },
    ];
    const out = engine.merge("q", results);
    expect(out.summary).toContain("No synthesis available");
    expect(out.sources).toHaveLength(0);
  });

  it("respects maxSources option", () => {
    const results: ToolResult[] = [
      {
        tool: "tavily",
        success: true,
        citations: [
          baseCitation({ url: "https://a.com", sourceTool: "tavily" }),
          baseCitation({ url: "https://b.com", sourceTool: "tavily" }),
          baseCitation({ url: "https://c.com", sourceTool: "tavily" }),
        ],
        rawOutput: null,
        latencyMs: 0,
      },
    ];
    const out = engine.merge("q", results, { maxSources: 2 });
    expect(out.sources).toHaveLength(2);
  });

  it("formats summary as citations_list when requested", () => {
    const results: ToolResult[] = [
      {
        tool: "tavily",
        success: true,
        citations: [
          baseCitation({
            url: "https://example.com",
            title: "Example",
            snippet: "Some snippet text",
            sourceTool: "tavily",
          }),
        ],
        rawOutput: null,
        latencyMs: 0,
      },
    ];
    const out = engine.merge("q", results, { outputFormat: "citations_list" });
    expect(out.summary).toContain("### Sources");
    expect(out.summary).toContain("Example");
    expect(out.summary).toContain("https://example.com");
  });

  it("computes confidence from success rate and coverage", () => {
    const results: ToolResult[] = [
      {
        tool: "perplexity",
        success: true,
        citations: [
          baseCitation({ url: "https://x.com", sourceTool: "perplexity", credibilityScore: 0.7 }),
        ],
        rawOutput: "text",
        latencyMs: 0,
      },
      { tool: "tavily", success: false, citations: [], rawOutput: null, latencyMs: 0 },
    ];
    const out = engine.merge("q", results);
    expect(out.confidenceScore).toBeGreaterThan(0);
    expect(out.confidenceScore).toBeLessThanOrEqual(1);
  });
});
