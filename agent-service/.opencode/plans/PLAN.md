# Master Implementation Plan: RAG SOTA, Document Tools & Skills Compliance

## Overview

This plan covers three major initiatives for the `agent-service` Python microservice:

1. **RAG SOTA Strategies** — Implement all state-of-the-art retrieval-augmented generation patterns beyond the current SIMPLE strategy
2. **Document Manipulation Tools** — Build a comprehensive toolkit for PDF, Word, PowerPoint, Markdown, HTML, and other document formats
3. **Skills Management Compliance** — Align the internal skills system with the OpenCode skill specification (filesystem-based loading, SKILL.md parsing, reference indexing, packaging)

## Current State Summary

| Area | Status | Gap |
|------|--------|-----|
| SIMPLE RAG | ✅ Implemented (`LangChainSimpleRAG`) | — |
| GRAPH RAG | 📝 Defined in `RagStrategy` enum, not implemented | Needs graph DB provider, entity extraction, traversal logic |
| AGENTIC RAG | 📝 Defined in `RagStrategy` enum, not implemented | Needs retrieval decision nodes in agent loop |
| HYBRID RAG | 📝 Defined in `RagStrategy` enum, not implemented | Needs vector + graph/BM25 fusion |
| Reranking | ❌ Not planned | Cross-encoder reranking for precision |
| CRAG/Self-RAG | ❌ Not planned | Corrective/self-reflective retrieval |
| Document extraction | Basic (PDF/DOCX/XLSX) | Missing PPTX, HTML, OCR, tables, images |
| Document tools | None as agent tools | No structured tools for document manipulation |
| Skills filesystem | ❌ Not implemented | Skills passed as objects, not loaded from filesystem |
| SKILL.md parsing | ❌ Not implemented | No validation, indexing, or packaging |

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Keep `core/` framework-agnostic | Existing pattern; allows adding providers without modifying factory |
| Use LangChain as primary provider | Already integrated; leverage LangChain's retriever ecosystem |
| Add `unstructured` library for documents | Industry-standard for multi-format document processing |
| Skills loaded from filesystem at startup | Matches OpenCode specification; enables versioning and packaging |
| Each RAG strategy as separate provider class | Follows existing registry pattern; clean separation of concerns |

## Phase Structure

```
Phase 1: Foundation (Week 1-2)
├── Document extraction enhancements
├── Skill filesystem loader
└── RAG reranking infrastructure

Phase 2: Core RAG Strategies (Week 2-3)
├── GRAPH RAG implementation
├── HYBRID RAG implementation
└── Contextual compression

Phase 3: Advanced RAG (Week 3-4)
├── AGENTIC RAG implementation
├── CRAG (Corrective RAG)
├── Self-RAG
└── Multi-hop retrieval

Phase 4: Document Tools (Week 4-5)
├── Document manipulation tools for agents
├── Conversion pipeline
└── Structured extraction

Phase 5: Skills Compliance (Week 5-6)
├── Full filesystem-based skill management
├── SKILL.md validation
├── Skill packaging
└── Integration tests

Phase 6: Integration & Polish (Week 6-7)
├── End-to-end tests
├── API endpoints for all strategies
├── Documentation
└── Performance benchmarks
```

## Document Index

| Document | Description |
|----------|-------------|
| `PLAN-RAG.md` | Detailed RAG SOTA strategies implementation plan |
| `PLAN-DOCUMENTS.md` | Document manipulation tools implementation plan |
| `PLAN-SKILLS.md` | Skills management compliance implementation plan |
| `PLAN-SCHEDULE.md` | Dependency graph, scheduling, and parallelization guide |

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| LangChain API changes between versions | High | Pin versions; use lazy imports; test against current docs |
| Graph DB setup complexity | Medium | Start with in-memory graph; add Neo4j as optional provider |
| `unstructured` library size/dependencies | Medium | Use minimal install; optional extras per format |
| Skills filesystem conflicts with existing API | Low | Backward-compatible: support both object and filesystem loading |
| Embedding model compatibility across strategies | Medium | Abstract embedding interface; test all providers |

## Open Questions

1. Should HYBRID RAG combine vector + BM25 or vector + graph? (Recommend: both, configurable)
2. Should document tools be MCP servers or built-in tools? (Recommend: built-in first, MCP wrapper later)
3. Should skills be hot-reloadable or startup-only? (Recommend: startup-only, with explicit reload endpoint)
