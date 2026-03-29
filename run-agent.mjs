#!/usr/bin/env node
/**
 * Quick runner to test the DeepResearchAgent end-to-end.
 * Usage: node --env-file=.env run-agent.mjs "your query here"
 */
import { DeepResearchAgent } from "./packages/agent/dist/index.js";
import { TavilyClient } from "./packages/tools/tavily/dist/index.js";
import { PerplexityClient } from "./packages/tools/perplexity/dist/index.js";
import { FirecrawlClient } from "./packages/tools/firecrawl/dist/index.js";
import { BraveClient } from "./packages/tools/brave/dist/index.js";

const query = process.argv[2] ?? "State of agentic AI in 2026";

console.log(`\n🔬 Deep Research Agent — starting\n`);
console.log(`Query: "${query}"\n`);

const agent = new DeepResearchAgent(
  {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  },
  {
    tavily: new TavilyClient(process.env.TAVILY_API_KEY),
    perplexity: new PerplexityClient(process.env.PERPLEXITY_API_KEY),
    firecrawl: new FirecrawlClient(process.env.FIRECRAWL_API_KEY),
    brave: new BraveClient(process.env.BRAVE_API_KEY),
  },
  (event) => {
    switch (event.type) {
      case "planning":
        console.log(`📋 Planning research strategy...`);
        break;
      case "researching":
        console.log(`🔍 [${event.index + 1}/${event.total}] Researching: ${event.topic}`);
        break;
      case "topic_complete":
        console.log(`   ✅ Done — ${event.citationsFound} citations found (${event.stepCount} steps)`);
        break;
      case "synthesizing":
        console.log(`\n📝 Synthesizing ${event.subTopicsCount} sub-topics into final report...`);
        break;
      case "complete":
        console.log(`\n🏁 Complete in ${(event.durationMs / 1000).toFixed(1)}s\n`);
        break;
    }
  },
);

const result = await agent.research({ query, depth: "agentic", outputFormat: "markdown_report" });

console.log("─".repeat(80));
console.log(result.summary);
console.log("─".repeat(80));
console.log(`\nStatus: ${result.status}`);
console.log(`Confidence: ${(result.confidenceScore * 100).toFixed(0)}%`);
console.log(`Sources: ${result.sources.length}`);
