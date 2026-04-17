/**
 * MCP server definition for deep research.
 *
 * Exports `createMcpServer()` so that both the stdio entry point and tests
 * can share the same server construction without duplicating tool registrations.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ResearchOrchestrator } from "@deep-research/sdk";
import type { ResearchResult } from "@deep-research/types";

export interface McpServerDeps {
  orchestrator: ResearchOrchestrator;
}

/**
 * Format a ResearchResult into a human-readable string for MCP tool output.
 *
 * Structure:
 *  1. Executive Summary (with inline [N] references)
 *  2. Detail Sections (per-tool findings + chunks)
 *  3. References (numbered list)
 */
export function formatResearchResult(result: ResearchResult): string {
  const parts: string[] = [];

  // ── 1. Executive Summary ──────────────────────────────────────────────
  if (result.executiveSummary) {
    parts.push(result.executiveSummary);
  } else if (result.summary) {
    parts.push(result.summary);
  }

  // ── 2. Detail Sections ────────────────────────────────────────────────
  if (result.detailSections.length > 0) {
    parts.push("\n---\n## Detailed Findings\n");
    for (const section of result.detailSections) {
      parts.push(`### ${section.tool}\n`);
      if (section.content) {
        const preview =
          section.content.length > 2000
            ? `${section.content.slice(0, 2000)}…`
            : section.content;
        parts.push(preview);
      }
      if (section.chunks.length > 0) {
        parts.push("\n**Chunks:**\n");
        for (const chunk of section.chunks) {
          const src = chunk.sourceUrl ? ` — ${chunk.sourceUrl}` : "";
          parts.push(`- ${chunk.text.slice(0, 300)}${src}`);
        }
      }
      parts.push("");
    }
  }

  // ── 3. References ─────────────────────────────────────────────────────
  if (result.references.length > 0) {
    parts.push("\n---\n## References\n");
    for (const ref of result.references) {
      const title = ref.title || ref.url;
      parts.push(`[${ref.index}] ${title}\n    ${ref.url}`);
    }
  }

  // ── 4. Metadata ───────────────────────────────────────────────────────
  parts.push(
    `\n---\nConfidence: ${(result.confidenceScore * 100).toFixed(1)}% | ` +
      `Sources: ${result.sources.length} | ` +
      `Depth: ${result.depth} | ` +
      `Status: ${result.status}`,
  );

  return parts.join("\n");
}

export function createMcpServer(deps: McpServerDeps): McpServer {
  const { orchestrator } = deps;

  const server = new McpServer({
    name: "deep-research",
    version: "0.1.0",
  });

  server.registerTool(
    "deep_research",
    {
      description:
        "Perform deep web research with multiple search providers. " +
        "Returns an executive summary with citations, detailed per-provider findings, " +
        "and a numbered reference list.",
      inputSchema: z.object({
        query: z.string().describe("Research query — the question or topic to investigate"),
        depth: z
          .enum(["quick", "standard", "deep"])
          .default("standard")
          .describe(
            "Research depth: quick (~10-30s, 3 providers), standard (~1 min, sub-queries), deep (~10-15 min, all providers incl. Manus)",
          ),
        providers: z
          .array(z.enum(["manus", "perplexity", "tavily", "firecrawl", "brave", "exa"]))
          .optional()
          .describe(
            "Explicit list of providers to use. When omitted, depth-based routing selects providers automatically.",
          ),
        allowedDomains: z
          .array(z.string())
          .optional()
          .describe(
            "Restrict search to these domains only (e.g. ['arxiv.org', 'github.com']). When omitted, searches the full internet.",
          ),
        maxSources: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(50)
          .describe("Maximum number of sources to return"),
      }),
    },
    async (params) => {
      const result = await orchestrator.research({
        query: params.query,
        depth: params.depth,
        outputFormat: "markdown_report",
        maxSources: params.maxSources,
        language: "en",
        ...(params.providers ? { providers: params.providers } : {}),
        ...(params.allowedDomains ? { allowedDomains: params.allowedDomains } : {}),
      });

      return {
        content: [
          {
            type: "text" as const,
            text: formatResearchResult(result),
          },
        ],
      };
    },
  );

  return server;
}
