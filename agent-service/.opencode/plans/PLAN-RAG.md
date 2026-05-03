# RAG SOTA Strategies Implementation Plan

## Overview

Implement all state-of-the-art RAG strategies defined in `core/types.py` (`RagStrategy` enum) plus additional SOTA patterns. The existing `SIMPLE` strategy (`LangChainSimpleRAG`) serves as the foundation. This plan adds GRAPH, AGENTIC, HYBRID, plus advanced patterns: Reranking, Contextual Compression, CRAG, Self-RAG, and Multi-hop retrieval.

## Stack Detected

- **Python 3.14+** (from `pyproject.toml`)
- **LangChain 1.0+** (`langchain>=1.0.0`, `langchain-core>=1.3.0`)
- **LangGraph 1.1+** (`langgraph>=1.1.0`)
- **FastEmbed 0.4+** (local ONNX embeddings)
- **Voyage AI** (cloud embeddings)
- **PyMuPDF** (PDF extraction)

## Architecture

All strategies follow the existing provider pattern:

```
core/
├── rag.py                    # Abstract RAG + Retriever base classes
├── types.py                  # RagStrategy enum, RagConfig, etc.
├── factory.py                # create_rag(), create_retriever()
└── providers/
    ├── __init__.py           # Registries
    └── langchain/
        ├── rag.py            # LangChainSimpleRAG (existing)
        ├── rag_graph.py      # [NEW] LangChainGraphRAG
        ├── rag_hybrid.py     # [NEW] LangChainHybridRAG
        ├── rag_agentic.py    # [NEW] LangChainAgenticRAG
        ├── rag_crag.py       # [NEW] LangChainCRAG
        └── rag_self.py       # [NEW] LangChainSelfRAG
```

---

## Strategy 1: GRAPH RAG

**Description:** Knowledge graph traversal for structured context retrieval. Extracts entities and relationships from documents, stores in a graph database, and traverses the graph to build contextual sub-graphs for answering queries.

### Sources
- LangChain Graph RAG: https://python.langchain.com/docs/integrations/graphs/
- Neo4j Graph RAG: https://neo4j.com/developer-blog/genai-applications-how-to/
- Microsoft GraphRAG: https://microsoft.github.io/graphrag/

### Tasks

#### Task 1: Graph Store Configuration Types

**Description:** Extend `GraphStoreConfig` in `core/types.py` to support multiple graph providers (Neo4j, NetworkX in-memory, FalkorDB).

**Acceptance criteria:**
- [ ] `GraphStoreConfig` supports `provider` values: `neo4j`, `networkx`, `falkordb`
- [ ] Each provider has appropriate connection fields
- [ ] Backward-compatible with existing config

**Verification:**
- [ ] `pydantic` validation passes for all provider configs
- [ ] Existing code using `GraphStoreConfig` still works

**Files likely touched:**
- `src/core/types.py`

**Estimated scope:** Small (1 file)

---

#### Task 2: GraphStore Abstract Interface

**Description:** Create abstract `GraphStore` base class in `core/` for graph database operations.

**Acceptance criteria:**
- [ ] Abstract methods: `add_triplet`, `query`, `get_subgraph`, `extract_entities`
- [ ] Async and sync variants
- [ ] No framework-specific imports

**Verification:**
- [ ] Type checks pass with mypy/pyright
- [ ] Can be subclassed without errors

**Files likely touched:**
- `src/core/graph_store.py` (new)
- `src/core/__init__.py`

**Estimated scope:** Small (2 files)

---

#### Task 3: NetworkX In-Memory GraphStore

**Description:** Implement `NetworkXGraphStore` as a lightweight, in-memory graph store for testing and small datasets.

**Acceptance criteria:**
- [ ] Implements all `GraphStore` abstract methods
- [ ] Supports entity extraction via simple NLP (spaCy or regex fallback)
- [ ] Query via pattern matching
- [ ] Subgraph extraction by entity proximity

