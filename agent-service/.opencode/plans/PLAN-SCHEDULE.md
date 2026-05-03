# Dependency Graph & Scheduling Guide

## Overview

This document maps task dependencies across all three initiatives (RAG SOTA, Document Tools, Skills Compliance) and provides a scheduling strategy for iterative implementation sessions with multiple models/agents.

## Global Dependency Graph

```
                    ┌─────────────────────────────────────────────────┐
                    │              FOUNDATION LAYER                    │
                    │                                                  │
                    │  RAG: Tasks 1-2 (Graph types & interface)       │
                    │  RAG: Task 6 (BM25 Retriever)                   │
                    │  RAG: Task 7 (RRF Fusion)                       │
                    │  RAG: Task 11 (Reranker interface)              │
                    │  DOC: Tasks 1-5 (Enhanced extraction)           │
                    │  DOC: Task 7 (Smart chunking)                   │
                    │  SKL: Tasks 1-3 (Types, Parser, Validator)      │
                    │  SKL: Task 13 (Configuration)                   │
                    └──────────────┬──────────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │  CORE LAYER     │  │  CORE LAYER     │  │  CORE LAYER     │
    │                 │  │                 │  │                 │
    │  RAG: Task 3    │  │  RAG: Task 12   │  │  SKL: Task 4    │
    │  (NetworkX)     │  │  (Cross-Encoder) │  │  (Dir Scanner)  │
    │  RAG: Task 4    │  │  RAG: Task 15   │  │  SKL: Task 9    │
    │  (Neo4j)        │  │  (Compression)   │  │  (Packager)     │
    │  DOC: Task 6    │  │                 │  │  SKL: Task 10   │
    │  (Analyzer)     │  │                 │  │  (Installer)    │
    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
             │                    │                    │
             ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │  STRATEGY LAYER │  │  STRATEGY LAYER │  │  STRATEGY LAYER │
    │                 │  │                 │  │                 │
    │  RAG: Task 5    │  │  RAG: Task 14   │  │  SKL: Task 5    │
    │  (GraphRAG)     │  │  (RerankWrapper) │  │  (Registry)     │
    │  RAG: Task 8    │  │  RAG: Task 16   │  │  SKL: Task 6    │
    │  (HybridRAG)    │  │  (CRAG grade)    │  │  (ToolReg int.) │
    │  RAG: Task 9-10 │  │  RAG: Task 18   │  │  SKL: Task 7    │
    │  (AgenticRAG)   │  │  (Self-RAG ref) │  │  (Indexer)      │
    │  DOC: Tasks 8-9 │  │                 │  │  SKL: Task 11   │
    │  (Conversion)   │  │                 │  │  (Executor)     │
    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
             │                    │                    │
             ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │  ADVANCED LAYER │  │  ADVANCED LAYER │  │  ADVANCED LAYER │
    │                 │  │                 │  │                 │
    │  RAG: Task 17   │  │  RAG: Task 19   │  │  SKL: Task 12   │
    │  (CRAG full)    │  │  (Self-RAG full) │  │  (Script Tool)  │
    │  RAG: Task 20   │  │  DOC: Tasks 10  │  │  SKL: Task 8    │
    │  (HyDE)         │  │  (Extract tool) │  │  (API)          │
    │  RAG: Task 21   │  │  DOC: Task 11   │  │  SKL: Task 14   │
    │  (Step-Back)    │  │  (Summary tool) │  │  (Startup int.) │
    │                 │  │  DOC: Tasks 12  │  │                 │
    │                 │  │  (Compare tool) │  │                 │
    │                 │  │  DOC: Tasks 13  │  │                 │
    │                 │  │  (Q&A tool)     │  │                 │
    │                 │  │  DOC: Tasks 14  │  │                 │
    │                 │  │  (Metadata tool)│  │                 │
    │                 │  │  DOC: Tasks 15  │  │                 │
    │                 │  │  (Search tool)  │  │                 │
    └────────┬────────┘  └────────┬────────┘  └────────┬────────┘
             │                    │                    │
             └────────────────────┼────────────────────┘
                                  ▼
                    ┌─────────────────────────────────┐
                    │        INTEGRATION LAYER         │
                    │                                  │
                    │  DOC: Task 16 (API v2)          │
                    │  Cross-initiative tests          │
                    │  Performance benchmarks          │
                    │  Documentation                   │
                    └─────────────────────────────────┘
```

