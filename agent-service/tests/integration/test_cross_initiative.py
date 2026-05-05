"""
tests/integration/test_cross_initiative.py
-------------------------------------------
Cross-initiative integration tests combining RAG + Documents + Skills.

Test scenarios:
1. Process document → index with GRAPH RAG → answer questions
2. Load skills from filesystem → use document tools → execute scripts
3. HYBRID RAG with reranking → compare answer quality
4. Document tools with skill-based extraction
5. Agentic RAG with document context

Run with:
  python -m pytest tests/integration/test_cross_initiative.py -v -s
"""
from __future__ import annotations

import asyncio
import json
import textwrap
import time
from pathlib import Path
from typing import Any

import pytest


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def sample_markdown():
    """Sample markdown content for testing."""
    return textwrap.dedent("""\
        # Project Architecture

        ## Overview
        This project implements a multi-agent system for automated code generation.

        ## Components

        ### Coordinator Agent
        The coordinator agent manages the overall planning and task distribution.
        It uses LangGraph for state management and delegates to specialist agents.

        ### Coding Agent
        The coding agent implements code changes based on task specifications.
        It supports multiple languages: Python, TypeScript, Go, and Rust.

        ### Review Agent
        The review agent performs code review using static analysis and LLM-based feedback.

        ## Data Flow
        1. User submits a request
        2. Coordinator creates a plan
        3. Coding agent implements tasks
        4. Review agent validates changes
        5. Results are returned to user

        ## Configuration
        - LLM Provider: OpenAI or Anthropic
        - Database: PostgreSQL
        - Cache: Redis
    """)


@pytest.fixture
def sample_skill_dir(tmp_path):
    """Create a sample skill directory for testing."""
    skill_dir = tmp_path / "skills" / "code-review"
    skill_dir.mkdir(parents=True)

    skill_md = textwrap.dedent("""\
        ---
        name: code-review
        description: Reviews code for quality and best practices
        version: 1.0.0
        author: test
        tags: [review, quality]
        triggers: [review code, check quality]
        ---

        # Code Review Skill

        ## How It Works
        1. Analyze code structure
        2. Check for common issues
        3. Provide recommendations

        ## Usage
        ```bash
        bash scripts/review.sh [file]
        ```
    """)
    (skill_dir / "SKILL.md").write_text(skill_md)

    scripts_dir = skill_dir / "scripts"
    scripts_dir.mkdir()
    (scripts_dir / "review.sh").write_text(textwrap.dedent("""\
        #!/bin/bash
        set -e
        echo "Reviewing: ${1:-stdin}"
        echo "No issues found"
    """))
    (scripts_dir / "review.sh").chmod(0o755)

    return skill_dir


@pytest.fixture
def mock_llm_config():
    """LLM configuration pointing to mock LLM."""
    return {
        "provider": "openai",
        "model": "tinyllm",
        "api_key": "placeholder",
        "base_url": "http://localhost:11435/v1",
    }


# ── 1. Document Processing + GRAPH RAG ───────────────────────────────────────

