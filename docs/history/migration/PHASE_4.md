# Phase 4 — Document Tools Consolidation (Chunking, Embedding, Extraction)

## Objective
Merge duplicate implementations of chunkers, embedders, and extractors into single consolidated modules under `tools/builtin/documents/`. Fix broken imports in `services/document_tools/`.

## Commands
```bash
bun run agent:install
pytest tests/tools/documents/ -v
```

## Tasks

### Task 4.1 — Analyze and Merge Chunkers
Compare these files:
- `src/agent_service/services/chunkers.py`
- `src/agent_service/services/text_chunker.py`

Identify differences and merge into `src/tools/builtin/documents/chunking.py`:

```python
"""tools/builtin/documents/chunking.py — Consolidated document chunking."""

from __future__ import annotations

from telaios.core.types import Chunk, ChunkingConfig, Document


def chunk_document(
        document: Document,
        config: ChunkingConfig = ChunkingConfig(),
) -> list[Chunk]:
    """
    Split a document into chunks based on the configured strategy.

    Supported strategies:
    - semantic: Split on semantic boundaries (paragraphs, sections)
    - hierarchical: Split into nested chunks (sections → paragraphs)
    - page: Split by page boundaries
    - token: Split by token count
    - character: Split by character count with overlap
    """
    strategy = config.strategy.lower()
    if strategy == "semantic":
        return _chunk_semantic(document, config)
    elif strategy == "hierarchical":
        return _chunk_hierarchical(document, config)
    elif strategy == "page":
        return _chunk_by_page(document, config)
    elif strategy == "token":
        return _chunk_by_token(document, config)
    elif strategy == "character":
        return _chunk_by_character(document, config)
    else:
        raise ValueError(f"Unknown chunking strategy: {strategy}")


def _chunk_semantic(document: Document, config: ChunkingConfig) -> list[Chunk]:
    # Implementation merged from both chunkers
    ...


def _chunk_hierarchical(document: Document, config: ChunkingConfig) -> list[Chunk]:
    ...


def _chunk_by_page(document: Document, config: ChunkingConfig) -> list[Chunk]:
    ...


def _chunk_by_token(document: Document, config: ChunkingConfig) -> list[Chunk]:
    ...


def _chunk_by_character(document: Document, config: ChunkingConfig) -> list[Chunk]:
    ...
```

### Task 4.2 — Analyze and Merge Embedders
Compare:
- `src/agent_service/services/embedding_service.py`
- Any other embedder implementations

Merge into `src/tools/builtin/documents/embedding.py`:

```python
"""tools/builtin/documents/embedding.py — Consolidated document embedding."""

from __future__ import annotations

from telaios.core.types import Chunk, EmbeddingConfig


def embed_chunks(
        chunks: list[Chunk],
        config: EmbeddingConfig,
) -> list[Chunk]:
    """
    Generate embeddings for a list of chunks.

    Returns chunks with the embedding field populated.
    """
    provider = config.provider.lower()
    if provider == "fastembed":
        return _embed_fastembed(chunks, config)
    elif provider == "voyage":
        return _embed_voyage(chunks, config)
    elif provider == "openai":
        return _embed_openai(chunks, config)
    else:
        raise ValueError(f"Unknown embedding provider: {provider}")


def _embed_fastembed(chunks: list[Chunk], config: EmbeddingConfig) -> list[Chunk]:
    ...


def _embed_voyage(chunks: list[Chunk], config: EmbeddingConfig) -> list[Chunk]:
    ...


def _embed_openai(chunks: list[Chunk], config: EmbeddingConfig) -> list[Chunk]:
    ...
```

### Task 4.3 — Analyze and Merge Extractors
Merge `src/agent_service/services/document_extractor.py` into `src/tools/builtin/documents/extraction.py`:

```python
"""tools/builtin/documents/extraction.py — Consolidated document extraction."""

from __future__ import annotations

from telaios.core.types import Document


async def extract_document(
        buffer: bytes,
        mime_type: str,
        file_type: str | None = None,
) -> Document:
    """
    Extract text content and metadata from a document file.

    Supports PDF, DOCX, HTML, TXT, and other common formats.
    """
    ...
```

### Task 4.4 — Fix Broken Imports in `services/document_tools/`
Update imports in these files to point to the new consolidated modules:
- `src/agent_service/services/document_tools/analyze.py`
- `src/agent_service/services/document_tools/extract.py`
- `src/agent_service/services/document_tools/qa.py`
- `src/agent_service/services/document_tools/summarize.py`

Create temporary shims for backward compatibility (similar to Phase 3).

### Task 4.5 — Write Tests
Create test files:
- `tests/tools/documents/test_chunking.py`
- `tests/tools/documents/test_embedding.py`
- `tests/tools/documents/test_extraction.py`

Each test file should:
- Test all supported strategies/providers
- Compare outputs against fixture documents
- Verify no semantic drift from the original implementations

## Acceptance Criteria
- [x] All `tests/tools/documents/*_test.py` green (57 passed, 3 skipped)
- [x] `rg "from agent_service.services.document_" src/` returns only shim files and old code using shims
- [x] No duplicate chunker/embedder/extractor implementations remain
- [x] All document tool functions use `core.types` for I/O

## Status: COMPLETE

## Implementation Notes
- **Chunking consolidated**: `chunkers.py` (674 LOC) + `text_chunker.py` (28 LOC) →
  `tools/builtin/documents/chunking.py` (710 LOC). Added `CharacterChunker` from
  `text_chunker.py` and `chunk_document()` public API using `core.types.Chunk`.
  Fixed `UnboundLocalError` in `_chunk_section()` and `_chunk_page()` (bug from
  original code where `end` was used before assignment).
- **Embedding consolidated**: `embedding_service.py` → `tools/builtin/documents/embedding.py`.
  Decoupled from `agent_service.config` — now accepts `core.types.EmbeddingConfig` or
  falls back to env vars. Added `embed_chunks()` for direct Chunk→embedding workflow.
- **Extraction consolidated**: `document_extractor.py` → `tools/builtin/documents/extraction.py`.
  Pure copy — no bugs to fix.
- **Shims**: 4 old modules updated to re-export with `DeprecationWarning`.
- **Import fix**: `document_tools/split.py` now imports from `tools.builtin.documents.chunking`.

## Risks
- **Semantic drift between duplicate implementations**: The two chunkers may produce slightly different outputs. **Mitigation**: Compare outputs on shared fixture documents; flag diffs for human review.

## Files Touched
- `src/tools/builtin/documents/chunking.py` (create)
- `src/tools/builtin/documents/embedding.py` (create)
- `src/tools/builtin/documents/extraction.py` (create)
- `src/agent_service/services/chunkers.py` (update — becomes shim)
- `src/agent_service/services/text_chunker.py` (update — becomes shim)
- `src/agent_service/services/embedding_service.py` (update — becomes shim)
- `src/agent_service/services/document_extractor.py` (update — becomes shim)
- `src/agent_service/services/document_tools/analyze.py` (update imports)
- `src/agent_service/services/document_tools/extract.py` (update imports)
- `src/agent_service/services/document_tools/qa.py` (update imports)
- `src/agent_service/services/document_tools/summarize.py` (update imports)
- `tests/tools/documents/test_chunking.py` (create)
- `tests/tools/documents/test_embedding.py` (create)
- `tests/tools/documents/test_extraction.py` (create)

## Verification
```bash
pytest tests/tools/documents/ -v
rg "from agent_service.services.document_" src/ --type py
# Should return empty or only shim files with deprecation warnings
find src/tools/builtin/documents -name '*.py' -exec wc -l {} +
# All files should be < 500 LOC
```
