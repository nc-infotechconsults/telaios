# Document Manipulation Tools Implementation Plan

## Overview

Build a comprehensive document processing toolkit that extends the existing basic extraction pipeline (PDF/DOCX/XLSX) into a full-featured system supporting all major document formats, structured extraction, conversion, and agent-exposed tools. The existing `document_extractor.py` and `document_processor.py` serve as the foundation.

## Stack Detected

- **Python 3.14+** (from `pyproject.toml`)
- **PyMuPDF 1.24+** (PDF extraction — existing)
- **python-docx 1.1+** (DOCX extraction — existing)
- **openpyxl 3.1+** (XLSX extraction — existing)
- **FastAPI** (API endpoints — existing)
- **aioboto3** (S3 storage — existing)

## Architecture

```
src/agent_service/services/
├── document_extractor.py       # Enhanced with unstructured library
├── document_processor.py       # Enhanced pipeline
├── document_converter.py       # [NEW] Format conversion
├── document_analyzer.py        # [NEW] Structure analysis
└── document_tools/             # [NEW] Agent tools
    ├── __init__.py
    ├── extract.py              # Structured extraction tools
    ├── convert.py              # Conversion tools
    ├── analyze.py              # Analysis tools
    ├── manipulate.py           # Manipulation tools
    └── summarize.py            # Summarization tools
```

---

## Phase 1: Enhanced Extraction

### Task 1: Integrate `unstructured` Library

**Description:** Add the `unstructured` library as the primary multi-format extraction engine, replacing the current format-by-format approach.

**Sources:**
- unstructured docs: https://docs.unstructured.io/open-source/core-functionality/overview
- Supported formats: https://docs.unstructured.io/open-source/supported-file-types

**Acceptance criteria:**
- [ ] `unstructured[all-docs]` added to `pyproject.toml`
- [ ] `partition()` used as primary extraction for all supported formats
- [ ] Fallback to existing extractors for formats not covered
- [ ] Async wrapper around partition()

**Verification:**
- [ ] Test with PDF, DOCX, PPTX, XLSX, HTML, EML, MSG
- [ ] Compare output quality vs existing extractors
- [ ] Benchmark extraction speed

**Files likely touched:**
- `src/agent_service/services/document_extractor.py`
- `pyproject.toml`

**Dependencies:** None

**Estimated scope:** Medium (2-3 files)

---

### Task 2: PDF Enhanced Extraction

**Description:** Enhance PDF extraction to handle tables, images (OCR), and layout preservation.

**Sources:**
- PyMuPDF tables: https://pymupdf.readthedocs.io/en/latest/document.html#Document.find_tables
- PyMuPDF OCR: https://pymupdf.readthedocs.io/en/latest/module.html#pymupdf.TEXTFLAGS

**Acceptance criteria:**
- [ ] Table detection and structured extraction (markdown tables)
- [ ] Image extraction with optional OCR (tesseract)
- [ ] Page-by-page metadata preservation
- [ ] Layout-aware text extraction (headers, footers, columns)

**Verification:**
- [ ] Test with table-heavy PDFs
- [ ] Test with scanned PDFs (OCR)
- [ ] Test with multi-column layouts

**Files likely touched:**
- `src/agent_service/services/document_extractor.py` (enhance `_extract_pdf`)
- `pyproject.toml` (add pytesseract, pillow)

**Dependencies:** Task 1

**Estimated scope:** Medium (2-3 files)

---

### Task 3: PowerPoint (PPTX) Extraction

**Description:** Add support for extracting text, notes, and structure from PowerPoint presentations.

**Sources:**
- python-pptx docs: https://python-pptx.readthedocs.io/en/latest/

**Acceptance criteria:**
- [ ] Extract slide text (titles, body, shapes)
- [ ] Extract speaker notes
- [ ] Preserve slide ordering and hierarchy
- [ ] Extract embedded images (optional)

**Verification:**
- [ ] Test with multi-slide presentations
- [ ] Test with notes-heavy presentations

**Files likely touched:**
- `src/agent_service/services/document_extractor.py` (add `_extract_pptx`)
- `pyproject.toml` (add python-pptx)

**Dependencies:** Task 1

**Estimated scope:** Small (2 files)

---

### Task 4: HTML/Markdown Extraction