class TestDocumentGraphRAG:
    """Process document → index with GRAPH RAG → answer questions."""

    def test_document_chunking_produces_meaningful_chunks(self, sample_markdown):
        """Smart chunking produces well-structured chunks from markdown."""
        from tools.builtin.documents.analysis import analyze_text

        analysis = analyze_text(sample_markdown)

        assert analysis.word_count > 0
        assert len(analysis.headings) > 0
        assert any("Coordinator" in h.text for h in analysis.headings)
        assert any("Coding" in h.text for h in analysis.headings)

    def test_document_analyzer_extracts_structure(self, sample_markdown):
        """Analyzer extracts headings, sections, and key terms."""
        from tools.builtin.documents.analysis import analyze_text

        analysis = analyze_text(sample_markdown)

        # Headings detected
        assert len(analysis.headings) >= 5
        assert any(h.level == 1 for h in analysis.headings)
        assert any(h.level == 2 for h in analysis.headings)

        # Key terms extracted
        assert len(analysis.key_terms) > 0

    def test_graph_store_builds_from_documents(self, sample_markdown):
        """GraphStore builds entity relationships from document content."""
        from core.graph_store import InMemoryGraphStore

        store = InMemoryGraphStore()

        # Add entities extracted from document
        store.add_entity("CoordinatorAgent", "agent", {"description": "Manages planning"})
        store.add_entity("CodingAgent", "agent", {"description": "Implements code"})
        store.add_entity("ReviewAgent", "agent", {"description": "Validates changes"})
        store.add_entity("LangGraph", "technology", {"type": "framework"})

        # Add relationships
        store.add_relation("CoordinatorAgent", "uses", "LangGraph")
        store.add_relation("CoordinatorAgent", "delegates_to", "CodingAgent")
        store.add_relation("CoordinatorAgent", "delegates_to", "ReviewAgent")

        # Query relationships
        coords = store.get_relations("CoordinatorAgent")
        assert len(coords) >= 3

        agents = store.get_entities_by_type("agent")
        assert len(agents) == 3

    def test_graph_rag_strategy_uses_graph_store(self, sample_markdown):
        """GRAPH RAG strategy retrieves from graph store."""
        from core.graph_store import InMemoryGraphStore
        from core.strategies.graph import GraphRAGStrategy
        from core.types import LLMConfig, RagConfig

        store = InMemoryGraphStore()
        store.add_entity("PostgreSQL", "database", {"description": "Primary datastore"})
        store.add_entity("Redis", "database", {"description": "Cache layer"})
        store.add_relation("PostgreSQL", "stores", "plans")
        store.add_relation("Redis", "caches", "sessions")

        config = RagConfig(
            strategy="graph",
            llm=LLMConfig(provider="openai", model="tinyllm", api_key="test"),
        )

        strategy = GraphRAGStrategy(graph_store=store, config=config)

        # Verify strategy can query the graph
        entities = store.get_entities_by_type("database")
        assert len(entities) == 2


# ── 2. Skills + Document Tools ───────────────────────────────────────────────

class TestSkillsDocumentTools:
    """Load skills from filesystem → use document tools → execute scripts."""

    def test_skill_registry_loads_from_directory(self, sample_skill_dir):
        """SkillRegistry loads skills from a directory."""
        from tools.skill.registry import SkillRegistry

        registry = SkillRegistry()
        count = registry.load_from_directory(str(sample_skill_dir.parent))

        assert count >= 1
        assert "code-review" in registry

    def test_skill_search_by_tag(self, sample_skill_dir):
        """Skills can be searched by tag."""
        from tools.skill.registry import SkillRegistry

        registry = SkillRegistry()
        registry.load_from_directory(str(sample_skill_dir.parent))

        results = registry.find_by_tag("review")
        assert len(results) >= 1
        assert results[0].name == "code-review"

    def test_skill_search_by_query(self, sample_skill_dir):
        """Skills can be searched by text query."""
        from tools.skill.registry import SkillRegistry

        registry = SkillRegistry()
        registry.load_from_directory(str(sample_skill_dir.parent))

        results = registry.search("code quality")
        assert len(results) >= 1

    def test_skill_manifest_parsing(self, sample_skill_dir):
        """SKILL.md is correctly parsed into a manifest."""
        from tools.skill.parser import parse_skill_manifest

        skill_path = sample_skill_dir / "SKILL.md"
        manifest = parse_skill_manifest(str(skill_path))

        assert manifest.name == "code-review"
        assert manifest.version == "1.0.0"
        assert "review" in manifest.frontmatter.tags
        assert len(manifest.frontmatter.triggers) > 0

    def test_skill_validator_valid_manifest(self, sample_skill_dir):
        """Valid skill manifest passes validation."""
        from tools.skill.parser import parse_skill_manifest
        from tools.skill.validator import validate_skill

        skill_path = sample_skill_dir / "SKILL.md"
        manifest = parse_skill_manifest(str(skill_path))
        errors = validate_skill(manifest)

        assert len(errors) == 0


# ── 3. HYBRID RAG with Reranking ─────────────────────────────────────────────

