import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { Citation } from "@deep-research/types";
import type { SubTopicResult } from "./researcher.js";
import { SYNTHESIZER_SYSTEM } from "./prompts.js";

export interface SynthesisResult {
  markdown: string;
  citations: Citation[];
}

export async function synthesizeResearch(
  query: string,
  subTopicResults: SubTopicResult[],
  model: LanguageModel,
): Promise<SynthesisResult> {
  // Deduplicate citations across sub-topics, highest credibility wins
  const byUrl = new Map<string, Citation>();
  for (const r of subTopicResults) {
    for (const c of r.citations) {
      const existing = byUrl.get(c.url);
      if (!existing || c.credibilityScore > existing.credibilityScore) {
        byUrl.set(c.url, c);
      }
    }
  }
  const citations = Array.from(byUrl.values()).sort(
    (a, b) => b.credibilityScore - a.credibilityScore,
  );

  const researchNotes = subTopicResults
    .map(
      (r, i) =>
        `### Sub-Topic ${i + 1}: ${r.topic}\n\n${r.summary.trim() || "(no content gathered)"}`,
    )
    .join("\n\n---\n\n");

  const sourcesList = citations
    .slice(0, 60)
    .map(
      (c, i) =>
        `[${i + 1}] ${c.title || "(no title)"} — ${c.url}`,
    )
    .join("\n");

  const prompt = `ORIGINAL RESEARCH QUERY:
${query}

RESEARCH NOTES FROM SUB-AGENTS:
${researchNotes}

AVAILABLE SOURCES (reference as [N] in the report):
${sourcesList}

Write the comprehensive research report now.`;

  const result = await generateText({
    model,
    system: SYNTHESIZER_SYSTEM,
    prompt,
    maxOutputTokens: 8192,
    temperature: 0.2,
  });

  return { markdown: result.text, citations };
}
