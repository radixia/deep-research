/**
 * Fusion Engine.
 * Merges results from multiple tools:
 * - Deduplicates by URL
 * - Ranks sources by credibility
 * - Tracks citations across all tools
 * - Builds synthesis summary
 * - Generates structured output: executive summary + detail sections + numbered references
 */

import type { Citation, DetailSection, NumberedReference, OutputFormat, ToolResult } from "@deep-research/types";

const TOOL_WEIGHT: Record<string, number> = {
  manus: 0.9,
  perplexity: 0.85,
  firecrawl: 0.8,
  exa: 0.78,
  tavily: 0.75,
  brave: 0.75,
};

export interface FusionResult {
  summary: string;
  sources: Citation[];
  confidenceScore: number;
  dedupRatio: number;
  /** Executive summary with inline [N] reference markers. */
  executiveSummary: string;
  /** Per-tool detail sections with text chunks and source links. */
  detailSections: DetailSection[];
  /** Numbered reference list matching [N] markers in the executive summary. */
  references: NumberedReference[];
}

export interface MergeOptions {
  outputFormat?: OutputFormat;
  maxSources?: number;
  /** When provided, only keep citations from these domains. */
  allowedDomains?: string[];
}

export class FusionEngine {
  merge(query: string, toolResults: ToolResult[], options: MergeOptions = {}): FusionResult {
    const { outputFormat = "markdown_report", maxSources = 50, allowedDomains } = options;
    const allCitations = toolResults.flatMap((tr) => (tr.success ? tr.citations : []));
    const totalBefore = allCitations.length;

    const unique = this.dedupByUrl(allCitations);
    const domainFiltered = allowedDomains?.length
      ? this.filterByDomain(unique, allowedDomains)
      : unique;
    const scored = this.applyCredibility(domainFiltered);
    const ranked = scored
      .slice()
      .sort((a: Citation, b: Citation) => b.credibilityScore - a.credibilityScore);
    const sources = ranked.slice(0, maxSources);

    const summary = this.buildSummary(query, toolResults, sources, outputFormat);
    const confidenceScore = this.computeConfidence(sources, toolResults);
    const dedupRatio = totalBefore > 0 ? 1 - sources.length / totalBefore : 0;

    // ── Structured output ──────────────────────────────────────────────
    const references = this.buildReferences(sources);
    const executiveSummary = this.buildExecutiveSummary(query, toolResults, references);
    const detailSections = this.buildDetailSections(toolResults, references);

    return {
      summary,
      sources,
      confidenceScore,
      dedupRatio,
      executiveSummary,
      detailSections,
      references,
    };
  }

  // ── Structured output builders ────────────────────────────────────────

  /**
   * Build numbered reference list from ranked sources.
   */
  private buildReferences(sources: Citation[]): NumberedReference[] {
    return sources.map((c, i) => ({
      index: i + 1,
      url: c.url,
      title: c.title,
      snippet: c.snippet.length > 300 ? `${c.snippet.slice(0, 300)}…` : c.snippet,
      sourceTool: c.sourceTool,
    }));
  }

  /**
   * Build executive summary with inline [N] reference markers.
   * Uses the highest-priority tool's raw text output, annotating URLs with ref numbers.
   */
  private buildExecutiveSummary(
    query: string,
    toolResults: ToolResult[],
    references: NumberedReference[],
  ): string {
    const priority = ["manus", "perplexity", "firecrawl", "tavily", "brave"] as const;

    // Find the best textual output
    let primaryText = "";
    let primaryTool = "";
    for (const tool of priority) {
      const tr = toolResults.find((r) => r.tool === tool && r.success && typeof r.rawOutput === "string");
      if (tr) {
        primaryText = tr.rawOutput as string;
        primaryTool = tool;
        break;
      }
    }

    if (!primaryText) {
      if (references.length === 0) return "";
      // Fallback: build from snippets
      const snippets = references
        .slice(0, 5)
        .map((r) => `${r.snippet} [${r.index}]`)
        .join("\n\n");
      return `## Research: ${query}\n\n${snippets}`;
    }

    // Build URL→ref index map for annotation
    const urlToRef = new Map<string, number>();
    for (const ref of references) {
      urlToRef.set(ref.url, ref.index);
      // Also map without trailing slash
      urlToRef.set(ref.url.replace(/\/$/, ""), ref.index);
    }

    // Replace markdown links [title](url) with [title][N]
    let annotated = primaryText.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
      (_match, title: string, url: string) => {
        const refIdx = urlToRef.get(url) ?? urlToRef.get(url.replace(/\/$/, ""));
        return refIdx ? `${title} [${refIdx}]` : `${title}`;
      },
    );

