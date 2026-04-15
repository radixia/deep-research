import { describe, it, expect } from "vitest";
import { FusionEngine } from "./index.js";
import type { Citation, ToolResult } from "@deep-research/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function citation(
  overrides: Partial<Citation> & { url: string; sourceTool: Citation["sourceTool"] },
): Citation {
  return {
    url: overrides.url,
    title: overrides.title ?? "",
    snippet: overrides.snippet ?? "",
    sourceTool: overrides.sourceTool,
    fetchedAt: new Date(),
    credibilityScore: overrides.credibilityScore ?? 0.5,
  };
}

function toolResult(
  tool: string,
  citations: Citation[],
  rawOutput: string | null = null,
): ToolResult {
  return { tool, rawOutput, citations, latencyMs: 100, success: true };
}

function failedResult(tool: string): ToolResult {
  return {
    tool,
    rawOutput: null,
    citations: [],
    latencyMs: 50,
    success: false,
    error: `${tool} failed`,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("FusionEngine — integration", () => {
  const engine = new FusionEngine();

  describe("reference numbering", () => {
    it("assigns sequential 1-based indices to deduplicated sources", () => {
      const results: ToolResult[] = [
        toolResult("tavily", [
          citation({ url: "https://a.com", sourceTool: "tavily", title: "A" }),
          citation({ url: "https://b.com", sourceTool: "tavily", title: "B" }),
        ]),
        toolResult("brave", [
          citation({ url: "https://a.com", sourceTool: "brave", title: "A dup" }),
          citation({ url: "https://c.com", sourceTool: "brave", title: "C" }),
        ]),
      ];
      const merged = engine.merge("test", results);

      // After dedup: a.com, b.com, c.com → 3 unique references
      expect(merged.references.length).toBe(3);
      expect(merged.references[0]!.index).toBe(1);
      expect(merged.references[1]!.index).toBe(2);
      expect(merged.references[2]!.index).toBe(3);
    });

    it("keeps references sorted by credibility (highest first)", () => {
      const results: ToolResult[] = [
        toolResult("tavily", [
          citation({
            url: "https://low.com",
            sourceTool: "tavily",
            credibilityScore: 0.2,
            title: "Low",
          }),
        ]),
        toolResult("perplexity", [
          citation({
            url: "https://high.com",
            sourceTool: "perplexity",
            credibilityScore: 0.9,
            title: "High",
          }),
        ]),
      ];
      const merged = engine.merge("q", results);
      expect(merged.references[0]!.url).toBe("https://high.com");
      expect(merged.references[1]!.url).toBe("https://low.com");
    });
  });

  describe("domain filtering in merge", () => {
    it("excludes citations from non-allowed domains", () => {
      const results: ToolResult[] = [
        toolResult("tavily", [
          citation({ url: "https://allowed.com/page", sourceTool: "tavily", title: "OK" }),
          citation({ url: "https://blocked.com/page", sourceTool: "tavily", title: "Blocked" }),
          citation({ url: "https://sub.allowed.com/x", sourceTool: "tavily", title: "SubOK" }),
        ]),
      ];
      const merged = engine.merge("q", results, { allowedDomains: ["allowed.com"] });

      expect(merged.sources.length).toBe(2);
      expect(merged.sources.map((s) => s.url)).toContain("https://allowed.com/page");
      expect(merged.sources.map((s) => s.url)).toContain("https://sub.allowed.com/x");
      expect(merged.sources.map((s) => s.url)).not.toContain("https://blocked.com/page");
    });

    it("returns all citations when allowedDomains is empty", () => {
      const results: ToolResult[] = [
        toolResult("tavily", [
          citation({ url: "https://a.com", sourceTool: "tavily" }),
          citation({ url: "https://b.com", sourceTool: "tavily" }),
        ]),
      ];
      const merged = engine.merge("q", results, { allowedDomains: [] });
      expect(merged.sources.length).toBe(2);
    });

    it("references list matches domain-filtered sources", () => {
      const results: ToolResult[] = [
        toolResult("tavily", [
          citation({ url: "https://keep.org/a", sourceTool: "tavily", title: "Keep" }),
          citation({ url: "https://drop.net/b", sourceTool: "tavily", title: "Drop" }),
        ]),
      ];
      const merged = engine.merge("q", results, { allowedDomains: ["keep.org"] });
      expect(merged.references.length).toBe(1);
      expect(merged.references[0]!.url).toBe("https://keep.org/a");
    });
  });

  describe("executive summary with references", () => {
    it("includes [N] reference markers when primary tool has markdown links", () => {
      const results: ToolResult[] = [
        toolResult(
          "perplexity",
          [citation({ url: "https://example.com", sourceTool: "perplexity", title: "Ex" })],
          "According to [Example](https://example.com), things are great.",
        ),
      ];
      const merged = engine.merge("test query", results);

      expect(merged.executiveSummary).toContain("[1]");
      expect(merged.executiveSummary).toContain("test query");
    });

    it("builds snippet-based summary when no primary text is available", () => {
      const results: ToolResult[] = [
        toolResult("tavily", [
          citation({
            url: "https://a.com",
            sourceTool: "tavily",
            snippet: "Some finding",
            title: "A",
          }),
        ]),
      ];
      const merged = engine.merge("q", results);

      expect(merged.executiveSummary).toContain("Some finding");
      expect(merged.executiveSummary).toContain("[1]");
    });

    it("returns empty executive summary when no tools succeed", () => {
      const results: ToolResult[] = [failedResult("tavily"), failedResult("brave")];
      const merged = engine.merge("q", results);
      expect(merged.executiveSummary).toBe("");
    });
  });

  describe("detail sections", () => {
    it("creates one section per successful tool", () => {
      const results: ToolResult[] = [
        toolResult(
          "perplexity",
          [citation({ url: "https://p.com", sourceTool: "perplexity" })],
          "Perplexity says...",
        ),
        toolResult(
          "tavily",
          [
            citation({
              url: "https://t.com",
              sourceTool: "tavily",
              snippet: "Tavily snippet",
            }),
          ],
        ),
        failedResult("brave"),
      ];
      const merged = engine.merge("q", results);

      // Only successful tools get sections
      expect(merged.detailSections.length).toBe(2);
      expect(merged.detailSections.map((s) => s.tool)).toEqual(["perplexity", "tavily"]);
    });

    it("extracts chunks from citations", () => {
      const results: ToolResult[] = [
        toolResult("tavily", [
          citation({
            url: "https://a.com",
            sourceTool: "tavily",
            snippet: "Chunk text",
            title: "Title A",
          }),
          citation({
            url: "https://b.com",
            sourceTool: "tavily",
            snippet: "Another chunk",
            title: "Title B",
          }),
        ]),
      ];
      const merged = engine.merge("q", results);

      expect(merged.detailSections.length).toBe(1);
      expect(merged.detailSections[0]!.chunks.length).toBe(2);
      expect(merged.detailSections[0]!.chunks[0]!.text).toBe("Chunk text");
      expect(merged.detailSections[0]!.chunks[0]!.sourceUrl).toBe("https://a.com");
      expect(merged.detailSections[0]!.chunks[0]!.sourceTitle).toBe("Title A");
    });

    it("includes raw output as section content", () => {
      const results: ToolResult[] = [
        toolResult("perplexity", [], "This is the raw analysis from Perplexity."),
      ];
      const merged = engine.merge("q", results);
      expect(merged.detailSections[0]!.content).toBe(
        "This is the raw analysis from Perplexity.",
      );
    });
  });
});
