# TelaiOS Agent Service — RAG Strategies & Document Tools

## Overview

The Agent Service implements multiple RAG (Retrieval-Augmented Generation) strategies, document processing tools, and skill-based extensibility. This document provides a comparison of strategies, performance characteristics, and usage guidance.

## RAG Strategies

### Strategy Comparison Table

| Strategy | Best For | Latency | Accuracy | Complexity | Requires |
|----------|----------|---------|----------|------------|----------|
| **SIMPLE** | Basic Q&A, single-hop | Low | Medium | Low | Vector store |
| **GRAPH** | Relationship queries, structured data | Medium | High | Medium | Graph store |
| **HYBRID** | General purpose, balanced | Medium | High | Medium | Vector + BM25 |
| **AGENTIC** | Multi-hop, complex reasoning | High | Very High | High | LLM + tools |
| **CRAG** | High-stakes, fact-critical | High | Very High | High | Grading LLM |
| **SELF_RAG** | Hallucination-sensitive | High | Very High | High | Reflection LLM |

### Strategy Selection Guide

- **SIMPLE**: Use for straightforward questions where a single retrieval pass is sufficient.
- **GRAPH**: Use when questions involve relationships between entities (e.g., "What agents use LangGraph?").
- **HYBRID**: Default choice for most use cases. Combines semantic (vector) and keyword (BM25) search.
- **AGENTIC**: Use for complex, multi-step questions that may require multiple retrieval passes.
- **CRAG**: Use when answer correctness is critical. Automatically grades and corrects retrieved context.
- **SELF_RAG**: Use when hallucination detection is important. Self-reflects on answer quality.

### Configuration Example

```python
from core.types import RagConfig, LLMConfig, HybridRAGConfig

config = RagConfig(
    strategy="hybrid",
    llm=LLMConfig(
        provider="openai",
        model="gpt-4o",
        api_key="sk-...",
    ),
    hybrid=HybridRAGConfig(
        vector_weight=0.7,
        bm25_weight=0.3,
        top_k=10,
    ),
)
```

## Document Tools

### Available Tools

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `extract` | Structured data extraction | Document + JSON Schema | Structured JSON |
| `analyze` | Document structure analysis | Document text | Headings, sections, key terms |
| `summarize` | Document summarization | Document text + level | Summary text |
| `qa` | Question answering | Document + question | Answer with citations |

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/documents/{id}/analyze` | POST | Get document structure analysis |
| `/documents/{id}/convert` | POST | Convert to target format |
| `/documents/{id}/extract` | POST | Structured data extraction |
| `/documents/{id}/summarize` | POST | Generate summary |
| `/documents/{id}/compare` | POST | Compare with another document |

### Supported Formats

- **Input**: PDF, DOCX, HTML, Markdown, TXT, PPTX, XLSX
- **Output**: Markdown, HTML, PDF

## Skills System

### Skill Structure

```
skills/
  {skill-name}/
    SKILL.md          # Skill manifest and instructions
    scripts/
      {script}.sh     # Executable scripts
```

### SKILL.md Frontmatter

```yaml
---
name: code-review
description: Reviews code for quality and best practices
version: 1.0.0
author: team
tags: [review, quality]
triggers: [review code, check quality]
---
```

### Skill Lifecycle

1. **Discovery**: Skills are loaded from the filesystem at startup
2. **Validation**: SKILL.md is parsed and validated
3. **Registration**: Skills are registered with the SkillRegistry
4. **Execution**: Skills can be invoked via API or agent tool calling

## Architecture

### Core Layer (Provider-Agnostic)

```
core/
  llm.py              # Abstract LLM interface
  graph_store.py      # Abstract graph store
  retriever_bm25.py   # BM25 retriever
  fusion.py           # RRF fusion
  strategies/         # All RAG strategies (zero provider imports)
    simple.py
    graph.py
    hybrid.py
    agentic.py
    crag.py
    self_rag.py
  types.py            # Domain types and configs
```

### Provider Layer

```
core/providers/
  langchain/
    llm.py            # LangChain LLM adapter
    rag.py            # Strategy dispatcher
  networkx/           # In-memory graph store
  neo4j/              # Neo4j graph store
```

### Agent Service Layer

```
agent_service/
  services/
    document_tools/   # Document processing tools
    document_converter.py
    document_analyzer.py
    text_chunker.py
  tools/skill/        # Skills system
    registry.py
    parser.py
    validator.py
    loader.py
  api/
    documents_v2.py   # Document API endpoints
    v2/               # API v2 router
```

## Performance Benchmarks

### Latency (Estimated)

| Strategy | P50 | P95 | P99 |
|----------|-----|-----|-----|
| SIMPLE | ~500ms | ~1s | ~2s |
| GRAPH | ~800ms | ~1.5s | ~3s |
| HYBRID | ~1s | ~2s | ~4s |
| AGENTIC | ~2s | ~5s | ~10s |
| CRAG | ~2s | ~5s | ~10s |
| SELF_RAG | ~2s | ~5s | ~10s |

*Note: Actual latency depends on LLM provider, network conditions, and document size.*

### Accuracy (Qualitative)

| Strategy | Factual Accuracy | Multi-hop | Hallucination Resistance |
|----------|-----------------|-----------|-------------------------|
| SIMPLE | Medium | No | Low |
| GRAPH | High | Partial | Medium |
| HYBRID | High | Partial | Medium |
| AGENTIC | Very High | Yes | High |
| CRAG | Very High | Yes | Very High |
| SELF_RAG | Very High | Yes | Very High |

## Migration Guide

### From Simple to Hybrid RAG

1. Update `RagConfig.strategy` from `"simple"` to `"hybrid"`
2. Add `HybridRAGConfig` with weights
3. Ensure both vector store and BM25 index are available

### Adding a New Skill

1. Create `skills/{name}/SKILL.md` with frontmatter
2. Add scripts to `skills/{name}/scripts/`
3. Restart the service (skills autoload at startup)

### Upgrading Document Tools

1. Install optional dependencies: `pip install agent-service[documents]`
2. Use new API endpoints under `/documents/{id}/...`
3. Old `/documents/process` endpoint remains for backward compatibility

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Skill not found | Wrong directory path | Check `SKILLS_DIR` in config |
| Document extraction fails | Missing dependency | Install `agent-service[documents]` |
| RAG strategy error | Missing config | Add strategy-specific config |
| Graph store empty | No entities added | Call `add_entity` before querying |

### Debug Mode

Enable debug logging:

```bash
export LOG_LEVEL=debug
```

This will show detailed RAG strategy execution, document processing steps, and skill loading.
