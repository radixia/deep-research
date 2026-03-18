import type { Context, Next } from "hono";
import { config } from "./config.js";

const WINDOW_MS = 60 * 1000;
const LIMIT_QUICK = 30;
const LIMIT_DEEP = 10;

const timestamps: Map<string, number[]> = new Map();

function prune(key: string): void {
  const list = timestamps.get(key) ?? [];
  const cutoff = Date.now() - WINDOW_MS;
  const kept = list.filter((t) => t > cutoff);
  if (kept.length === 0) timestamps.delete(key);
  else timestamps.set(key, kept);
}

export function getApiKey(c: Context): string {
  const header = c.req.header("x-api-key");
  if (header) return header;
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return "";
}

/** When config.apiKey is set, require request to provide matching key. */
export async function requireApiKey(c: Context, next: Next): Promise<Response | void> {
  if (!config.apiKey) return next();
  const key = getApiKey(c);
  if (!key || key !== config.apiKey) {
    return c.json({ error: "Missing or invalid API key" }, 401);
  }
  return next();
}

/** Sliding-window rate limit: 30/min for quick/standard, 10/min for deep. */
export function checkRateLimit(apiKey: string, depth: "quick" | "standard" | "deep"): boolean {
  const key = apiKey || "anon";
  prune(key);
  const list = timestamps.get(key) ?? [];
  const limit = depth === "deep" ? LIMIT_DEEP : LIMIT_QUICK;
  if (list.length >= limit) return false;
  list.push(Date.now());
  timestamps.set(key, list);
  return true;
}
