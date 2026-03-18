/** Exported for unit tests and use in ResearchOrchestrator. */
export function decompose(query: string, max = 4): string[] {
  return [
    query,
    `${query} latest news 2026`,
    `${query} comparison analysis`,
    `${query} best practices`,
  ].slice(0, max);
}
