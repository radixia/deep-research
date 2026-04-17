import { generateText } from "ai";
import type { LanguageModel } from "ai";
import { PLANNER_SYSTEM } from "./prompts.js";

export interface ResearchPlan {
  strategy: "factual" | "analytical" | "comparative" | "investigative";
  reasoning: string;
  subTopics: string[];
  searchQueries: string[];
}

export async function planResearch(
  query: string,
  model: LanguageModel,
  signal?: AbortSignal,
): Promise<ResearchPlan> {
  const result = await generateText({
    model,
    system: PLANNER_SYSTEM,
    prompt: `Research query: ${query}`,
    temperature: 0,
    maxOutputTokens: 1024,
    ...(signal !== undefined && { abortSignal: signal }),
  });

  try {
    const parsed = JSON.parse(result.text.trim()) as Partial<ResearchPlan>;
    return {
      strategy: parsed.strategy ?? "analytical",
      reasoning: parsed.reasoning ?? "",
      subTopics:
        Array.isArray(parsed.subTopics) && parsed.subTopics.length > 0
          ? parsed.subTopics.slice(0, 5)
          : [query],
      searchQueries:
        Array.isArray(parsed.searchQueries) && parsed.searchQueries.length > 0
          ? parsed.searchQueries.slice(0, 6)
          : [query],
    };
  } catch {
    return {
      strategy: "analytical",
      reasoning: "Fallback: treating as single-topic research",
      subTopics: [query],
      searchQueries: [query],
    };
  }
}