**Verification:**
- [ ] Unit tests for add/query/subgraph
- [ ] Integration test with sample text

**Files likely touched:**
- `src/core/providers/networkx/graph_store.py` (new)
- `src/core/providers/networkx/__init__.py` (new)
- `src/core/providers/__init__.py`

**Dependencies:** Task 2

**Estimated scope:** Medium (3-4 files)

---

#### Task 4: Neo4j GraphStore Provider

**Description:** Implement `Neo4jGraphStore` using the official Neo4j Python driver.

**Acceptance criteria:**
- [ ] Async connection pool management
- [ ] Cypher query execution
- [ ] Entity/relation ingestion from text
- [ ] Subgraph traversal for context building

**Verification:**
- [ ] Unit tests with mocked Neo4j
- [ ] Integration test with local Neo4j (docker)

**Files likely touched:**
- `src/core/providers/neo4j/graph_store.py` (new)
- `src/core/providers/neo4j/__init__.py` (new)
- `src/core/providers/__init__.py`
- `pyproject.toml` (add neo4j driver)

**Dependencies:** Task 2

**Estimated scope:** Medium (4-5 files)

---

#### Task 5: LangChainGraphRAG Implementation

**Description:** Implement `LangChainGraphRAG` — the GRAPH strategy provider. Retrieves by traversing the knowledge graph to find relevant entities and their relationships, then formats as context.

**Acceptance criteria:**
- [ ] Extends `RAG` abstract class
- [ ] `answer()`: Extract query entities → traverse graph → format subgraph → generate
- [ ] `astream()`: Streaming with graph traversal progress events
- [ ] Registered in `RAG_REGISTRY["graph"]`
- [ ] Configurable via `RagConfig(strategy="graph", graph_store=...)`

**Verification:**
- [ ] Unit tests with mock graph store
- [ ] Integration test with NetworkX store
- [ ] Compare answer quality vs SIMPLE strategy

**Files likely touched:**
- `src/core/providers/langchain/rag_graph.py` (new)
- `src/core/providers/langchain/__init__.py`

**Dependencies:** Tasks 2, 3

**Estimated scope:** Medium (3-4 files)

---

## Strategy 2: HYBRID RAG

**Description:** Combines dense vector retrieval with sparse (BM25) or graph retrieval. Results are fused using reciprocal rank fusion (RRF) or learned weighting.

### Sources
- LangChain Ensemble Retriever: https://python.langchain.com/docs/how_to/ensemble_retriever/
- BM25 Retriever: https://python.langchain.com/docs/integrations/retrievers/bm25/
- Reciprocal Rank Fusion: https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf

### Tasks

#### Task 6: BM25 Retriever Provider

**Description:** Implement a BM25-based sparse retriever using `rank_bm25` or LangChain's `BM25Retriever`.

**Acceptance criteria:**
- [ ] Implements `Retriever` abstract class
- [ ] Indexes text chunks with tokenization
- [ ] Returns scored results
- [ ] Async support

**Verification:**
- [ ] Test with sample corpus
- [ ] Compare results with vector retriever

**Files likely touched:**
- `src/core/providers/langchain/retriever_bm25.py` (new)
- `src/core/providers/langchain/__init__.py`
- `pyproject.toml` (add rank-bm25)

**Estimated scope:** Small (2-3 files)

---

#### Task 7: Reciprocal Rank Fusion Utility

**Description:** Implement RRF algorithm for fusing results from multiple retrievers.

**Acceptance criteria:**
- [ ] Function: `reciprocal_rank_fusion(results_lists, k=60) -> fused_results`
- [ ] Handles different result counts
- [ ] Preserves metadata from original results
- [ ] Configurable rank constant

**Verification:**
- [ ] Unit tests with known inputs/outputs
- [ ] Verify RRF formula correctness

