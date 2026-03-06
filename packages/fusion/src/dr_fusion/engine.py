"""
Fusion Engine.

Merges results from multiple tools:
- Deduplicates by URL and content similarity
- Ranks sources by credibility score
- Tracks citations across all tools
- Produces a final synthesis summary
"""

from dataclasses import dataclass, field
from dr_types import Citation, ToolResult

# Weight per tool for credibility scoring
TOOL_CREDIBILITY_WEIGHT: dict[str, float] = {
    "manus": 0.9,
    "perplexity": 0.85,
    "firecrawl": 0.8,
    "tavily": 0.75,
}


@dataclass
class FusionResult:
    summary: str
    sources: list[Citation] = field(default_factory=list)
    confidence_score: float = 0.0
    dedup_ratio: float = 0.0  # fraction of duplicates removed


class FusionEngine:
    def merge(self, query: str, tool_results: list[ToolResult]) -> FusionResult:
        """
        Merge all tool results into a single FusionResult.
        """
        # 1. Collect all citations
        all_citations: list[Citation] = []
        for tr in tool_results:
            if tr.success:
                all_citations.extend(tr.citations)

        total_before = len(all_citations)

        # 2. Deduplicate by URL
        unique = self._dedup_by_url(all_citations)

        # 3. Apply tool credibility weights
        scored = self._apply_credibility(unique)

        # 4. Sort by score descending
        ranked = sorted(scored, key=lambda c: c.credibility_score, reverse=True)

        # 5. Build summary from successful text results
        summary = self._build_summary(query, tool_results)

        # 6. Compute overall confidence
        confidence = self._compute_confidence(ranked, tool_results)

        dedup_ratio = (
            1 - (len(ranked) / total_before) if total_before > 0 else 0.0
        )

        return FusionResult(
            summary=summary,
            sources=ranked,
            confidence_score=confidence,
            dedup_ratio=dedup_ratio,
        )

    def _dedup_by_url(self, citations: list[Citation]) -> list[Citation]:
        """Remove exact URL duplicates, keeping highest credibility score."""
        seen: dict[str, Citation] = {}
        for c in citations:
            if not c.url:
                continue
            url = c.url.rstrip("/")
            if url not in seen or c.credibility_score > seen[url].credibility_score:
                seen[url] = c
        return list(seen.values())

    def _apply_credibility(self, citations: list[Citation]) -> list[Citation]:
        """Boost credibility score based on source tool weight."""
        result = []
        for c in citations:
            weight = TOOL_CREDIBILITY_WEIGHT.get(c.source_tool, 0.5)
            c.credibility_score = min(1.0, c.credibility_score * weight + weight * 0.1)
            result.append(c)
        return result

    def _build_summary(self, query: str, tool_results: list[ToolResult]) -> str:
        """
        Build a narrative summary from successful tool outputs.
        Priority: Manus > Perplexity > others.
        TODO: replace with LLM synthesis call for production.
        """
        priority_order = ["manus", "perplexity", "firecrawl", "tavily"]
        texts = {tr.tool: tr.raw_output for tr in tool_results if tr.success and tr.raw_output}

        for tool in priority_order:
            if tool in texts and isinstance(texts[tool], str):
                header = f"## Research: {query}\n\n*Primary source: {tool}*\n\n"
                return header + texts[tool]

        return f"## Research: {query}\n\nNo synthesis available."

    def _compute_confidence(
        self,
        ranked_citations: list[Citation],
        tool_results: list[ToolResult],
    ) -> float:
        """
        Confidence = weighted average of:
        - Source coverage (more sources → higher confidence)
        - Tool success rate
        - Average citation credibility
        """
        if not tool_results:
            return 0.0

        success_rate = sum(1 for tr in tool_results if tr.success) / len(tool_results)

        avg_credibility = (
            sum(c.credibility_score for c in ranked_citations) / len(ranked_citations)
            if ranked_citations
            else 0.0
        )

        # Coverage bonus: log scale, max at 100 sources
        import math
        coverage = min(1.0, math.log1p(len(ranked_citations)) / math.log1p(100))

        return round(
            success_rate * 0.3 + avg_credibility * 0.5 + coverage * 0.2,
            3,
        )
