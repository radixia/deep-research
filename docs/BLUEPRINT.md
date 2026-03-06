# 🔍 Deep Research Agent — Blueprint

> "Non la ricerca superficiale del minatore pigro, ma il lavoro meticoloso del nano che conosce ogni vena della montagna."

---

## Visione

Un agente autonomo di deep research che orchestri **Manus**, **Firecrawl**, **Tavily** e **Perplexity** in modo stratificato, assegnando a ciascuno il ruolo in cui eccelle. Non un semplice wrapper multi-API, ma un sistema con logica di orchestrazione intelligente, deduplicazione dei risultati, citazioni tracciabili e output strutturati e verificabili.

---

## Architettura a Strati

```
┌─────────────────────────────────────────────────────────┐
│                   ORCHESTRATOR LAYER                    │
│         (Task planner + Query decomposer)               │
├──────────┬──────────────┬──────────────┬────────────────┤
│  MANUS   │  PERPLEXITY  │    TAVILY    │   FIRECRAWL    │
│  (agent) │  (synthesis) │  (grounding) │  (extraction)  │
├──────────┴──────────────┴──────────────┴────────────────┤
│                   FUSION LAYER                          │
│    (dedup + ranking + citation tracking + scoring)      │
├─────────────────────────────────────────────────────────┤
│                   OUTPUT LAYER                          │
│     (Report / JSON / Markdown / Structured Schema)      │
└─────────────────────────────────────────────────────────┘
```

---

## Componenti e Ruoli

### 1. 🟣 Manus API — *The Deep Executor*

**Quando usarlo:** Task complessi multi-step che richiedono navigazione autonoma del web, analisi di documenti, sintesi di report strutturati, operazioni che vanno oltre la semplice ricerca.

**Capacità chiave:**
- Pianificazione autonoma di task multi-fase
- Web browsing e navigazione dinamica
- Generazione di report, presentazioni, analisi dati
- Supporto connettori (Gmail, Notion, Google Calendar)
- Webhooks per notifiche real-time
- Compatibile con OpenAI SDK

**Endpoint principali:**
```
POST /v1/tasks       → Crea un task di ricerca autonomo
GET  /v1/tasks/{id}  → Polling dello stato
POST /v1/files       → Upload allegati/contesto
POST /v1/webhooks    → Ricezione risultati in push
```

**Pattern di utilizzo:**
```python
# Manus viene usato per task "grandi" che richiedono ore
task = manus.tasks.create(
    task="Analizza il mercato delle LLM APIs in Europa nel 2026. "
         "Produci un report con competitor, pricing, trend.",
    return_format="markdown_report"
)
# Attendi via webhook o polling
```

---

### 2. 🔵 Perplexity Sonar API — *The Synthesizer*

**Quando usarlo:** Domande che richiedono sintesi conversazionale con fonti real-time. Ottimo come primo passo per capire il panorama generale di un topic, o per rispondere a domande fattuali con citazioni immediate.

**Capacità chiave:**
- Accesso real-time al web
- Risposta con citazioni inline
- Modalità `sonar-deep-research` per research iterativo
- Output in markdown con fonti tracciate

**Pattern di utilizzo:**
```python
# Perplexity per overview rapida con citazioni
response = perplexity.chat.completions.create(
    model="sonar-deep-research",
    messages=[{"role": "user", "content": query}]
)
# Estrai citations da response.citations
```

---

### 3. 🟢 Tavily Search API — *The Grounder*

**Quando usarlo:** Grounding rapido di fatti, verifica di claim, ricerca di fonti primarie per una query specifica. Integrazione nativa con LangChain/LlamaIndex. Ideale in pipeline RAG per il retrieval step.

**Capacità chiave:**
- Ricerca AI-ottimizzata con snippet pronti per LLM
- Filtraggio per dominio, data, tipo contenuto
- `include_raw_content` per full-text
- Integrazione nativa con framework agentic