**Description:** Add support for extracting structured content from HTML and parsing Markdown with metadata.

**Sources:**
- BeautifulSoup docs: https://beautiful-soup-4.readthedocs.io/
- markdown-it-py: https://markdown-it-py.readthedocs.io/

**Acceptance criteria:**
- [ ] HTML: Extract text preserving structure (headings, lists, tables)
- [ ] HTML: Strip scripts, styles, navigation
- [ ] Markdown: Parse frontmatter (YAML) as metadata
- [ ] Markdown: Extract heading hierarchy

**Verification:**
- [ ] Test with complex HTML pages
- [ ] Test with Markdown files containing frontmatter

**Files likely touched:**
- `src/agent_service/services/document_extractor.py` (add `_extract_html`, `_extract_markdown`)
- `pyproject.toml` (add beautifulsoup4, markdown-it-py)

**Dependencies:** Task 1

**Estimated scope:** Small (2-3 files)

---

### Task 5: Email Extraction (EML/MSG)

**Description:** Extract content from email files including headers, body, and attachments.

**Sources:**
- Python email module: https://docs.python.org/3/library/email.html
- extract-msg: https://github.com/TeamMsgExtractor/msg-extractor

**Acceptance criteria:**
- [ ] EML: Parse headers (from, to, subject, date)
- [ ] EML: Extract plain text and HTML bodies
- [ ] EML: Extract attachments as separate documents
- [ ] MSG: Support via extract-msg library

**Verification:**
- [ ] Test with multi-part emails
- [ ] Test with attachments

**Files likely touched:**
- `src/agent_service/services/document_extractor.py` (add `_extract_email`)
- `pyproject.toml` (add extract-msg)

**Dependencies:** Task 1

**Estimated scope:** Small (2 files)

---

## Phase 2: Document Analysis

### Task 6: Document Structure Analyzer

**Description:** Analyze document structure to extract metadata, heading hierarchy, tables of contents, and key sections.

**Acceptance criteria:**
- [ ] Extract heading hierarchy (H1 → H6)
- [ ] Detect document sections/chapters
- [ ] Extract tables as structured data
- [ ] Generate document summary (first paragraph, key terms)
- [ ] Return `DocumentAnalysis` Pydantic model

**Verification:**
- [ ] Test with multi-section documents
- [ ] Verify heading hierarchy accuracy

**Files likely touched:**
- `src/agent_service/services/document_analyzer.py` (new)
- `src/agent_service/services/__init__.py`

**Dependencies:** Tasks 1-5

**Estimated scope:** Medium (2-3 files)

---

### Task 7: Smart Chunking Strategies

**Description:** Replace the current simple character-based chunker with intelligent chunking strategies.

**Sources:**
- LangChain splitters: https://python.langchain.com/docs/how_to/chunk/
- Semantic chunking: https://python.langchain.com/docs/integrations/document_transformers/splitters/semantic-chunker/

**Acceptance criteria:**
- [ ] `SemanticChunker`: Split by embedding similarity threshold
- [ ] `HierarchicalChunker`: Split by heading structure
- [ ] `PageChunker`: Split by page boundaries (for PDFs)
- [ ] `TokenChunker`: Split by token count (tiktoken)
- [ ] All implement `Chunker` protocol
- [ ] Configurable via `ChunkingConfig`

**Verification:**
- [ ] Test each strategy with appropriate documents
- [ ] Compare chunk quality vs current approach
- [ ] Benchmark chunking speed

**Files likely touched:**
- `src/agent_service/services/chunkers.py` (new)
- `src/agent_service/services/text_chunker.py` (deprecate or enhance)
- `src/core/types.py` (add ChunkingConfig)

**Dependencies:** Task 1

**Estimated scope:** Medium (3-4 files)

---

## Phase 3: Document Conversion

### Task 8: Format Conversion Pipeline

**Description:** Build a conversion service that transforms documents between formats.

**Acceptance criteria:**
- [ ] PDF → Markdown (text + tables)
- [ ] DOCX → Markdown
- [ ] HTML → Markdown
- [ ] Markdown → HTML
- [ ] Markdown → PDF (via weasyprint)
- [ ] Async conversion with progress tracking

**Verification:**
- [ ] Test round-trip conversions
- [ ] Verify content preservation

**Files likely touched:**
- `src/agent_service/services/document_converter.py` (new)
- `pyproject.toml` (add weasyprint, markdown)

