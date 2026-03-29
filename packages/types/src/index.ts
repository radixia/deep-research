import { z } from "zod";

// ── Enums ────────────────────────────────────────────────────────────────────

export const ResearchDepth = z.enum(["quick", "standard", "deep", "agentic"]);
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

export const ResearchQuerySchema = z.object({
  query: z.string().min(1),
  depth: ResearchDepth.default("standard"),
  outputFormat: OutputFormat.default("markdown_report"),
  maxSources: z.number().int().min(1).max(500).default(50),
  language: z.string().default("en"),
});
export type ResearchQuery = z.infer<typeof ResearchQuerySchema>;

export const CitationSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  snippet: z.string(),
  sourceTool: z.enum(["manus", "perplexity", "tavily", "firecrawl", "brave", "exa"]),
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

export const ResearchResultSchema = z.object({
  query: z.string(),
  depth: ResearchDepth,
  status: ResearchStatus,
  summary: z.string().default(""),
  sources: z.array(CitationSchema).default([]),
  toolResults: z.array(ToolResultSchema).default([]),
  confidenceScore: z.number().min(0).max(1).default(0),
  createdAt: z.coerce.date().default(() => new Date()),
  completedAt: z.coerce.date().optional(),
});
export type ResearchResult = z.infer<typeof ResearchResultSchema>;