**Files likely touched:**
- `src/core/fusion.py` (new)
- `src/core/__init__.py`

**Estimated scope:** Small (1-2 files)

---

#### Task 8: LangChainHybridRAG Implementation

**Description:** Implement `LangChainHybridRAG` — the HYBRID strategy provider. Uses LangChain's `EnsembleRetriever` or custom fusion to combine vector + BM25/graph results.

**Acceptance criteria:**
- [ ] Extends `RAG` abstract class
- [ ] Configurable retriever weights
- [ ] Supports vector+BM25 and vector+graph modes
- [ ] `answer()` and `astream()` implemented
- [ ] Registered in `RAG_REGISTRY["hybrid"]`

**Verification:**
- [ ] Test with both fusion modes
- [ ] Benchmark vs SIMPLE and GRAPH individually

**Files likely touched:**
- `src/core/providers/langchain/rag_hybrid.py` (new)
- `src/core/providers/langchain/__init__.py`

**Dependencies:** Tasks 6, 7

**Estimated scope:** Medium (3-4 files)

---

## Strategy 3: AGENTIC RAG

**Description:** The agent loop decides when and what to retrieve. Instead of a single retrieve-then-generate step, the agent can iteratively retrieve, reflect, and retrieve again based on what it has learned.

### Sources
- LangGraph Agentic RAG: https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_agentic_rag/
- LangChain Adaptive RAG: https://blog.langchain.dev/agentic-rag-with-langgraph/

### Tasks

#### Task 9: Retrieval Decision Node

**Description:** Create a LangGraph node that determines whether retrieval is needed based on the current state.

**Acceptance criteria:**
- [ ] Node: `should_retrieve(state) -> Literal["retrieve", "generate", "reflect"]`
- [ ] Uses LLM to assess if current context is sufficient
- [ ] Configurable max retrieval rounds

**Verification:**
- [ ] Test with questions needing single/multiple/no retrieval
- [ ] Verify termination conditions

**Files likely touched:**
- `src/core/providers/langchain/rag_agentic.py` (new, partial)

**Estimated scope:** Medium (part of larger file)

---

#### Task 10: LangChainAgenticRAG Implementation

**Description:** Full agentic RAG as a LangGraph state machine with nodes: retrieve, generate, reflect, decide.

**Acceptance criteria:**
- [ ] LangGraph state machine with conditional edges
- [ ] State: `{messages, retrieved_chunks, retrieval_count, max_retrievals}`
- [ ] Nodes: `retrieve`, `generate`, `reflect`, `decide_next`
- [ ] `answer()` runs the graph to completion
- [ ] `astream()` streams node outputs as events
- [ ] Registered in `RAG_REGISTRY["agentic"]`

**Verification:**
- [ ] Test multi-hop questions
- [ ] Verify no infinite loops
- [ ] Compare with SIMPLE on complex queries

**Files likely touched:**
- `src/core/providers/langchain/rag_agentic.py`
- `src/core/providers/langchain/__init__.py`

**Dependencies:** Task 9

**Estimated scope:** Large (4-6 files) — break into sub-tasks if needed

---

## Strategy 4: RERANKING

**Description:** After initial retrieval, use a cross-encoder reranker to re-score results for higher precision. This is a retrieval enhancement applicable to any strategy.

### Sources
- LangChain Cross-Encoder Reranker: https://python.langchain.com/docs/integrations/document_transformers/contextual_compression/
- Cohere Rerank: https://docs.cohere.com/docs/rerank-2
- Voyage Rerank: https://docs.voyageai.com/docs/reranker

### Tasks

#### Task 11: Reranker Abstract Interface

**Description:** Create abstract `Reranker` base class for re-scoring retrieved results.

**Acceptance criteria:**
- [ ] Method: `rerank(query, documents, top_k) -> reranked_documents`
- [ ] Supports local (cross-encoder) and API (Cohere, Voyage) providers
- [ ] Returns scored and ordered results