## Session Scheduling

### Session Model

Each session is designed to be completable by a single AI model in one focused interaction (~30-60 minutes). Sessions are grouped into waves that can run in parallel.

---

### Wave 1: Foundation (Parallel: 3 sessions)

**Session 1A: RAG Foundation**
- Tasks: RAG 1, 2, 6, 7, 11
- Scope: Graph types, GraphStore interface, BM25 retriever, RRF fusion, Reranker interface
- Files: `core/types.py`, `core/graph_store.py`, `core/fusion.py`, `core/reranker.py`, `core/providers/langchain/retriever_bm25.py`
- Verification: Type checks, unit tests for each component
- Estimated: 45 minutes

**Session 1B: Document Extraction Foundation**
- Tasks: DOC 1, 2, 3, 4, 5
- Scope: unstructured integration, PDF enhancement, PPTX, HTML/MD, Email extraction
- Files: `document_extractor.py`, `pyproject.toml`
- Verification: Test extraction for each format
- Estimated: 60 minutes

**Session 1C: Skills Core Foundation**
- Tasks: SKL 1, 2, 3, 13
- Scope: Skill types, SKILL.md parser, validator, configuration
- Files: `tools/skill/types.py`, `tools/skill/parser.py`, `tools/skill/validator.py`, `agent_service/config.py`
- Verification: Parse existing skills, validate, config works
- Estimated: 45 minutes

**Wave 1 Checkpoint:**
- [ ] All foundation types defined and validated
- [ ] All extractors working
- [ ] SKILL.md parsing and validation functional
- [ ] Configuration supports skills directory

---

### Wave 2: Core Implementation (Parallel: 3 sessions)

**Session 2A: RAG Core Providers**
- Tasks: RAG 3, 4, 12, 15
- Scope: NetworkX GraphStore, Neo4j GraphStore, Cross-Encoder reranker, Contextual compressor
- Files: `core/providers/networkx/`, `core/providers/neo4j/`, `core/providers/cross_encoder/`, `core/providers/langchain/compressor.py`
- Verification: Unit tests, integration tests with local services
- Dependencies: Wave 1 Session 1A
- Estimated: 60 minutes

**Session 2B: Document Analysis & Chunking**
- Tasks: DOC 6, 7
- Scope: Document structure analyzer, smart chunking strategies
- Files: `document_analyzer.py`, `chunkers.py`, `core/types.py` (ChunkingConfig)
- Verification: Test analysis accuracy, chunk quality comparison
- Dependencies: Wave 1 Session 1B
- Estimated: 45 minutes

**Session 2C: Skills Filesystem & Packaging**
- Tasks: SKL 4, 9, 10
- Scope: Directory scanner, skill packager, skill installer
- Files: `tools/skill/loader.py`, `tools/skill/packager.py`
- Verification: Scan skills directory, package/unpackage skills
- Dependencies: Wave 1 Session 1C
- Estimated: 45 minutes

**Wave 2 Checkpoint:**
- [ ] Graph stores functional (NetworkX + Neo4j)
- [ ] Reranking and compression working
- [ ] Document analysis and smart chunking operational
- [ ] Skills loadable from filesystem, packageable

---

### Wave 3: Strategy Implementation (Parallel: 3 sessions)

**Session 3A: GRAPH & HYBRID RAG**
- Tasks: RAG 5, 8
- Scope: LangChainGraphRAG, LangChainHybridRAG
- Files: `core/providers/langchain/rag_graph.py`, `core/providers/langchain/rag_hybrid.py`
- Verification: Answer quality comparison, benchmark vs SIMPLE
- Dependencies: Wave 2 Session 2A
- Estimated: 60 minutes