**Dependencies:** Tasks 1-5

**Estimated scope:** Medium (2-3 files)

---

### Task 9: Document Merge and Split

**Description:** Tools for merging multiple documents and splitting documents into parts.

**Acceptance criteria:**
- [ ] Merge PDFs (PyMuPDF)
- [ ] Merge Markdown files
- [ ] Split PDF by pages
- [ ] Split Markdown by headings
- [ ] Return merged/split document buffers

**Verification:**
- [ ] Test merge with 3+ documents
- [ ] Test split preserves content

**Files likely touched:**
- `src/agent_service/services/document_converter.py` (extend)

**Dependencies:** Task 8

**Estimated scope:** Small (1-2 files)

---

## Phase 4: Agent Document Tools

### Task 10: Extract Structured Data Tool

**Description:** Agent tool that extracts structured data from documents using LLM-powered extraction.

**Acceptance criteria:**
- [ ] Tool: `extract_structured_data`
- [ ] Input: `document_id`, `schema` (JSON Schema), `options`
- [ ] Output: Extracted data matching schema
- [ ] Supports: tables, key-value pairs, entities, dates
- [ ] Uses LLM with structured output (Pydantic)

**Verification:**
- [ ] Test with invoice extraction
- [ ] Test with contract clause extraction
- [ ] Verify schema compliance

**Files likely touched:**
- `src/agent_service/services/document_tools/extract.py` (new)
- `src/agent_service/services/document_tools/__init__.py`

**Dependencies:** Tasks 1-7

**Estimated scope:** Medium (2-3 files)

---

### Task 11: Document Summarization Tool

**Description:** Agent tool that generates summaries at different levels of detail.

**Acceptance criteria:**
- [ ] Tool: `summarize_document`
- [ ] Input: `document_id`, `level` (brief/detailed/executive), `focus` (optional)
- [ ] Output: Summary text
- [ ] Supports: extractive and abstractive summarization
- [ ] Configurable summary length

**Verification:**
- [ ] Test with long documents
- [ ] Verify summary captures key points

**Files likely touched:**
- `src/agent_service/services/document_tools/summarize.py` (new)
- `src/agent_service/services/document_tools/__init__.py`

**Dependencies:** Tasks 1-7

**Estimated scope:** Small (2 files)

---

### Task 12: Document Comparison Tool

**Description:** Agent tool that compares two documents and identifies differences.

**Acceptance criteria:**
- [ ] Tool: `compare_documents`
- [ ] Input: `document_id_a`, `document_id_b`, `mode` (text/semantic/structural)
- [ ] Output: Diff report with additions, deletions, modifications
- [ ] Text mode: Line-by-line diff
- [ ] Semantic mode: Meaning-level changes
- [ ] Structural mode: Section/heading changes

**Verification:**
- [ ] Test with document versions
- [ ] Test with contract revisions

**Files likely touched:**
- `src/agent_service/services/document_tools/analyze.py` (new)
- `src/agent_service/services/document_tools/__init__.py`

**Dependencies:** Tasks 1-7

**Estimated scope:** Medium (2-3 files)

---

### Task 13: Document Q&A Tool

**Description:** Agent tool for answering questions about a specific document using local RAG.

**Acceptance criteria:**
- [ ] Tool: `ask_document`
- [ ] Input: `document_id`, `question`, `chunk_strategy`
- [ ] Output: Answer with source citations
- [ ] Uses in-memory vector store for single-document retrieval
- [ ] Returns source chunks with page/section references

**Verification:**
- [ ] Test with factual questions
- [ ] Verify citation accuracy

**Files likely touched:**
- `src/agent_service/services/document_tools/extract.py` (extend)
- `src/agent_service/services/document_tools/__init__.py`

**Dependencies:** Tasks 1-7, RAG strategies (PLAN-RAG.md)

**Estimated scope:** Medium (2-3 files)

---

### Task 14: Document Metadata Tool

**Description:** Agent tool that extracts and returns comprehensive document metadata.

**Acceptance criteria:**
- [ ] Tool: `get_document_metadata`
- [ ] Input: `document_id`
- [ ] Output: Title, author, dates, page count, word count, language, format info
- [ ] Supports all document formats

