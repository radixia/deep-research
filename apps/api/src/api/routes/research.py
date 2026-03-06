from fastapi import APIRouter, Depends
from dr_types import ResearchQuery, ResearchResult
from dr_orchestrator import ResearchOrchestrator
from ..deps import get_orchestrator

router = APIRouter()


@router.post("/", response_model=ResearchResult)
async def run_research(
    request: ResearchQuery,
    orchestrator: ResearchOrchestrator = Depends(get_orchestrator),
) -> ResearchResult:
    """
    Run a research query.

    - **quick**: Perplexity + Tavily (~10s)
    - **standard**: All tools except Manus (~1 min)
    - **deep**: All tools including Manus (~15 min)
    """
    return await orchestrator.research(request)