**Session 3B: Document Conversion**
- Tasks: DOC 8, 9
- Scope: Format conversion pipeline, merge/split tools
- Files: `document_converter.py`
- Verification: Round-trip conversions, merge/split accuracy
- Dependencies: Wave 2 Session 2B
- Estimated: 45 minutes

**Session 3C: Skills Registry & Integration**
- Tasks: SKL 5, 6, 7
- Scope: SkillRegistry, ToolRegistry integration, Skill Indexer
- Files: `tools/skill/registry.py`, `tools/skill/indexer.py`, `tools/registry.py`
- Verification: CRUD operations, search, tool registration
- Dependencies: Wave 2 Session 2C
- Estimated: 45 minutes

**Wave 3 Checkpoint:**
- [ ] GRAPH and HYBRID RAG strategies functional
- [ ] Document conversion working
- [ ] Skills fully integrated with ToolRegistry

---

### Wave 4: Advanced Strategies (Parallel: 3 sessions)

**Session 4A: AGENTIC RAG**
- Tasks: RAG 9, 10
- Scope: Retrieval decision node, full AgenticRAG LangGraph state machine
- Files: `core/providers/langchain/rag_agentic.py`
- Verification: Multi-hop questions, no infinite loops
- Dependencies: Wave 3 Session 3A
- Estimated: 60 minutes

**Session 4B: Document Agent Tools (Part 1)**
- Tasks: DOC 10, 11, 14
- Scope: Extract structured data, summarize, metadata tools
- Files: `document_tools/extract.py`, `document_tools/summarize.py`, `document_tools/analyze.py`
- Verification: Tool calling, output quality
- Dependencies: Wave 3 Session 3B
- Estimated: 60 minutes

**Session 4C: Skills Execution & API**
- Tasks: SKL 11, 12, 8
- Scope: Script executor, script-based tool, Skills API
- Files: `tools/skill/executor.py`, `tools/skill/adapter.py` (extend), `api/skills.py`
- Verification: Script execution, API endpoints
- Dependencies: Wave 3 Session 3C
- Estimated: 60 minutes

**Wave 4 Checkpoint:**
- [ ] AGENTIC RAG handles multi-hop retrieval
- [ ] Document tools callable by agents
- [ ] Skills API functional, scripts executable

---

### Wave 5: Advanced RAG + Document Tools (Parallel: 3 sessions)

**Session 5A: CRAG & Self-RAG**
- Tasks: RAG 16, 17, 18, 19
- Scope: CRAG grading + full implementation, Self-RAG reflection + full implementation
- Files: `core/providers/langchain/rag_crag.py`, `core/providers/langchain/rag_self.py`
- Verification: Fallback triggers, hallucination detection
- Dependencies: Wave 4 Session 4A
- Estimated: 90 minutes (large — consider splitting)

**Session 5B: Document Agent Tools (Part 2)**
- Tasks: DOC 12, 13, 15
- Scope: Compare, Q&A, search tools
- Files: `document_tools/analyze.py`, `document_tools/extract.py` (extend)
- Verification: Tool output quality, citation accuracy
- Dependencies: Wave 4 Session 4B, RAG strategies
- Estimated: 60 minutes

**Session 5C: Skills Startup Integration**
- Tasks: SKL 14
- Scope: FastAPI lifespan integration, autoload on startup
- Files: `agent_service/main.py`
- Verification: Startup with/without skills directory
- Dependencies: Wave 4 Session 4C
- Estimated: 30 minutes

**Wave 5 Checkpoint:**
- [ ] CRAG and Self-RAG functional
- [ ] All document tools implemented
- [ ] Skills autoload at startup

---

### Wave 6: Multi-Hop + API (Parallel: 2 sessions)

**Session 6A: Multi-Hop Retrievers**
- Tasks: RAG 14, 20, 21
- Scope: RerankingRetriever wrapper, HyDE retriever, Step-Back retriever
- Files: `core/providers/langchain/retriever_rerank.py`, `retriever_hyde.py`, `retriever_stepback.py`
- Verification: Recall improvement, context quality
- Dependencies: Wave 5 Session 5A
- Estimated: 60 minutes

