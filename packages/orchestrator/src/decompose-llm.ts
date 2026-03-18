import Anthropic from "@anthropic-ai/sdk";
import { decompose } from "./decompose.js";

const SUB_QUERIES_PROMPT = `You are a research query decomposer. Given a user search or research query, output 1 to 4 related sub-queries that would help gather comprehensive information. Return ONLY a JSON array of strings, no other text. Example: ["original query", "query latest 2025", "query comparison"].

User query: `;

export async function decomposeWithLlm(
  query: string,
  apiKey: string,
  max = 4,
  signal?: AbortSignal
): Promise<string[]> {
  const anthropic = new Anthropic({ apiKey });
  try {
    const msg = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 256,
      messages: [{ role: "user", content: SUB_QUERIES_PROMPT + query }],
      signal,
    });
    const text =
      msg.content?.find((b) => b.type === "text")?.type === "text"
        ? (msg.content.find((b) => b.type === "text") as { text: string }).text
        : "";
    const parsed = JSON.parse(text.trim()) as unknown;
    if (!Array.isArray(parsed)) return decompose(query, max);
    const list = parsed.filter((x): x is string => typeof x === "string").slice(0, max);
    return list.length > 0 ? list : decompose(query, max);
  } catch {
    return decompose(query, max);
  }
}