**Verification:**
- [ ] Test with PDFs (extract PDF metadata)
- [ ] Test with DOCX (extract Word properties)

**Files likely touched:**
- `src/agent_service/services/document_tools/analyze.py` (extend)

**Dependencies:** Tasks 1-5

**Estimated scope:** Small (1-2 files)

---

### Task 15: Document Search Tool

**Description:** Agent tool for searching within a document for specific terms or patterns.

**Acceptance criteria:**
- [ ] Tool: `search_document`
- [ ] Input: `document_id`, `query`, `mode` (text/regex/semantic)
- [ ] Output: List of matches with context and location
- [ ] Text mode: Case-insensitive string search
- [ ] Regex mode: Pattern matching
- [ ] Semantic mode: Embedding-based search

**Verification:**
- [ ] Test with exact matches
- [ ] Test with regex patterns
- [ ] Test with semantic similarity

**Files likely touched:**
- `src/agent_service/services/document_tools/extract.py` (extend)

**Dependencies:** Tasks 1-7

**Estimated scope:** Small (1-2 files)

---

## Phase 5: API Endpoints

### Task 16: Document Processing API v2

**Description:** Enhanced API endpoints for the new document capabilities.

**Acceptance criteria:**
- [ ] `POST /documents/{id}/analyze` — Get document structure analysis
- [ ] `POST /documents/{id}/convert` — Convert to target format
- [ ] `POST /documents/{id}/extract` — Structured data extraction
- [ ] `POST /documents/{id}/summarize` — Generate summary
- [ ] `POST /documents/{id}/compare` — Compare with another document
- [ ] All endpoints return proper error responses
- [ ] Async processing for long operations (return job ID)

**Verification:**
- [ ] Test all endpoints with sample documents
- [ ] Verify error handling
- [ ] Test async job polling

**Files likely touched:**
- `src/agent_service/api/documents_v2.py` (new)
- `src/agent_service/main.py` (mount router)

**Dependencies:** Tasks 1-15

**Estimated scope:** Medium (2-3 files)

---

## New Dependencies

```toml
# pyproject.toml additions
[project.optional-dependencies]
documents = [
    "unstructured[all-docs]>=0.12.0",
    "python-pptx>=0.6.23",
    "beautifulsoup4>=4.12.0",
    "markdown-it-py>=3.0.0",
    "weasyprint>=60.0",
    "pytesseract>=0.3.10",
    "pillow>=10.0.0",
    "extract-msg>=0.50.0",
    "tiktoken>=0.5.0",
]
```

## Tool Registration

Document tools registered with `ToolRegistry`:

```python
from telaios.tools import ExecutableTool
from agent_service.services.document_tools import (
    extract_structured_data_tool,
    summarize_document_tool,
    compare_documents_tool,
    ask_document_tool,
    get_document_metadata_tool,
    search_document_tool,
)

registry.register(extract_structured_data_tool)
registry.register(summarize_document_tool)
registry.register(compare_documents_tool)
registry.register(ask_document_tool)
registry.register(get_document_metadata_tool)
registry.register(search_document_tool)
```

## Verification Checklist

- [ ] All document formats supported (PDF, DOCX, XLSX, PPTX, HTML, MD, EML, MSG)
- [ ] Extraction quality verified against known documents
- [ ] Smart chunking produces semantically coherent chunks
- [ ] Conversion preserves content and structure
- [ ] All agent tools registered and callable
- [ ] API endpoints return correct responses
- [ ] Error handling for unsupported formats
- [ ] Performance benchmarks for large documents

## Checkpoint: After Tasks 1-5 (Enhanced Extraction)
- [ ] All document formats extract correctly
- [ ] PDF tables and OCR work
- [ ] Extraction quality > existing approach

## Checkpoint: After Tasks 6-7 (Analysis & Chunking)
- [ ] Document structure analysis accurate
- [ ] Smart chunking produces better chunks than character-based

## Checkpoint: After Tasks 8-9 (Conversion)
- [ ] Format conversions preserve content
- [ ] Merge/split operations work correctly

## Checkpoint: After Tasks 10-15 (Agent Tools)
- [ ] All document tools callable by agents
- [ ] Tools return structured, useful output
- [ ] Error handling graceful

## Checkpoint: After Task 16 (API)
- [ ] All API endpoints functional
- [ ] Async processing works for long operations