**Pattern di utilizzo:**
```python
# Tavily per grounding veloce
results = tavily.search(
    query=sub_query,
    search_depth="advanced",
    include_raw_content=True,
    max_results=10
)
```

---

### 4. 🟠 Firecrawl Agent — *The Extractor*

**Quando usarlo:** Estrazione strutturata da URL specifici o crawling autonomo senza URL predefiniti. Schema-first: definisci il JSON che vuoi, Firecrawl lo estrae. Perfetto per costruire dataset strutturati e RAG pipeline.

**Capacità chiave:**
- Endpoint `/agent` per ricerca autonoma senza URL
- Estrazione con schema Pydantic/Zod nativo
- JavaScript rendering
- Crawling profondo di siti interi
- Clean markdown per LLM consumption

**Pattern di utilizzo:**
```python
# Firecrawl per estrazione strutturata
schema = {
    "type": "object",
    "properties": {
        "company_name": {"type": "string"},
        "pricing_tiers": {"type": "array"},
        "founded_year": {"type": "integer"}
    }
}

result = firecrawl.agent.extract(
    prompt="Estrai info sui competitor di Tavily nel mercato search API",
    schema=schema
)
```

---

## Orchestrator Layer — Logica di Routing

L'orchestratore analizza la query e decide la strategia:

```python
class ResearchOrchestrator:
    
    def route(self, query: str, depth: str) -> ResearchPlan:
        """
        depth: "quick" | "standard" | "deep"
        """
        plan = ResearchPlan()
        
        if depth == "quick":
            # Solo Perplexity + Tavily
            plan.steps = [
                Step("perplexity", query, role="synthesis"),
                Step("tavily", query, role="grounding"),
            ]
        
        elif depth == "standard":
            # Decomposizione query + tutti gli strumenti
            sub_queries = self.decompose(query)  # LLM
            plan.steps = [
                Step("perplexity", query, role="overview"),
                *[Step("tavily", sq) for sq in sub_queries],
                Step("firecrawl", query, role="structured_extraction"),
            ]
        
        elif depth == "deep":
            # Manus come orchestratore + gli altri come tools
            plan.steps = [
                Step("manus", query, role="primary_agent"),
                Step("perplexity", query, role="parallel_synthesis"),
                *[Step("firecrawl", sq) for sq in self.decompose(query)],
                Step("fusion", None, role="merge_and_rank"),
            ]
        
        return plan
```

---

## Fusion Layer — Merge & Ranking

```python
class FusionEngine:
    
    def merge(self, results: list[ToolResult]) -> ResearchResult:
        # 1. Deduplicazione per URL e semantic similarity
        unique = self.deduplicate(results)
        
        # 2. Ranking per credibility score
        ranked = self.rank_by_credibility(unique)
        
        # 3. Citation tracking
        citations = self.extract_citations(ranked)
        
        # 4. Synthesis finale via LLM
        synthesis = self.synthesize(ranked, citations)
        
        return ResearchResult(
            summary=synthesis,
            sources=citations,
            raw_data=ranked,
            confidence_score=self.score(ranked)
        )
    
    def deduplicate(self, results):
        # Rimuovi duplicati per URL esatto
        # + embedding similarity per contenuti simili
        ...
    
    def rank_by_credibility(self, results):
        # Rank per: domain authority, recency, cross-source confirmation
        ...
```

---

## Output Formats

L'agente supporta output multipli:

| Format | Use case |
|--------|----------|
| `markdown_report` | Report narrativo con sezioni e citazioni |
| `structured_json` | Dati strutturati per database/API |
| `executive_summary` | Sintesi 1-page per decision maker |
| `rag_chunks` | Chunks ottimizzati per ingestion RAG |
| `citations_list` | Solo fonti con snippet, per verifica |

---

## Stack Tecnico Consigliato