**Verification:**
- [ ] Type checks pass
- [ ] Can be subclassed

**Files likely touched:**
- `src/core/reranker.py` (new)
- `src/core/__init__.py`

**Estimated scope:** Small (2 files)

---

#### Task 12: Voyage Rerank Provider

**Description:** Implement `VoyageReranker` using the Voyage AI reranking API.

**Acceptance criteria:**
- [ ] Uses existing Voyage AI client infrastructure
- [ ] Async API calls
- [ ] Configurable model and top_k

**Verification:**
- [ ] Test with sample query/documents
- [ ] Verify score ordering

**Files likely touched:**
- `src/core/providers/voyage/reranker.py` (new)
- `src/core/providers/voyage/__init__.py` (new)
- `src/core/providers/__init__.py`

**Estimated scope:** Small (3 files)

---

#### Task 13: Cross-Encoder Local Reranker

**Description:** Implement `CrossEncoderReranker` using `sentence-transformers` cross-encoder models.

**Acceptance criteria:**
- [ ] Loads model on first use (lazy)
- [ ] Batch inference for efficiency
- [ ] Configurable model (ms-marco-MiniLM, etc.)

**Verification:**
- [ ] Test with sample data
- [ ] Benchmark latency vs API reranker

**Files likely touched:**
- `src/core/providers/cross_encoder/reranker.py` (new)
- `src/core/providers/cross_encoder/__init__.py` (new)
- `pyproject.toml` (add sentence-transformers)

**Estimated scope:** Small (3-4 files)

---

#### Task 14: RerankingRetriever Wrapper

**Description:** Create a retriever wrapper that applies reranking after initial retrieval.

**Acceptance criteria:**
- [ ] Wraps any `Retriever` implementation
- [ ] Applies reranker to initial results
- [ ] Configurable: initial top_k, final top_k
- [ ] Works with all RAG strategies

**Verification:**
- [ ] Test with SIMPLE RAG
- [ ] Verify improved precision on sample queries

**Files likely touched:**
- `src/core/providers/langchain/retriever_rerank.py` (new)
- `src/core/providers/langchain/__init__.py`

**Dependencies:** Tasks 11-13

**Estimated scope:** Small (2 files)

---

## Strategy 5: CONTEXTUAL COMPRESSION

**Description:** Instead of returning full retrieved chunks, compress each chunk to only the relevant parts for the query. Reduces context window usage and improves signal-to-noise.

### Sources
- LangChain Contextual Compression: https://python.langchain.com/docs/how_to/contextual_compression/
- LLM Chain Filter: https://python.langchain.com/docs/integrations/document_transformers/llm_chain_filter/

### Tasks

#### Task 15: Contextual Compressor Implementation

**Description:** Implement document transformers that compress retrieved chunks.

**Acceptance criteria:**
- [ ] `LLMChainFilter`: Uses LLM to extract relevant sentences
- [ ] `EmbeddingFilter`: Uses embedding similarity at sentence level
- [ ] Both implement LangChain `BaseDocumentTransformer` interface
- [ ] Integrates with retriever pipeline

**Verification:**
- [ ] Test compression ratio
- [ ] Verify answer quality maintained

**Files likely touched:**
- `src/core/providers/langchain/compressor.py` (new)
- `src/core/providers/langchain/__init__.py`

**Estimated scope:** Medium (2-3 files)

---

## Strategy 6: CRAG (Corrective RAG)

**Description:** Evaluates retrieved documents for relevance. If irrelevant, corrects by modifying the query or falling back to web search. Three actions: Correct, Rewrite, or Fallback.

### Sources
- LangGraph CRAG: https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_crag/
- CRAG Paper: https://arxiv.org/abs/2401.15884

### Tasks

#### Task 16: Document Grading Node

**Description:** Create a node that grades retrieved documents for relevance to the query.