    // Replace bare URLs with [N] markers
    annotated = annotated.replace(/(https?:\/\/[^\s)]+)/g, (url) => {
      const refIdx = urlToRef.get(url) ?? urlToRef.get(url.replace(/\/$/, ""));
      return refIdx ? `[${refIdx}]` : url;
    });

    // Add top references as footer
    const topRefs = references
      .slice(0, 10)
      .map((r) => `[${r.index}] ${r.title || r.url}`)
      .join("\n");

    return `## Research: ${query}\n\n*Source: ${primaryTool}*\n\n${annotated}\n\n---\n${topRefs}`;
  }

  /**
   * Build per-tool detail sections with chunks.
   */
  private buildDetailSections(
    toolResults: ToolResult[],
    _references: NumberedReference[],
  ): DetailSection[] {
    return toolResults
      .filter((tr) => tr.success)
      .map((tr) => {
        const content =
          typeof tr.rawOutput === "string"
            ? tr.rawOutput
            : tr.rawOutput != null
              ? JSON.stringify(tr.rawOutput, null, 2)
              : "";

        const chunks = tr.citations.map((c) => ({
          text: c.snippet,
          sourceUrl: c.url,
          sourceTitle: c.title,
        }));

        return { tool: tr.tool, content, chunks };
      });
  }

  // ── Core pipeline methods ─────────────────────────────────────────────

  private filterByDomain(citations: Citation[], allowedDomains: string[]): Citation[] {
    return citations.filter((c) => {
      try {
        const host = new URL(c.url).hostname.replace(/^www\./, "");
        return allowedDomains.some((d) => host === d || host.endsWith(`.${d}`));
      } catch {
        return false;
      }
    });
  }

  private dedupByUrl(citations: Citation[]): Citation[] {
    const seen = new Map<string, Citation>();
    for (const c of citations) {
      if (!c.url) continue;
      const url = c.url.replace(/\/$/, "");
      const existing = seen.get(url);
      if (!existing || c.credibilityScore > existing.credibilityScore) {
        seen.set(url, c);
      }
    }
    return Array.from(seen.values());
  }

  private applyCredibility(citations: Citation[]): Citation[] {
    return citations.map((c) => {
      const weight = TOOL_WEIGHT[c.sourceTool] ?? 0.5;
      return { ...c, credibilityScore: Math.min(1, c.credibilityScore * weight) };
    });
  }

  private buildSummary(
    query: string,
    toolResults: ToolResult[],
    rankedSources: Citation[],
    outputFormat: OutputFormat,
  ): string {
    const priority = ["manus", "perplexity", "firecrawl", "exa", "tavily", "brave"] as const;
    const texts = Object.fromEntries(
      toolResults
        .filter((tr) => tr.success && typeof tr.rawOutput === "string")
        .map((tr) => [tr.tool, tr.rawOutput as string]),
    );

    const primaryText = (): string => {
      for (const tool of priority) {
        if (texts[tool]) return texts[tool]!;
      }
      return "";
    };

    if (outputFormat === "structured_json") {
      const summary = primaryText();
      return JSON.stringify(
        {
          query,
          summary,
          sources: rankedSources.map((c) => ({
            url: c.url,
            title: c.title,
            snippet: c.snippet,
            sourceTool: c.sourceTool,
            credibilityScore: c.credibilityScore,
            fetchedAt: c.fetchedAt instanceof Date ? c.fetchedAt.toISOString() : String(c.fetchedAt),
          })),
          toolResults: toolResults.map((tr) => ({
            tool: tr.tool,
            success: tr.success,
            latencyMs: tr.latencyMs,
            citationsCount: tr.citations.length,
          })),
        },
        null,
        2
      );
    }

    if (outputFormat === "rag_chunks") {
      const chunks = rankedSources.map((c, i) => {
        const body = c.snippet.length > 800 ? `${c.snippet.slice(0, 800)}…` : c.snippet;
        return `[chunk ${i + 1}] ${c.title}\nsource: ${c.url}\n${body}`;
      });
      return chunks.length > 0 ? chunks.join("\n\n---\n\n") : `No chunks for: ${query}`;
    }

    if (outputFormat === "citations_list") {
      const lines = rankedSources.map(
        (c, i) =>
          `${i + 1}. [${c.title}](${c.url})\n   ${c.snippet.length > 200 ? `${c.snippet.slice(0, 200)}…` : c.snippet}`,
      );
      return `## Research: ${query}\n\n### Sources\n\n${lines.join("\n\n")}`;
    }

    if (outputFormat === "executive_summary") {
      const excerpts = rankedSources
        .slice(0, 5)
        .map((c) => c.snippet.slice(0, 150))
        .join("\n\n");
      return `## Research: ${query}\n\n### Summary\n\n${excerpts || "No synthesis available."}`;
    }

    let primary = "";
    for (const tool of priority) {
      if (texts[tool]) {
        primary = `*Primary source: ${tool}*\n\n${texts[tool]}`;
        break;
      }
    }
    const additional = rankedSources
      .slice(0, 5)
      .map((c) => `- **${c.title}**: ${c.snippet.slice(0, 150)}…`);
    const additionalBlock =
      additional.length > 0 ? `\n\n### Additional sources\n\n${additional.join("\n")}` : "";
    return `## Research: ${query}\n\n${primary || "No synthesis available."}${additionalBlock}`;
  }

  private computeConfidence(ranked: Citation[], toolResults: ToolResult[]): number {
    if (!toolResults.length) return 0;

    const successRate = toolResults.filter((tr) => tr.success).length / toolResults.length;
    const avgCredibility = ranked.length
      ? ranked.reduce((acc, c) => acc + c.credibilityScore, 0) / ranked.length
      : 0;
    const coverage = Math.min(1, Math.log1p(ranked.length) / Math.log1p(100));

    return Math.round((successRate * 0.3 + avgCredibility * 0.5 + coverage * 0.2) * 1000) / 1000;
  }
}