```
Runtime:        Python 3.12+
Framework:      LangChain o LangGraph (per orchestrazione)
LLM:            Claude Sonnet 4.6 / GPT-5 (orchestratore)
Storage:        PostgreSQL + pgvector (per dedup semantico)
Queue:          Redis / Celery (per task asincroni Manus)
API Gateway:    FastAPI
Caching:        Redis (query cache, 1h TTL)
Monitoring:     OpenTelemetry + Langfuse (tracing LLM)
```

---

## Integrazione Manus API — Step by Step

### 1. Setup
```python
import httpx

MANUS_API_KEY = "your_api_key"
MANUS_BASE_URL = "https://open.manus.im"

headers = {
    "Authorization": f"Bearer {MANUS_API_KEY}",
    "Content-Type": "application/json"
}
```

### 2. Crea un Task di Research
```python
async def create_research_task(query: str, webhook_url: str):
    payload = {
        "task": query,
        "webhook_url": webhook_url,  # ricevi risultati in push
        "return_format": "markdown"
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{MANUS_BASE_URL}/v1/tasks",
            json=payload,
            headers=headers
        )
        return response.json()  # {"task_id": "..."}
```

### 3. Webhook Handler
```python
from fastapi import FastAPI, Request

app = FastAPI()

@app.post("/webhooks/manus")
async def manus_webhook(request: Request):
    data = await request.json()
    task_id = data["task_id"]
    result = data["result"]
    
    # Passa al fusion layer
    await fusion_engine.ingest_manus_result(task_id, result)
```

### 4. Polling Fallback
```python
async def poll_task(task_id: str, max_wait: int = 300):
    start = time.time()
    while time.time() - start < max_wait:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{MANUS_BASE_URL}/v1/tasks/{task_id}",
                headers=headers
            )
            data = r.json()
            if data["status"] == "completed":
                return data["result"]
            await asyncio.sleep(5)
```

---

## Flusso Completo — Esempio

```
Query: "Analizza lo stato dell'arte dei framework agentic AI nel 2026"

1. ORCHESTRATOR
   ├── Decompose → ["LangChain vs LangGraph", "CrewAI", "AutoGen", 
   │                "trend adoption enterprise", "benchmark comparison"]
   └── Depth: "deep" → routing a tutti gli strumenti

2. PARALLEL EXECUTION
   ├── Manus    → Task completo con report strutturato (async, ~10 min)
   ├── Perplexity → Overview sintetica con citazioni (5 sec)
   ├── Tavily   → [5 sub-query in parallelo] (10 sec)
   └── Firecrawl → Estrazione structured data da top 20 URLs (30 sec)

3. FUSION
   ├── Dedup: 340 → 89 fonti uniche
   ├── Rank: score per domain authority + recency
   ├── Merge: risultati Manus arricchiti da Firecrawl structured data
   └── Synthesize: LLM final synthesis con citazioni tracciate

4. OUTPUT
   └── markdown_report: 15 pagine con 89 fonti citate, executive summary, 
       tabelle comparative, confidence score: 0.94
```

---

## Metriche di Qualità

| Metrica | Target |
|---------|--------|
| Source coverage | > 50 fonti per query deep |
| Dedup rate | > 60% riduzione duplicati |
| Citation accuracy | 100% fonti verificabili |
| Latency (quick) | < 30 sec |
| Latency (deep) | < 15 min |
| Confidence score | > 0.85 per report finale |

---

## Next Steps

- [ ] Definire schema API pubblica dell'agente
- [ ] Implementare `ResearchOrchestrator` con LangGraph
- [ ] Setup Manus API key e webhook server
- [ ] Implementare Fusion Engine con pgvector per dedup semantico
- [ ] Aggiungere Langfuse per tracing e debug
- [ ] Costruire test suite con query benchmark
- [ ] Valutare aggiunta di Exa.ai come 5° strumento (semantic search)

---

*Blueprint v0.1 — DurinClawBot ⛏️*