**Acceptance criteria:**
- [ ] LLM-based relevance grader
- [ ] Returns: `relevant`, `irrelevant`, `ambiguous`
- [ ] Configurable threshold

**Verification:**
- [ ] Test with relevant/irrelevant documents
- [ ] Verify grading accuracy

**Files likely touched:**
- `src/core/providers/langchain/rag_crag.py` (new, partial)

**Estimated scope:** Medium (part of larger file)

---

#### Task 17: LangChainCRAG Implementation

**Description:** Full CRAG as a LangGraph state machine: retrieve → grade → (correct | rewrite query | fallback) → generate.

**Acceptance criteria:**
- [ ] LangGraph state machine
- [ ] Nodes: `retrieve`, `grade_documents`, `rewrite_query`, `fallback_search`, `generate`
- [ ] Conditional edges based on grade
- [ ] Fallback search via Tavily or similar
- [ ] Registered in `RAG_REGISTRY["crag"]`

**Verification:**
- [ ] Test with queries where initial retrieval is poor
- [ ] Verify fallback triggers correctly

**Files likely touched:**
- `src/core/providers/langchain/rag_crag.py`
- `src/core/providers/langchain/__init__.py`
- `pyproject.toml` (add tavily-python)

**Dependencies:** Task 16

**Estimated scope:** Large (5-7 files)

---

## Strategy 7: SELF-RAG

**Description:** The model self-reflects on its own generation, checking for hallucination and relevance. If issues detected, retrieves again and regenerates.

### Sources
- Self-RAG Paper: https://arxiv.org/abs/2310.11511
- LangGraph Self-RAG: https://langchain-ai.github.io/langgraph/tutorials/rag/langgraph_self_rag/

### Tasks

#### Task 18: Self-Reflection Node

**Description:** Create a node that evaluates generated answers for hallucination and relevance.

**Acceptance criteria:**
- [ ] LLM-based hallucination detector
- [ ] Returns: `supported`, `partially_supported`, `unsupported`
- [ ] Returns: `relevant`, `irrelevant` for query alignment

**Verification:**
- [ ] Test with factual and hallucinated answers
- [ ] Verify detection accuracy

**Files likely touched:**
- `src/core/providers/langchain/rag_self.py` (new, partial)

**Estimated scope:** Medium (part of larger file)

---

#### Task 19: LangChainSelfRAG Implementation

**Description:** Full Self-RAG as a LangGraph state machine: retrieve → generate → reflect → (regenerate | retrieve again | return).

**Acceptance criteria:**
- [ ] LangGraph state machine
- [ ] Nodes: `retrieve`, `generate`, `reflect_on_generation`, `decide_action`
- [ ] Conditional edges based on reflection
- [ ] Configurable max regeneration rounds
- [ ] Registered in `RAG_REGISTRY["self_rag"]`

**Verification:**
- [ ] Test with queries prone to hallucination
- [ ] Verify regeneration improves accuracy

**Files likely touched:**
- `src/core/providers/langchain/rag_self.py`
- `src/core/providers/langchain/__init__.py`

**Dependencies:** Task 18

**Estimated scope:** Large (5-7 files)

---

## Strategy 8: MULTI-HOP RETRIEVAL

**Description:** Sequential retrieval where each step's results inform the next query. Implements HyDE (Hypothetical Document Embeddings) and step-back prompting.

### Sources
- HyDE Paper: https://arxiv.org/abs/2212.10496
- Step-Back Prompting: https://arxiv.org/abs/2310.06117

### Tasks

#### Task 20: HyDE Retriever

**Description:** Generate a hypothetical answer, embed it, and use that embedding for retrieval.

**Acceptance criteria:**
- [ ] Generates hypothetical answer using LLM
- [ ] Embeds hypothetical answer (not the query)
- [ ] Retrieves based on hypothetical embedding
- [ ] Implements `Retriever` interface

