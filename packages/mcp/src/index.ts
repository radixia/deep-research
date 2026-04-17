#!/usr/bin/env node
/**
 * Deep Research MCP Server — stdio entry point.
 *
 * Reads API keys from environment variables and starts an MCP server
 * on stdin/stdout, exposing the `deep_research` tool.
 *
 * Usage:
 *   MANUS_API_KEY=... PERPLEXITY_API_KEY=... node dist/index.js
 *
 * Or via the bin shortcut:
 *   deep-research-mcp
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createResearchOrchestrator } from "@deep-research/sdk";
import { createMcpServer } from "./server.js";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    process.stderr.write(`Missing required environment variable: ${name}\n`);
    process.exit(1);
  }
  return val;
}

const orchestrator = createResearchOrchestrator({
  manusApiKey: requireEnv("MANUS_API_KEY"),
  perplexityApiKey: requireEnv("PERPLEXITY_API_KEY"),
  tavilyApiKey: requireEnv("TAVILY_API_KEY"),
  firecrawlApiKey: requireEnv("FIRECRAWL_API_KEY"),
  braveApiKey: requireEnv("BRAVE_API_KEY"),
  exaApiKey: process.env["EXA_API_KEY"] ?? "",
  webhookBaseUrl: process.env["WEBHOOK_BASE_URL"] ?? "http://localhost:3000",
  ...(process.env["ANTHROPIC_API_KEY"] ? { anthropicApiKey: process.env["ANTHROPIC_API_KEY"] } : {}),
});

const server = createMcpServer({ orchestrator });
const transport = new StdioServerTransport();
await server.connect(transport);