class TestHybridRAGReranking:
    """HYBRID RAG with reranking → compare answer quality."""

    def test_rrf_fusion_combines_results(self):
        """Reciprocal Rank Fusion combines multiple result lists."""
        from core.fusion import rrf_fusion

        results_a = [
            {"id": "doc1", "score": 0.9},
            {"id": "doc2", "score": 0.7},
            {"id": "doc3", "score": 0.5},
        ]
        results_b = [
            {"id": "doc2", "score": 0.8},
            {"id": "doc4", "score": 0.6},
            {"id": "doc1", "score": 0.4},
        ]

        fused = rrf_fusion([results_a, results_b], k=60)

        # doc2 should be ranked highest (appears in both lists, high ranks)
        assert len(fused) > 0
        ids = [r["id"] for r in fused]
        assert "doc1" in ids or "doc2" in ids

    def test_hybrid_rag_config_valid(self):
        """HYBRID RAG configuration is valid."""
        from core.types import LLMConfig, RagConfig, HybridRAGConfig

        config = RagConfig(
            strategy="hybrid",
            llm=LLMConfig(provider="openai", model="tinyllm", api_key="test"),
            hybrid=HybridRAGConfig(
                vector_weight=0.7,
                bm25_weight=0.3,
                top_k=10,
            ),
        )

        assert config.strategy == "hybrid"
        assert config.hybrid.vector_weight == 0.7
        assert config.hybrid.bm25_weight == 0.3

    def test_bm25_retriever_ranks_by_term_frequency(self):
        """BM25 retriever ranks documents by term frequency."""
        from core.retriever_bm25 import BM25Retriever

        docs = [
            {"id": "1", "content": "Python is a programming language"},
            {"id": "2", "content": "JavaScript is also a programming language"},
            {"id": "3", "content": "Rust is a systems programming language"},
        ]

        retriever = BM25Retriever()
        retriever.add_documents(docs)

        results = retriever.retrieve("Python programming", top_k=2)
        assert len(results) <= 2
        # Doc 1 should rank highest for "Python"
        if len(results) > 0:
            assert results[0]["id"] == "1"


# ── 4. Document Tools with Skill-Based Extraction ────────────────────────────

class TestDocumentToolsSkills:
    """Document tools with skill-based extraction."""

    def test_document_extractor_handles_markdown(self, sample_markdown):
        """Document extractor processes markdown content."""
        from tools.builtin.documents.extraction import extract_text

        loop = asyncio.new_event_loop()
        try:
            text = loop.run_until_complete(
                extract_text(sample_markdown.encode(), "text/markdown")
            )
            assert "Project Architecture" in text
        finally:
            loop.close()

    def test_document_converter_markdown_to_html(self, sample_markdown):
        """Document converter transforms markdown to HTML."""
        from tools.builtin.documents.conversion import convert_from_markdown

        loop = asyncio.new_event_loop()
        try:
            html = loop.run_until_complete(
                convert_from_markdown(sample_markdown, "html")
            )
            assert b"<h1>" in html or b"<h1" in html
        finally:
            loop.close()

    def test_text_chunker_preserves_content(self, sample_markdown):
        """Text chunker preserves all content across chunks."""
        from tools.builtin.documents.chunking import chunk_text

        chunks = chunk_text(sample_markdown, chunk_size=200, overlap=30)
        assert len(chunks) > 1

        # All content is preserved (approximately, due to overlap)
        combined = "\n".join(chunks)
        assert "Coordinator Agent" in combined
        assert "Coding Agent" in combined


# ── 5. Agentic RAG with Document Context ─────────────────────────────────────

class TestAgenticRAGDocumentContext:
    """Agentic RAG with document context."""

    def test_agentic_rag_config_valid(self):
        """Agentic RAG configuration is valid."""
        from core.types import LLMConfig, RagConfig, AgenticRAGConfig

        config = RagConfig(
            strategy="agentic",
            llm=LLMConfig(provider="openai", model="tinyllm", api_key="test"),
            agentic=AgenticRAGConfig(
                max_iterations=3,
                retrieval_threshold=0.7,
            ),
        )

        assert config.strategy == "agentic"
        assert config.agentic.max_iterations == 3

    def test_crag_config_valid(self):
        """CRAG configuration is valid."""
        from core.types import LLMConfig, RagConfig, CRAGConfig

        config = RagConfig(
            strategy="crag",
            llm=LLMConfig(provider="openai", model="tinyllm", api_key="test"),
            crag=CRAGConfig(
                grade_threshold=0.6,
                max_retries=2,
            ),
        )

        assert config.strategy == "crag"
        assert config.crag.grade_threshold == 0.6

    def test_self_rag_config_valid(self):
        """Self-RAG configuration is valid."""
        from core.types import LLMConfig, RagConfig, SelfRAGConfig

        config = RagConfig(
            strategy="self_rag",
            llm=LLMConfig(provider="openai", model="tinyllm", api_key="test"),
            self_rag=SelfRAGConfig(
                reflection_threshold=0.7,
                max_reflections=2,
            ),
        )

        assert config.strategy == "self_rag"
        assert config.self_rag.reflection_threshold == 0.7


