/**
 * Fusion Engine.
 * Merges results from multiple tools:
 * - Deduplicates by URL
 * - Ranks sources by credibility
 * - Tracks citations across all tools
 * - Builds synthesis summary
 */

import type { Citation, ToolResult } from "@deep-research/types";

const TOOL_WEIGHT: Record<string, number> = {
  manus: 0.9,
  perplexity: 0.85,
  firecrawl: 0.8,
  tavily: 0.75,
};

export interface FusionResult {
  summary: string;
  sources: Citation[];
  confidenceScore: number;
  dedupRatio: number;
}

export class FusionEngine {
  merge(query: string, toolResults: ToolResult[]): FusionResult {
    const allCitations = toolResults.flatMap((tr) => (tr.success ? tr.citations : []));
    const totalBefore = allCitations.length;

    const unique = this.dedupByUrl(allCitations);
    const scored = this.applyCredibility(unique);
    const ranked = scored.sort((a, b) => b.credibilityScore - a.credibilityScore);

    const summary = this.buildSummary(query, toolResults);
    const confidenceScore = this.computeConfidence(ranked, toolResults);
    const dedupRatio = totalBefore > 0 ? 1 - ranked.length / totalBefore : 0;

    return { summary, sources: ranked, confidenceScore, dedupRatio };
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
      return { ...c, credibilityScore: Math.min(1, c.credibilityScore * weight + weight * 0.1) };
    });
  }

  private buildSummary(query: string, toolResults: ToolResult[]): string {
    const priority = ["manus", "perplexity", "firecrawl", "tavily"] as const;
    const texts = Object.fromEntries(
      toolResults
        .filter((tr) => tr.success && typeof tr.rawOutput === "string")
        .map((tr) => [tr.tool, tr.rawOutput as string]),
    );

    for (const tool of priority) {
      if (texts[tool]) {
        return `## Research: ${query}\n\n*Primary source: ${tool}*\n\n${texts[tool]}`;
      }
    }
    return `## Research: ${query}\n\nNo synthesis available.`;
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
