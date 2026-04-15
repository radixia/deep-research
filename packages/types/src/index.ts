import { z } from "zod";

// ── Enums ────────────────────────────────────────────────────────────────────

export const ResearchDepth = z.enum(["quick", "standard", "deep"]);
export type ResearchDepth = z.infer<typeof ResearchDepth>;

export const ResearchStatus = z.enum(["pending", "running", "completed", "failed"]);
export type ResearchStatus = z.infer<typeof ResearchStatus>;

export const OutputFormat = z.enum([
  "markdown_report",
  "structured_json",
  "executive_summary",
  "rag_chunks",
  "citations_list",
]);
export type OutputFormat = z.infer<typeof OutputFormat>;

// ── Core schemas ──────────────────────────────────────────────────────────────

export const ProviderName = z.enum(["manus", "perplexity", "tavily", "firecrawl", "brave"]);
export type ProviderName = z.infer<typeof ProviderName>;

export const ResearchQuerySchema = z.object({
  query: z.string().min(1),
  depth: ResearchDepth.default("standard"),
  outputFormat: OutputFormat.default("markdown_report"),
  maxSources: z.number().int().min(1).max(500).default(50),
  language: z.string().default("en"),
  /** When provided, only these providers run (parallel fanout, ignoring depth routing). */
  providers: z.array(ProviderName).optional(),
  /** When provided, constrain searches to these domains only. */
  allowedDomains: z.array(z.string()).optional(),
});
export type ResearchQuery = z.infer<typeof ResearchQuerySchema>;

export const CitationSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  snippet: z.string(),
  sourceTool: z.enum(["manus", "perplexity", "tavily", "firecrawl", "brave"]),
  fetchedAt: z.coerce.date().default(() => new Date()),
  credibilityScore: z.number().min(0).max(1).default(0.5),
});
export type Citation = z.infer<typeof CitationSchema>;

export const ToolResultSchema = z.object({
  tool: z.string(),
  rawOutput: z.unknown().nullable(),
  citations: z.array(CitationSchema).default([]),
  latencyMs: z.number().int().default(0),
  success: z.boolean().default(true),
  error: z.string().optional(),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

export interface ToolClient {
  run(query: string, options?: { signal?: AbortSignal; [key: string]: unknown }): Promise<ToolResult>;
}

// ── Structured response sub-schemas ───────────────────────────────────────────

export const DetailSectionSchema = z.object({
  tool: z.string(),
  content: z.string(),
  chunks: z
    .array(
      z.object({
        text: z.string(),
        sourceUrl: z.string().optional(),
        sourceTitle: z.string().optional(),
      }),
    )
    .default([]),
});
export type DetailSection = z.infer<typeof DetailSectionSchema>;

export const NumberedReferenceSchema = z.object({
  index: z.number(),
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  sourceTool: z.string(),
});
export type NumberedReference = z.infer<typeof NumberedReferenceSchema>;

// ── Research result ──────────────────────────────────────────────────────────

export const ResearchResultSchema = z.object({
  query: z.string(),
  depth: ResearchDepth,
  status: ResearchStatus,
  /** Legacy flat summary (kept for backward compatibility). */
  summary: z.string().default(""),
  /** Legacy flat source list (kept for backward compatibility). */
  sources: z.array(CitationSchema).default([]),
  toolResults: z.array(ToolResultSchema).default([]),
  confidenceScore: z.number().min(0).max(1).default(0),
  createdAt: z.coerce.date().default(() => new Date()),
  completedAt: z.coerce.date().optional(),
  /** Executive summary with inline [N] reference markers. */
  executiveSummary: z.string().default(""),
  /** Per-tool detail sections with text chunks and source links. */
  detailSections: z.array(DetailSectionSchema).default([]),
  /** Numbered reference list matching [N] markers in the executive summary. */
  references: z.array(NumberedReferenceSchema).default([]),
});
export type ResearchResult = z.infer<typeof ResearchResultSchema>;
