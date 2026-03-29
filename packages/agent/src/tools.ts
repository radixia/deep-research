import { tool } from "ai";
import { z } from "zod";
import type { TavilyClient } from "@deep-research/tools-tavily";
import type { PerplexityClient } from "@deep-research/tools-perplexity";
import type { FirecrawlClient } from "@deep-research/tools-firecrawl";
import type { BraveClient } from "@deep-research/tools-brave";
import type { ExaClient } from "@deep-research/tools-exa";

export interface AgentToolClients {
  tavily?: TavilyClient;
  perplexity?: PerplexityClient;
  firecrawl?: FirecrawlClient;
  brave?: BraveClient;
  exa?: ExaClient;
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export type SearchOutput = { results: SearchHit[] } | { results: SearchHit[]; error: string };
export type AcademicOutput =
  | { content: string; citations: Array<{ url: string; title: string }> }
  | { content: string; citations: Array<{ url: string; title: string }>; error: string };

export interface PageOutput {
  url: string;
  title: string;
  content: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = ReturnType<typeof tool<any, any>>;

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function createAgentTools(
  clients: AgentToolClients,
  signal?: AbortSignal,
): Record<string, AnyTool> {
  const sigOpts = signal !== undefined ? { signal } : {};
  const tools: Record<string, AnyTool> = {};

  if (clients.tavily) {
    const tavily = clients.tavily;
    tools["web_search"] = tool({
      description:
        "Search the web for information. Returns relevant page snippets with URLs. Best for current events, facts, and broad coverage.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
        num_results: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .default(7)
          .describe("Number of results to return"),
      }),
      execute: async ({ query, num_results }): Promise<SearchOutput> => {
        const r = await tavily.run(query, { maxResults: num_results ?? 7, ...sigOpts });
        if (!r.success) return { results: [], error: r.error ?? "Unknown error" };
        return {
          results: r.citations.map((c) => ({
            title: c.title,
            url: c.url,
            snippet: truncate(c.snippet, 600),
          })),
        };
      },
    });
  }

  if (clients.exa) {
    const exa = clients.exa;
    tools["semantic_search"] = tool({
      description:
        "Neural / embedding-based web search (Exa). Strong for research papers, technical docs, and finding semantically related pages beyond keyword match.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
        num_results: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .default(8)
          .describe("Number of results to return"),
      }),
      execute: async ({ query, num_results }): Promise<SearchOutput> => {
        const r = await exa.run(query, { numResults: num_results ?? 8, ...sigOpts });
        if (!r.success) return { results: [], error: r.error ?? "Unknown error" };
        return {
          results: r.citations.map((c) => ({
            title: c.title,
            url: c.url,
            snippet: truncate(c.snippet, 600),
          })),
        };
      },
    });
  }

  if (clients.brave) {
    const brave = clients.brave;
    tools["news_search"] = tool({
      description:
        "Search for recent news and web content. Good for current events, recent announcements, and time-sensitive information.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }): Promise<SearchOutput> => {
        const r = await brave.run(query, { count: 6, ...sigOpts });
        if (!r.success) return { results: [], error: r.error ?? "Unknown error" };
        return {
          results: r.citations.map((c) => ({
            title: c.title,
            url: c.url,
            snippet: truncate(c.snippet, 600),
          })),
        };
      },
    });
  }

  if (clients.perplexity) {
    const perplexity = clients.perplexity;
    tools["academic_search"] = tool({
      description:
        "Deep AI-powered research with real-time web grounding. Returns comprehensive analysis with verified citations. Best for complex topics requiring authoritative depth.",
      inputSchema: z.object({
        query: z.string().describe("The research question"),
      }),
      execute: async ({ query }): Promise<AcademicOutput> => {
        const r = await perplexity.run(query, { ...sigOpts });
        if (!r.success)
          return {
            content: "",
            citations: [],
            error: r.error ?? "Unknown error",
          };
        return {
          content:
            typeof r.rawOutput === "string" ? r.rawOutput.slice(0, 6000) : "",
          citations: r.citations.map((c) => ({ url: c.url, title: c.title })),
        };
      },
    });
  }

  if (clients.firecrawl) {
    const firecrawl = clients.firecrawl;
    tools["deep_crawl"] = tool({
      description:
        "Extract rich Markdown content from web pages related to a topic. Returns full page text with structure preserved. Best when you need detailed content from multiple pages.",
      inputSchema: z.object({
        query: z.string().describe("The topic or content to extract"),
      }),
      execute: async ({ query }): Promise<SearchOutput> => {
        const r = await firecrawl.run(query, { ...sigOpts });
        if (!r.success) return { results: [], error: r.error ?? "Unknown error" };
        return {
          results: r.citations.map((c) => ({
            title: c.title,
            url: c.url,
            snippet: truncate(c.snippet, 800),
          })),
        };
      },
    });

    tools["get_page"] = tool({
      description:
        "Fetch and read the complete content of a specific URL. Use when you need to read a full article, documentation page, or report.",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to fetch"),
      }),
      execute: async ({ url }): Promise<PageOutput> => {
        const r = await firecrawl.scrapeUrl(url, { ...sigOpts });
        const raw = r.rawOutput as
          | { data?: { markdown?: string; metadata?: { title?: string } } }
          | null
          | undefined;
        const content = raw?.data?.markdown ?? r.citations[0]?.snippet ?? "";
        const title = raw?.data?.metadata?.title ?? r.citations[0]?.title ?? "";
        return {
          url,
          title,
          content: truncate(content, 8000),
        };
      },
    });
  }

  return tools;
}
