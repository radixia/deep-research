/** Exported for unit tests and use in ResearchOrchestrator when no LLM key is set. */
export function decompose(query: string, max = 4): string[] {
  const trimmed = query.trim();
  if (max <= 1) return [trimmed];
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  // Short factual queries: avoid meaningless suffixes like "best practices".
  if (wordCount <= 4) {
    return [trimmed, `${trimmed} overview`, `${trimmed} context`].slice(0, max);
  }
  return [
    trimmed,
    `${trimmed} recent developments`,
    `${trimmed} comparison and analysis`,
  ].slice(0, max);
}
