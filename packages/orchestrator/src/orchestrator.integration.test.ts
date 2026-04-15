import { describe, it, expect, vi } from "vitest";
import { ResearchOrchestrator } from "./index.js";
import { FusionEngine } from "@deep-research/fusion";
import type { ToolClient, ToolResult, Citation } from "@deep-research/types";

// ── Mock tool factory ────────────────────────────────────────────────────────

function mockToolClient(name: string): ToolClient & { calls: Array<{ query: string; options: Record<string, unknown> }> } {
  const calls: Array<{ query: string; options: Record<string, unknown> }> = [];
  return {
    calls,
    run: vi.fn(async (query: string, options?: Record<string, unknown>): Promise<ToolResult> => {
      calls.push({ query, options: options ?? {} });
      const citations: Citation[] = [
        {
          url: `https://${name}.example.com/result`,
          title: `${name} result`,
          snippet: `Result from ${name} for: ${query}`,
          sourceTool: name as Citation["sourceTool"],
          fetchedAt: new Date(),
          credibilityScore: 0.7,
        },
      ];
      return {
        tool: name,
        rawOutput: `${name} answer for: ${query}`,
        citations,
        latencyMs: 50,
        success: true,
      };
    }),
  };
}

function createTestOrchestrator(toolNames: string[]) {
  const tools: Record<string, ToolClient & { calls: Array<{ query: string; options: Record<string, unknown> }> }> = {};
  for (const name of toolNames) {
    tools[name] = mockToolClient(name);
  }
  const fusion = new FusionEngine();
  const orchestrator = new ResearchOrchestrator(tools, fusion);
  return { orchestrator, tools };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ResearchOrchestrator — integration", () => {
  describe("direct provider mode", () => {
    it("runs only the specified providers in parallel", async () => {
      const { orchestrator, tools } = createTestOrchestrator([
        "tavily",
        "brave",
        "perplexity",
        "firecrawl",
      ]);

      const result = await orchestrator.research({
        query: "test query",
        depth: "quick",
        outputFormat: "markdown_report",
        maxSources: 50,
        language: "en",
        providers: ["tavily", "brave"],
      });

      expect(result.status).toBe("completed");
      // Only tavily and brave should have been called
      expect(tools["tavily"]!.calls.length).toBe(1);
      expect(tools["brave"]!.calls.length).toBe(1);
      // perplexity and firecrawl should NOT have been called
      expect(tools["perplexity"]!.calls.length).toBe(0);
      expect(tools["firecrawl"]!.calls.length).toBe(0);
    });

    it("passes allowedDomains to each provider", async () => {
      const { orchestrator, tools } = createTestOrchestrator(["tavily", "brave"]);

      await orchestrator.research({
        query: "domain test",
        depth: "quick",
        outputFormat: "markdown_report",
        maxSources: 50,
        language: "en",
        providers: ["tavily", "brave"],
        allowedDomains: ["example.com", "test.org"],
      });

      // Both tools should receive allowedDomains in their options
      expect(tools["tavily"]!.calls[0]!.options["allowedDomains"]).toEqual([
        "example.com",
        "test.org",
      ]);
      expect(tools["brave"]!.calls[0]!.options["allowedDomains"]).toEqual([
        "example.com",
        "test.org",
      ]);
    });
  });

  describe("depth-based routing backward compat", () => {
    it("invokes perplexity, tavily, brave for quick depth (no providers)", async () => {
      const { orchestrator, tools } = createTestOrchestrator([
        "perplexity",
        "tavily",
        "brave",
      ]);

      const result = await orchestrator.research({
        query: "backward compat test",
        depth: "quick",
        outputFormat: "markdown_report",
        maxSources: 50,
        language: "en",
      });

      expect(result.status).toBe("completed");
      expect(tools["perplexity"]!.calls.length).toBe(1);
      expect(tools["tavily"]!.calls.length).toBe(1);
      expect(tools["brave"]!.calls.length).toBe(1);
    });

    it("passes allowedDomains through depth routes", async () => {
      const { orchestrator, tools } = createTestOrchestrator([
        "perplexity",
        "tavily",
        "brave",
      ]);

      await orchestrator.research({
        query: "domain depth test",
        depth: "quick",
        outputFormat: "markdown_report",
        maxSources: 50,
        language: "en",
        allowedDomains: ["arxiv.org"],
      });

      for (const name of ["perplexity", "tavily", "brave"]) {
        expect(tools[name]!.calls[0]!.options["allowedDomains"]).toEqual(["arxiv.org"]);
      }
    });
  });

  describe("structured response shape", () => {
    it("populates executiveSummary, detailSections, and references", async () => {
      const { orchestrator } = createTestOrchestrator(["tavily", "brave"]);

      const result = await orchestrator.research({
        query: "structured test",
        depth: "quick",
        outputFormat: "markdown_report",
        maxSources: 50,
        language: "en",
        providers: ["tavily", "brave"],
      });

      // executiveSummary should exist (built from best tool's rawOutput)
      expect(result.executiveSummary.length).toBeGreaterThan(0);

      // detailSections: one per successful tool
      expect(result.detailSections.length).toBe(2);
      expect(result.detailSections.map((s) => s.tool).sort()).toEqual(["brave", "tavily"]);

      // references: one per unique URL
      expect(result.references.length).toBe(2);
      expect(result.references[0]!.index).toBe(1);
      expect(result.references[1]!.index).toBe(2);
    });

    it("includes chunks with source URLs in detail sections", async () => {
      const { orchestrator } = createTestOrchestrator(["tavily"]);

      const result = await orchestrator.research({
        query: "chunks test",
        depth: "quick",
        outputFormat: "markdown_report",
        maxSources: 50,
        language: "en",
        providers: ["tavily"],
      });

      const section = result.detailSections[0]!;
      expect(section.chunks.length).toBeGreaterThan(0);
      expect(section.chunks[0]!.sourceUrl).toContain("tavily.example.com");
    });
  });

  describe("partial tool failure", () => {
    it("completes with remaining tools when one fails", async () => {
      const tools: Record<string, ToolClient> = {};

      // Working tool
      tools["tavily"] = {
        run: async () => ({
          tool: "tavily",
          rawOutput: "tavily works",
          citations: [
            {
              url: "https://tavily.com/result",
              title: "Tavily",
              snippet: "Snippet",
              sourceTool: "tavily" as const,
              fetchedAt: new Date(),
              credibilityScore: 0.7,
            },
          ],
          latencyMs: 50,
          success: true,
        }),
      };

      // Failing tool
      tools["brave"] = {
        run: async () => ({
          tool: "brave",
          rawOutput: null,
          citations: [],
          latencyMs: 50,
          success: false,
          error: "API error 500",
        }),
      };

      const orchestrator = new ResearchOrchestrator(tools, new FusionEngine());

      const result = await orchestrator.research({
        query: "partial failure test",
        depth: "quick",
        outputFormat: "markdown_report",
        maxSources: 50,
        language: "en",
        providers: ["tavily", "brave"],
      });

      expect(result.status).toBe("completed");
      expect(result.sources.length).toBe(1);
      // Only tavily has a detail section (brave failed)
      expect(result.detailSections.length).toBe(1);
      expect(result.detailSections[0]!.tool).toBe("tavily");
      // Confidence should be lower due to partial failure
      expect(result.confidenceScore).toBeGreaterThan(0);
      expect(result.confidenceScore).toBeLessThan(1);
    });
  });
});
