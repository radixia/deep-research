import { generateText, stepCountIs } from "ai";
import type { LanguageModel } from "ai";
import type { Citation } from "@deep-research/types";
import { RESEARCHER_SYSTEM } from "./prompts.js";

export interface SubTopicResult {
  topic: string;
  summary: string;
  citations: Citation[];
  stepCount: number;
}

type ToolSourceName = Citation["sourceTool"];

function toolNameToSource(toolName: string): ToolSourceName {
  switch (toolName) {
    case "academic_search":
      return "perplexity";
    case "deep_crawl":
    case "get_page":
      return "firecrawl";
    case "news_search":
      return "brave";
    case "semantic_search":
      return "exa";
    default:
      return "tavily";
  }
}

export async function researchSubTopic(
  topic: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools: Record<string, any>,
  model: LanguageModel,
  signal?: AbortSignal,
): Promise<SubTopicResult> {
  const fetchedUrls = new Set<string>();
  const citations: Citation[] = [];

  const result = await generateText({
    model,
    system: RESEARCHER_SYSTEM,
    prompt: `Research this topic thoroughly: ${topic}`,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    tools,
    stopWhen: stepCountIs(8),
    maxOutputTokens: 6000,
    temperature: 0.3,
    ...(signal !== undefined && { abortSignal: signal }),
  });

  for (const step of result.steps) {
    for (const toolResult of step.toolResults) {
      const source = toolNameToSource(toolResult.toolName);
      const credibility =
        source === "perplexity" ? 0.85 : source === "firecrawl" ? 0.78 : source === "exa" ? 0.76 : 0.7;
      const output = toolResult.output as Record<string, unknown> | null | undefined;
      if (!output) continue;

      // SearchOutput: { results: SearchHit[] }
      const results = output["results"];
      if (Array.isArray(results)) {
        for (const r of results as Array<{ url?: string; title?: string; snippet?: string }>) {
          if (r.url && !fetchedUrls.has(r.url)) {
            fetchedUrls.add(r.url);
            citations.push({
              url: r.url,
              title: r.title ?? "",
              snippet: r.snippet ?? "",
              sourceTool: source,
              fetchedAt: new Date(),
              credibilityScore: credibility,
            });
          }
        }
      }

      // AcademicOutput: { content, citations: [{url, title}] }
      const academicCitations = output["citations"];
      if (Array.isArray(academicCitations)) {
        for (const c of academicCitations as Array<{ url?: string; title?: string }>) {
          if (c.url && !fetchedUrls.has(c.url)) {
            fetchedUrls.add(c.url);
            citations.push({
              url: c.url,
              title: c.title ?? "",
              snippet: "",
              sourceTool: "perplexity",
              fetchedAt: new Date(),
              credibilityScore: 0.85,
            });
          }
        }
      }

      // PageOutput: { url, title, content }
      const pageUrl = output["url"];
      if (typeof pageUrl === "string" && !fetchedUrls.has(pageUrl)) {
        fetchedUrls.add(pageUrl);
        citations.push({
          url: pageUrl,
          title: typeof output["title"] === "string" ? output["title"] : "",
          snippet:
            typeof output["content"] === "string"
              ? output["content"].slice(0, 300)
              : "",
          sourceTool: "firecrawl",
          fetchedAt: new Date(),
          credibilityScore: 0.8,
        });
      }
    }
  }

  return {
    topic,
    summary: result.text,
    citations,
    stepCount: result.steps.length,
  };
}
