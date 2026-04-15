import { describe, it, expect } from "vitest";
import { createMcpServer, formatResearchResult } from "./server.js";
import {
  FusionEngine,
  ResearchOrchestrator,
  type ToolClient,
  type ToolResult,
  type Citation,
  type ResearchResult,
} from "@deep-research/sdk";

// ── Mock tool ────────────────────────────────────────────────────────────────

function mockTool(name: string): ToolClient {
  return {
    run: async (query: string): Promise<ToolResult> => {
      const citations: Citation[] = [
        {
          url: `https://${name}.example.com/article`,
          title: `${name} Finding`,
          snippet: `Key finding from ${name}: ${query.slice(0, 50)}`,
          sourceTool: name as Citation["sourceTool"],
          fetchedAt: new Date(),
          credibilityScore: 0.7,
        },
      ];
      return {
        tool: name,
        rawOutput: `${name} comprehensive answer for: ${query}`,
        citations,
        latencyMs: 10,
        success: true,
      };
    },
  };
}

function createTestOrchestrator(): ResearchOrchestrator {
  const tools: Record<string, ToolClient> = {
    perplexity: mockTool("perplexity"),
    tavily: mockTool("tavily"),
    brave: mockTool("brave"),
    firecrawl: mockTool("firecrawl"),
    manus: mockTool("manus"),
  };
  return new ResearchOrchestrator(tools, new FusionEngine());
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("MCP Server — integration", () => {
  describe("createMcpServer", () => {
    it("creates an MCP server with the deep_research tool registered", () => {
      const orchestrator = createTestOrchestrator();
      const server = createMcpServer({ orchestrator });
      // Server should be created without throwing
      expect(server).toBeDefined();
    });
  });

  describe("formatResearchResult", () => {
    it("formats a complete research result with all sections", () => {
      const result: ResearchResult = {
        query: "test query",
        depth: "quick",
        status: "completed",
        summary: "Legacy summary",
        sources: [
          {
            url: "https://example.com",
            title: "Example",
            snippet: "Snippet",
            sourceTool: "tavily",
            fetchedAt: new Date(),
            credibilityScore: 0.7,
          },
        ],
        toolResults: [],
        confidenceScore: 0.85,
        executiveSummary: "## Research: test query\n\nThis is the executive summary [1]",
        detailSections: [
          {
            tool: "tavily",
            content: "Tavily detailed findings",
            chunks: [
              {
                text: "Important chunk from Tavily",
                sourceUrl: "https://example.com",
                sourceTitle: "Example",
              },
            ],
          },
        ],
        references: [
          {
            index: 1,
            url: "https://example.com",
            title: "Example",
            snippet: "Snippet text",
            sourceTool: "tavily",
          },
        ],
        createdAt: new Date(),
        completedAt: new Date(),
      };

      const formatted = formatResearchResult(result);

      // Should contain executive summary
      expect(formatted).toContain("executive summary");
      // Should contain detail section header
      expect(formatted).toContain("Detailed Findings");
      expect(formatted).toContain("tavily");
      // Should contain references
      expect(formatted).toContain("References");
      expect(formatted).toContain("[1]");
      expect(formatted).toContain("https://example.com");
      // Should contain metadata
      expect(formatted).toContain("Confidence: 85.0%");
      expect(formatted).toContain("Sources: 1");
      expect(formatted).toContain("Depth: quick");
    });

    it("falls back to legacy summary when executiveSummary is empty", () => {
      const result: ResearchResult = {
        query: "q",
        depth: "quick",
        status: "completed",
        summary: "Legacy summary content",
        sources: [],
        toolResults: [],
        confidenceScore: 0,
        executiveSummary: "",
        detailSections: [],
        references: [],
        createdAt: new Date(),
      };

      const formatted = formatResearchResult(result);
      expect(formatted).toContain("Legacy summary content");
    });

    it("handles result with no detail sections gracefully", () => {
      const result: ResearchResult = {
        query: "q",
        depth: "quick",
        status: "failed",
        summary: "Failed",
        sources: [],
        toolResults: [],
        confidenceScore: 0,
        executiveSummary: "",
        detailSections: [],
        references: [],
        createdAt: new Date(),
      };

      const formatted = formatResearchResult(result);
      expect(formatted).not.toContain("Detailed Findings");
      expect(formatted).not.toContain("References");
      expect(formatted).toContain("Status: failed");
    });
  });

  describe("end-to-end research through MCP handler", () => {
    it("produces formatted output with executive summary + details + references", async () => {
      const orchestrator = createTestOrchestrator();

      // Simulate what the MCP tool handler does
      const result = await orchestrator.research({
        query: "state of AI 2026",
        depth: "quick",
        outputFormat: "markdown_report",
        maxSources: 50,
        language: "en",
        providers: ["tavily", "brave"],
      });

      const formatted = formatResearchResult(result);

      // Verify the formatted output has all expected sections
      expect(formatted).toContain("state of AI 2026");
      expect(formatted).toContain("Detailed Findings");
      expect(formatted).toContain("tavily");
      expect(formatted).toContain("brave");
      expect(formatted).toContain("References");
      expect(formatted).toContain("[1]");
      expect(formatted).toContain("[2]");
      expect(formatted).toContain("Confidence:");
      expect(formatted).toContain("Sources: 2");
    });

    it("respects allowedDomains in MCP tool handler flow", async () => {
      const orchestrator = createTestOrchestrator();

      const result = await orchestrator.research({
        query: "restricted search",
        depth: "quick",
        outputFormat: "markdown_report",
        maxSources: 50,
        language: "en",
        providers: ["tavily"],
        allowedDomains: ["nonexistent-domain.test"],
      });

      // Domain filter should remove all citations (none match the allowed domain)
      expect(result.sources.length).toBe(0);
      expect(result.references.length).toBe(0);
    });
  });
});