**Verification:**
- [ ] Test vs standard retrieval on factual queries
- [ ] Measure recall improvement

**Files likely touched:**
- `src/core/providers/langchain/retriever_hyde.py` (new)
- `src/core/providers/langchain/__init__.py`

**Estimated scope:** Medium (2-3 files)

---

#### Task 21: Step-Back Retriever

**Description:** Generate a higher-level "step-back" question, retrieve for both the original and step-back question, then combine results.

**Acceptance criteria:**
- [ ] LLM generates step-back question
- [ ] Retrieves for both questions
- [ ] Combines results (deduplicated)
- [ ] Implements `Retriever` interface

**Verification:**
- [ ] Test with complex reasoning questions
- [ ] Verify broader context retrieval

**Files likely touched:**
- `src/core/providers/langchain/retriever_stepback.py` (new)
- `src/core/providers/langchain/__init__.py`

**Estimated scope:** Medium (2-3 files)

---

## New RagStrategy Enum Values

Update `core/types.py`:

```python
class RagStrategy(str, Enum):
    SIMPLE = "simple"
    GRAPH = "graph"
    AGENTIC = "agentic"
    HYBRID = "hybrid"
    CRAG = "crag"
    SELF_RAG = "self_rag"
```

## Configuration Extensions

Add to `RagConfig`:

```python
class RagConfig(BaseModel):
    # ... existing fields ...
    reranker: RerankerConfig | None = None
    compressor: CompressorConfig | None = None
    max_retrieval_rounds: int = 3  # for agentic/self-rag
    fallback_search_provider: str | None = None  # for CRAG
```

## Dependencies to Add

```toml
# pyproject.toml additions
[project.optional-dependencies]
rag-graph = ["neo4j>=5.0.0", "networkx>=3.0"]
rag-hybrid = ["rank-bm25>=0.2.2"]
rag-rerank = ["sentence-transformers>=2.2.0", "voyageai>=0.3.0"]
rag-crag = ["tavily-python>=0.3.0"]
rag-all = ["agent-service[rag-graph,rag-hybrid,rag-rerank,rag-crag]"]
```

## Verification Checklist

- [ ] All strategies registered in `RAG_REGISTRY`
- [ ] Factory `create_rag()` dispatches correctly by strategy
- [ ] Each strategy has unit tests
- [ ] Integration tests with real data
- [ ] Benchmark comparison across strategies
- [ ] API endpoints expose all strategies
- [ ] Documentation for each strategy
- [ ] Source citations in code comments

## Checkpoint: After Tasks 1-5 (GRAPH RAG)
- [ ] GRAPH RAG answers questions using graph traversal
- [ ] NetworkX store works for testing
- [ ] Neo4j store works with local docker instance

## Checkpoint: After Tasks 6-8 (HYBRID RAG)
- [ ] HYBRID RAG fuses vector + BM25 results
- [ ] RRF fusion produces better results than either alone

## Checkpoint: After Tasks 9-10 (AGENTIC RAG)
- [ ] AGENTIC RAG handles multi-hop questions
- [ ] No infinite loops in retrieval cycle

## Checkpoint: After Tasks 11-14 (RERANKING)
- [ ] Reranking improves precision over base retrieval
- [ ] Works as wrapper with any retriever

## Checkpoint: After Tasks 15 (COMPRESSION)
- [ ] Compression reduces context size by >50%
- [ ] Answer quality maintained

## Checkpoint: After Tasks 16-17 (CRAG)
- [ ] CRAG falls back to search when retrieval is poor
- [ ] Grading correctly identifies irrelevant documents

## Checkpoint: After Tasks 18-19 (SELF-RAG)
- [ ] Self-RAG detects and corrects hallucinations
- [ ] Regeneration improves answer quality

## Checkpoint: After Tasks 20-21 (MULTI-HOP)
- [ ] HyDE improves recall for factual queries
- [ ] Step-back improves context for complex questions
