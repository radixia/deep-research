import { z } from "zod";

const EnvSchema = z.object({
  MANUS_API_KEY: z.string().min(1, "MANUS_API_KEY is required"),
  PERPLEXITY_API_KEY: z.string().min(1, "PERPLEXITY_API_KEY is required"),
  TAVILY_API_KEY: z.string().min(1, "TAVILY_API_KEY is required"),
  FIRECRAWL_API_KEY: z.string().min(1, "FIRECRAWL_API_KEY is required"),
  BRAVE_API_KEY: z.string().min(1, "BRAVE_API_KEY is required"),
  EXA_API_KEY: z.string().min(1, "EXA_API_KEY is required"),
  ANTHROPIC_API_KEY: z.string().optional(),
  WEBHOOK_BASE_URL: z.string().url().default("http://localhost:3000"),
  MANUS_WEBHOOK_SECRET: z.string().default(""),
  PORT: z.coerce.number().int().min(1).default(3000),
  APP_ENV: z.enum(["development", "production"]).default("development"),
  API_KEY: z.string().optional(),
  JOB_STORE_PATH: z.string().min(1).default("output/jobs.json"),
});

const ProductionEnvSchema = EnvSchema.refine(
  (data) => {
    if (data.APP_ENV !== "production") return true;
    return typeof data.API_KEY === "string" && data.API_KEY.length > 0;
  },
  {
    message: "In production, API_KEY (for x-api-key auth) is required",
  },
);

function loadConfig(): z.infer<typeof EnvSchema> {
  const parsed = EnvSchema.safeParse({
    MANUS_API_KEY: process.env["MANUS_API_KEY"],
    PERPLEXITY_API_KEY: process.env["PERPLEXITY_API_KEY"],
    TAVILY_API_KEY: process.env["TAVILY_API_KEY"],
    FIRECRAWL_API_KEY: process.env["FIRECRAWL_API_KEY"],
    BRAVE_API_KEY: process.env["BRAVE_API_KEY"],
    EXA_API_KEY: process.env["EXA_API_KEY"],
    ANTHROPIC_API_KEY: process.env["ANTHROPIC_API_KEY"],
    WEBHOOK_BASE_URL: process.env["WEBHOOK_BASE_URL"],
    MANUS_WEBHOOK_SECRET: process.env["MANUS_WEBHOOK_SECRET"],
    PORT: process.env["PORT"],
    APP_ENV: process.env["APP_ENV"],
    API_KEY: process.env["API_KEY"],
    JOB_STORE_PATH: process.env["JOB_STORE_PATH"],
  });

  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`Invalid config: ${msg}`);
  }

  const productionCheck = ProductionEnvSchema.safeParse(parsed.data);
  if (!productionCheck.success) {
    throw new Error(productionCheck.error.issues[0]?.message ?? "Production config invalid");
  }

  return parsed.data;
}

const raw = loadConfig();

export const config = {
  manusApiKey: raw.MANUS_API_KEY,
  perplexityApiKey: raw.PERPLEXITY_API_KEY,
  tavilyApiKey: raw.TAVILY_API_KEY,
  firecrawlApiKey: raw.FIRECRAWL_API_KEY,
  braveApiKey: raw.BRAVE_API_KEY,
  exaApiKey: raw.EXA_API_KEY,
  anthropicApiKey: raw.ANTHROPIC_API_KEY,
  webhookBaseUrl: raw.WEBHOOK_BASE_URL,
  manusWebhookSecret: raw.MANUS_WEBHOOK_SECRET,
  port: raw.PORT,
  env: raw.APP_ENV,
  apiKey: raw.API_KEY ?? "",
  jobStorePath: raw.JOB_STORE_PATH,
} as const;