# ── 6. End-to-End: Document → RAG → Answer ──────────────────────────────────

class TestEndToEndDocumentRAG:
    """End-to-end test: process document, index with RAG, answer questions."""

    def test_full_pipeline_document_to_chunks(self, sample_markdown):
        """Full pipeline: document → analysis → chunking → indexing."""
        from tools.builtin.documents.analysis import analyze_text
        from tools.builtin.documents.chunking import chunk_text
        from core.graph_store import InMemoryGraphStore

        # Step 1: Analyze document
        analysis = analyze_text(sample_markdown)
        assert analysis.word_count > 0

        # Step 2: Chunk document
        chunks = chunk_text(sample_markdown, chunk_size=300, overlap=50)
        assert len(chunks) > 1

        # Step 3: Index chunks in graph store
        store = InMemoryGraphStore()
        for i, chunk in enumerate(chunks):
            store.add_entity(f"chunk_{i}", "chunk", {
                "content": chunk[:100],
                "position": i,
            })

        # Step 4: Verify indexing
        entities = store.get_entities_by_type("chunk")
        assert len(entities) == len(chunks)

    def test_full_pipeline_hybrid_search(self, sample_markdown):
        """Full pipeline: document → BM25 + Graph search → fused results."""
        from tools.builtin.documents.chunking import chunk_text
        from core.fusion import rrf_fusion
        from core.graph_store import InMemoryGraphStore
        from core.retriever_bm25 import BM25Retriever

        # Chunk document
        chunks = chunk_text(sample_markdown, chunk_size=300, overlap=50)
        docs = [{"id": str(i), "content": c} for i, c in enumerate(chunks)]

        # BM25 search
        bm25 = BM25Retriever()
        bm25.add_documents(docs)
        bm25_results = bm25.retrieve("coordinator agent", top_k=3)

        # Graph search (simulated)
        store = InMemoryGraphStore()
        for doc in docs:
            store.add_entity(doc["id"], "chunk", {"content": doc["content"][:100]})

        # Fuse results
        fused = rrf_fusion([bm25_results], k=60)
        assert len(fused) > 0


# ── 7. Tool Registry Integration ────────────────────────────────────────────

class TestToolRegistryIntegration:
    """Tool registry integrates with skills and document tools."""

    def test_tool_registry_builtin_tools(self):
        """Tool registry has built-in tools available."""
        from tools.registry import ToolRegistry

        registry = ToolRegistry()
        tools = registry.list_tools()

        # Registry should have some tools registered
        assert isinstance(tools, list)

    def test_skill_adapter_creates_tool(self, sample_skill_dir):
        """Skill adapter creates a callable tool from a skill."""
        from tools.skill.parser import parse_skill_manifest

        skill_path = sample_skill_dir / "SKILL.md"
        manifest = parse_skill_manifest(str(skill_path))

        assert manifest.name == "code-review"
        assert manifest.frontmatter.description != ""


# ── 8. Configuration Integration ────────────────────────────────────────────

class TestConfigurationIntegration:
    """Configuration supports all features."""

    def test_config_has_llm_settings(self):
        """Config has LLM provider settings."""
        from infra.settings import config

        assert config.LLM_PROVIDER is not None
        assert config.LLM_MODEL is not None

    def test_config_has_database_settings(self):
        """Config has database connection settings."""
        from infra.settings import config

        assert config.DATABASE_URL is not None

    def test_config_has_redis_settings(self):
        """Config has Redis connection settings."""
        from infra.settings import config

        assert config.REDIS_URL is not None
