export const config = {
  manusApiKey: process.env["MANUS_API_KEY"] ?? "",
  perplexityApiKey: process.env["PERPLEXITY_API_KEY"] ?? "",
  tavilyApiKey: process.env["TAVILY_API_KEY"] ?? "",
  firecrawlApiKey: process.env["FIRECRAWL_API_KEY"] ?? "",
  webhookBaseUrl: process.env["WEBHOOK_BASE_URL"] ?? "http://localhost:3000",
  manusWebhookSecret: process.env["MANUS_WEBHOOK_SECRET"] ?? "",
  port: Number(process.env["PORT"] ?? 3000),
  env: process.env["APP_ENV"] ?? "development",
} as const;