**Session 6B: Document API v2**
- Tasks: DOC 16
- Scope: All document API endpoints
- Files: `api/documents_v2.py`, `main.py`
- Verification: All endpoints functional, async processing
- Dependencies: Wave 5 Session 5B
- Estimated: 45 minutes

**Wave 6 Checkpoint:**
- [ ] All retriever enhancements working
- [ ] Document API v2 complete

---

### Wave 7: Integration & Polish (Sequential: 2 sessions)

**Session 7A: Cross-Initiative Integration Tests**
- Scope: End-to-end tests combining RAG + Documents + Skills
- Test scenarios:
  1. Process document → index with GRAPH RAG → answer questions
  2. Load skills from filesystem → use document tools → execute scripts
  3. HYBRID RAG with reranking → compare answer quality
- Files: `tests/integration/`
- Estimated: 60 minutes

**Session 7B: Documentation & Benchmarks**
- Scope: README updates, strategy documentation, performance benchmarks
- Files: `README.md`, `docs/` (new)
- Deliverables:
  - Strategy comparison table
  - Performance benchmarks (latency, accuracy)
  - API documentation
  - Migration guide
- Estimated: 45 minutes

**Wave 7 Checkpoint:**
- [ ] All integration tests pass
- [ ] Documentation complete
- [ ] Benchmarks recorded

---

## Parallelization Summary

| Wave | Sessions | Can Run In Parallel | Total Wall Time |
|------|----------|---------------------|-----------------|
| 1 | 1A, 1B, 1C | ✅ Yes | ~60 minutes |
| 2 | 2A, 2B, 2C | ✅ Yes | ~60 minutes |
| 3 | 3A, 3B, 3C | ✅ Yes | ~60 minutes |
| 4 | 4A, 4B, 4C | ✅ Yes | ~60 minutes |
| 5 | 5A, 5B, 5C | ✅ Yes | ~90 minutes |
| 6 | 6A, 6B | ✅ Yes | ~60 minutes |
| 7 | 7A, 7B | ❌ Sequential | ~105 minutes |

**Total estimated wall time: ~7.5 hours** (with full parallelization)
**Total estimated agent time: ~14 hours** (sum of all sessions)

## Risk-Adjusted Schedule

If running with a single agent sequentially:

| Day | Sessions | Focus |
|-----|----------|-------|
| Day 1 | 1A, 1B, 1C | Foundation |
| Day 2 | 2A, 2B, 2C | Core providers |
| Day 3 | 3A, 3B, 3C | Strategy implementation |
| Day 4 | 4A, 4B, 4C | Advanced strategies |
| Day 5 | 5A, 5B, 5C | CRAG/Self-RAG + tools |
| Day 6 | 6A, 6B | Multi-hop + API |
| Day 7 | 7A, 7B | Integration + docs |

## Session Template

Each session should follow this structure:

```markdown
## Session [X]: [Title]

### Objectives
- [Task 1 description]
- [Task 2 description]

### Files to Read First
- [List of files to understand context]

### Implementation Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Verification
- [ ] Test 1
- [ ] Test 2

### Dependencies
- [List of previous sessions that must complete first]

### Success Criteria
- [Specific conditions that indicate session is complete]
```

## Context Management for Sessions

### What to Include in Session Context
1. Relevant plan document sections (PLAN-RAG.md, PLAN-DOCUMENTS.md, or PLAN-SKILLS.md)
2. Current file contents of files to be modified
3. Related type definitions from `core/types.py`
4. Existing provider implementations for reference

### What to Exclude
1. Unrelated plan documents
2. Future session tasks
3. Full test suites (only relevant tests)

## Handoff Protocol

When one session completes and another begins:

1. **Commit changes** with descriptive message
2. **Update checklist** in the relevant plan document
3. **Note any deviations** from the plan
4. **Flag any blockers** for the next session
5. **Run verification** tests and record results
