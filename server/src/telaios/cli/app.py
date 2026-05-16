"""
telaios.cli.app
---------------
Textual TUI for evaluating TelaiOS RAG and agent capabilities.

Backed by Chroma vector store (ephemeral in-memory) for real semantic search.
Dry-run uses FakeLLM; supplying an API key enables live LLM calls via the
full RAG pipeline (RagManager → strategy → LLM).

Layout
------
  Header
  ┌─ Tabs: one per capability ──────────────────────────────────┐
  │  Config (left) │ Output log (right)                         │
  └─────────────────────────────────────────────────────────────┘
  Footer  (q: quit  r: run  Tab: navigate)

Launch
------
  uv run telaios-eval
"""

from __future__ import annotations

import asyncio
import traceback
from typing import ClassVar

from textual import on, work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.css.query import NoMatches
from textual.widgets import (
    Button,
    Footer,
    Header,
    Input,
    Label,
    RichLog,
    Select,
    Static,
    TabbedContent,
    TabPane,
)

from telaios.core.fake_llm import FakeLLM
from telaios.core.rag_manager import RagManager
from telaios.core.types import (
    AgentInput,
    EmbeddingConfig,
    LLMConfig,
    Message,
    MessageRole,
    RagConfig,
    RagStrategy,
    RetrievalQuery,
    VectorStoreConfig,
)

# ---------------------------------------------------------------------------
# Sample corpus — pre-populated into Chroma at startup
# ---------------------------------------------------------------------------

_CORPUS: list[tuple[str, str]] = [
    # (doc_id, content)
    (
        "doc-python",
        "Python is a high-level, interpreted programming language created by Guido van Rossum "
        "and first released in 1991. It emphasises code readability and uses significant indentation. "
        "Python supports multiple programming paradigms including procedural, object-oriented, "
        "and functional programming. Its comprehensive standard library is one of its greatest strengths.",
    ),
    (
        "doc-rag",
        "Retrieval-Augmented Generation (RAG) combines a retrieval component with a generative LLM. "
        "A query is used to fetch relevant documents from a vector store, which are then provided as "
        "context to the language model. Hybrid RAG combines dense vector search with sparse keyword "
        "search (BM25). Results are merged using Reciprocal Rank Fusion (RRF), improving recall. "
        "Corrective RAG (CRAG) grades retrieved documents for relevance. If documents score below "
        "a threshold the query is rewritten or a web search fallback is triggered. "
        "Self-RAG introduces reflection tokens to detect hallucinations and optionally regenerate.",
    ),
    (
        "doc-agents",
        "A ReAct agent interleaves reasoning steps (Thought) with tool invocations (Action) "
        "in a loop until it reaches a final answer. LangGraph implements this via a cyclic state graph. "
        "LangGraph checkpointing persists the agent's state between turns using "
        "AsyncPostgresSaver or MemorySaver, enabling long-running multi-turn conversations "
        "and human-in-the-loop interrupts.",
    ),
    (
        "doc-code",
        "Static analysis tools like ruff and mypy catch issues before runtime. "
        "ruff combines linting and formatting in a single Rust-based tool; mypy enforces "
        "type annotations with configurable strictness. "
        "Security hardening for LLM applications includes input sanitisation to prevent "
        "prompt injection, output validation to block PII leakage, and rate limiting to "
        "resist denial-of-service attacks.",
    ),
    (
        "doc-chroma",
        "Chroma is an open-source vector database for AI applications. It supports "
        "embeddings storage, metadata filtering, and similarity search. Chroma can run "
        "in-memory (ephemeral client), with local persistence (PersistentClient), or "
        "in client-server mode. It provides built-in embedding functions for OpenAI, "
        "Cohere, Sentence Transformers, and more.",
    ),
    (
        "doc-telaios",
        "TelaiOS is an AI orchestration platform for senior software engineers. "
        "It provides multi-agent workflows, RAG pipelines, and autonomous task execution. "
        "The platform uses FastAPI for its web API layer, SQLAlchemy for database access, "
        "and Chroma for vector storage. It follows a modular monolith architecture with "
        "per-module Kubernetes scaling.",
    ),
]

_COLLECTION_NAME = "telaios-tui"


def _init_rag() -> RagManager:
    """Create RagManager and pre-populate the Chroma collection."""
    manager = RagManager(
        vector_store=VectorStoreConfig(provider="chroma"),
        embedding=EmbeddingConfig(provider="fastembed", model="BAAI/bge-small-en-v1.5"),
    )
    ids = [doc_id for doc_id, _ in _CORPUS]
    texts = [content for _, content in _CORPUS]
    manager.ingest(_COLLECTION_NAME, ids=ids, documents=texts)
    return manager


# ---------------------------------------------------------------------------
# Capability descriptors
# ---------------------------------------------------------------------------

_CAPABILITIES: list[tuple[str, str, str]] = [
    (
        "simple_rag",
        "Simple RAG",
        "Retrieve → Prepend context → LLM answer.\n"
        "One-shot: no query rewriting, no reflection, no iteration.",
    ),
    (
        "hybrid_rag",
        "Hybrid RAG",
        "Vector similarity + BM25 keyword search → Reciprocal Rank Fusion → LLM answer.\n"
        "Improves recall for rare terms and domain-specific vocabulary.",
    ),
    (
        "crag",
        "CRAG",
        "Corrective RAG: retrieve → grade documents → rewrite query or web-search fallback "
        "→ LLM answer.\nRejects low-confidence chunks before generation.",
    ),
    (
        "self_rag",
        "Self-RAG",
        "Self-Reflective RAG: retrieve → generate → reflect on relevance and hallucination "
        "→ optionally regenerate.\nAdds ISREL / ISSUP / ISUSE reflection tokens.",
    ),
    (
        "agentic_rag",
        "Agentic RAG",
        "Agent loop decides when and what to retrieve across multiple hops.\n"
        "Powered by LangGraph ReAct graph; supports human-in-the-loop interrupts.",
    ),
    (
        "graph_rag",
        "Graph RAG",
        "Knowledge-graph traversal to build structured relational context → LLM answer.\n"
        "Uses GraphStore abstraction (Neo4j, NetworkX, FalkorDB).",
    ),
    (
        "agent_chat",
        "Agent Chat",
        "Freeform multi-turn ReAct agent with tool calls.\n"
        "Checkpointed via LangGraph MemorySaver; supports streaming events.",
    ),
    (
        "code_review",
        "Code Review",
        "Agent-based code review across five dimensions:\n"
        "correctness, readability, architecture, security, performance.",
    ),
]

_PROVIDER_OPTIONS: list[tuple[str, str]] = [
    ("openai", "OpenAI"),
    ("anthropic", "Anthropic"),
]

_MODEL_OPTIONS: dict[str, list[tuple[str, str]]] = {
    "openai": [
        ("gpt-4o-mini", "gpt-4o-mini"),
        ("gpt-4o", "gpt-4o"),
        ("o3-mini", "o3-mini"),
    ],
    "anthropic": [
        ("claude-3-5-haiku-20241022", "claude-3-5-haiku"),
        ("claude-3-5-sonnet-20241022", "claude-3-5-sonnet"),
        ("claude-opus-4-5", "claude-opus-4-5"),
    ],
}

# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------

CSS = """
Screen {
    background: $surface;
}

#main-tabs {
    height: 1fr;
}

.cap-pane {
    padding: 0 1;
}

.split {
    height: 1fr;
}

.config-panel {
    width: 40;
    min-width: 36;
    border: solid $primary-darken-2;
    padding: 1 2;
    height: 1fr;
}

.config-panel Label {
    margin-top: 1;
    color: $text-muted;
}

.config-panel Input {
    margin-bottom: 0;
}

.config-panel Select {
    margin-bottom: 0;
}

.desc-block {
    color: $text-muted;
    margin-bottom: 1;
    padding: 0 1;
}

.output-panel {
    border: solid $primary-darken-2;
    height: 1fr;
    padding: 0 1;
}

.run-btn {
    margin-top: 1;
    width: 100%;
}

RichLog {
    height: 1fr;
    scrollbar-gutter: stable;
}
"""


# ---------------------------------------------------------------------------
# Helper: Chroma-backed pipeline steps
# ---------------------------------------------------------------------------


async def _dry_run_simple(
    query: str,
    rag: RagManager,
    log: RichLog,
) -> None:
    """Simple RAG: retrieve from Chroma, generate with FakeLLM."""
    log.write("[bold cyan]── Simple RAG (Chroma + FakeLLM) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.02)

    # Real Chroma retrieval
    retriever = rag.create_retriever(_COLLECTION_NAME)
    result = await retriever.aretrieve(RetrievalQuery(text=query, top_k=3))

    log.write(f"\n[bold]Chroma retrieved {len(result.chunks)} chunks:[/bold]")
    for i, (chunk, score) in enumerate(zip(result.chunks, result.scores, strict=True), 1):
        log.write(f"  [{i}] (score={score:.2f}) {chunk.content[:140]}…")
    await asyncio.sleep(0.02)

    # Generate via FakeLLM through the real strategy
    llm = FakeLLM()
    config = RagConfig(strategy=RagStrategy.SIMPLE, top_k=3)
    pipeline = rag.create_pipeline(config, llm=llm, collection_name=_COLLECTION_NAME)  # type: ignore[arg-type]
    output = await pipeline.answer(
        AgentInput(messages=[Message(role=MessageRole.HUMAN, content=query)])
    )
    log.write(f"\n[bold green]Answer:[/bold green] {output.content}")


async def _dry_run_hybrid(
    query: str,
    rag: RagManager,
    log: RichLog,
) -> None:
    from telaios.core.fusion import reciprocal_rank_fusion

    log.write("[bold cyan]── Hybrid RAG (Chroma + FakeLLM) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.02)

    lc_retriever = rag.create_retriever(_COLLECTION_NAME)
    vec = await lc_retriever.aretrieve(RetrievalQuery(text=query, top_k=5))
    bm25 = await lc_retriever.aretrieve(RetrievalQuery(text=query, top_k=5))

    fused = reciprocal_rank_fusion([vec.chunks, bm25.chunks], k=60)
    log.write(f"\n[bold]RRF fused {len(fused)} chunks (dense + sparse):[/bold]")
    for i, (chunk, _rrf) in enumerate(fused[:3], 1):
        log.write(f"  [{i}] {chunk.content[:140]}…")

    llm = FakeLLM()
    config = RagConfig(strategy=RagStrategy.HYBRID, top_k=3, extra={"rrf_k": 60})
    pipeline = rag.create_pipeline(config, llm=llm, collection_name=_COLLECTION_NAME)  # type: ignore[arg-type]
    output = await pipeline.answer(
        AgentInput(messages=[Message(role=MessageRole.HUMAN, content=query)])
    )
    log.write(f"\n[bold green]Answer:[/bold green] {output.content}")


async def _dry_run_crag(
    query: str,
    rag: RagManager,
    log: RichLog,
) -> None:
    log.write("[bold cyan]── CRAG (Chroma + FakeLLM) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.02)

    llm = FakeLLM()
    config = RagConfig(strategy=RagStrategy.CRAG, top_k=3, extra={"max_rewrite_attempts": 1})
    pipeline = rag.create_pipeline(config, llm=llm, collection_name=_COLLECTION_NAME)  # type: ignore[arg-type]
    output = await pipeline.answer(
        AgentInput(messages=[Message(role=MessageRole.HUMAN, content=query)])
    )
    log.write(f"\n[bold green]Answer:[/bold green] {output.content}")


async def _dry_run_self_rag(
    query: str,
    rag: RagManager,
    log: RichLog,
) -> None:
    log.write("[bold cyan]── Self-RAG (Chroma + FakeLLM) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.02)

    llm = FakeLLM()
    config = RagConfig(strategy=RagStrategy.SELF_RAG, top_k=3, extra={"max_regeneration_rounds": 1})
    pipeline = rag.create_pipeline(config, llm=llm, collection_name=_COLLECTION_NAME)  # type: ignore[arg-type]
    output = await pipeline.answer(
        AgentInput(messages=[Message(role=MessageRole.HUMAN, content=query)])
    )
    log.write(f"\n[bold green]Answer:[/bold green] {output.content}")


async def _dry_run_agentic(
    query: str,
    rag: RagManager,
    log: RichLog,
) -> None:
    log.write("[bold cyan]── Agentic RAG (Chroma + FakeLLM) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.02)

    llm = FakeLLM()
    config = RagConfig(strategy=RagStrategy.AGENTIC, top_k=2, extra={"max_retrieval_rounds": 3})
    pipeline = rag.create_pipeline(config, llm=llm, collection_name=_COLLECTION_NAME)  # type: ignore[arg-type]
    output = await pipeline.answer(
        AgentInput(messages=[Message(role=MessageRole.HUMAN, content=query)])
    )
    log.write(f"\n[bold green]Answer:[/bold green] {output.content}")


async def _dry_run_graph(
    query: str,
    rag: RagManager,
    log: RichLog,
) -> None:
    log.write("[bold cyan]── Graph RAG (Chroma + FakeLLM) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.02)

    llm = FakeLLM()
    config = RagConfig(strategy=RagStrategy.GRAPH, top_k=5)
    pipeline = rag.create_pipeline(config, llm=llm, collection_name=_COLLECTION_NAME)  # type: ignore[arg-type]
    output = await pipeline.answer(
        AgentInput(messages=[Message(role=MessageRole.HUMAN, content=query)])
    )
    log.write(f"\n[bold green]Answer:[/bold green] {output.content}")


async def _dry_run_chat(
    query: str,
    rag: RagManager,
    log: RichLog,
) -> None:
    log.write("[bold cyan]── Agent Chat (Chroma + FakeLLM) ──[/bold cyan]")
    log.write(f"[bold]User:[/bold] {query}")

    llm = FakeLLM()
    config = RagConfig(strategy=RagStrategy.AGENTIC, top_k=3)
    pipeline = rag.create_pipeline(config, llm=llm, collection_name=_COLLECTION_NAME)  # type: ignore[arg-type]
    output = await pipeline.answer(
        AgentInput(messages=[Message(role=MessageRole.HUMAN, content=query)])
    )
    log.write(f"\n[bold green]Assistant:[/bold green] {output.content}")


async def _dry_run_code_review(
    code: str,
    rag: RagManager,
    log: RichLog,
) -> None:
    log.write("[bold cyan]── Code Review (Chroma + FakeLLM) ──[/bold cyan]")
    log.write(f"[dim]Snippet ({len(code)} chars)[/dim]")

    dimensions = [
        ("Correctness", "Does the code do what it claims?"),
        ("Readability", "Is the intent clear without comments?"),
        ("Architecture", "Does it respect module boundaries?"),
        ("Security", "Any injection / auth / PII risks?"),
        ("Performance", "Any obvious N+1 queries or blocking I/O?"),
    ]
    log.write("\n[bold]Review dimensions:[/bold]")
    for name, desc in dimensions:
        log.write(f"  [yellow]{name}[/yellow]: {desc}")

    llm = FakeLLM()
    config = RagConfig(strategy=RagStrategy.SIMPLE, top_k=2)
    pipeline = rag.create_pipeline(config, llm=llm, collection_name=_COLLECTION_NAME)  # type: ignore[arg-type]
    output = await pipeline.answer(
        AgentInput(
            messages=[
                Message(
                    role=MessageRole.HUMAN,
                    content=f"Review this code:\n\n```\n{code}\n```",
                )
            ]
        )
    )
    log.write(f"\n[bold green]Review:[/bold green] {output.content}")


# ---------------------------------------------------------------------------
# Live pipeline runner (uses real LLM via RagManager)
# ---------------------------------------------------------------------------


async def _live_run(
    capability: str,
    query: str,
    llm_cfg: LLMConfig,
    rag: RagManager,
    log: RichLog,
) -> None:
    """Run a live RAG strategy with a real LLM."""
    try:
        from telaios.core.factory import create_llm
    except ImportError:
        log.write(
            "[red]agents extras not installed.[/red]\nRun:  [bold]uv sync --extra agents[/bold]"
        )
        return

    log.write(f"[bold cyan]── {capability} (live) ──[/bold cyan]")
    log.write(f"[dim]Provider:[/dim] {llm_cfg.provider}  [dim]Model:[/dim] {llm_cfg.model}")

    strategy_map: dict[str, RagStrategy] = {
        "simple_rag": RagStrategy.SIMPLE,
        "hybrid_rag": RagStrategy.HYBRID,
        "crag": RagStrategy.CRAG,
        "self_rag": RagStrategy.SELF_RAG,
        "agentic_rag": RagStrategy.AGENTIC,
        "graph_rag": RagStrategy.GRAPH,
        "agent_chat": RagStrategy.AGENTIC,
        "code_review": RagStrategy.SIMPLE,
    }
    strat = strategy_map.get(capability, RagStrategy.SIMPLE)

    llm = create_llm(llm_cfg)
    config = RagConfig(strategy=strat, top_k=3)
    pipeline = rag.create_pipeline(config, llm=llm, collection_name=_COLLECTION_NAME)

    agent_input = AgentInput(messages=[Message(role=MessageRole.HUMAN, content=query)])
    try:
        output = await pipeline.answer(agent_input)
        log.write(f"\n[bold green]Answer:[/bold green] {output.content}")
    except Exception as exc:
        log.write(f"[red]Error:[/red] {exc}")
        log.write(traceback.format_exc())


# ---------------------------------------------------------------------------
# Config state helper
# ---------------------------------------------------------------------------


class _Config:
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    api_key: str = ""
    query: str = "What is RAG and how does it work?"


# ---------------------------------------------------------------------------
# TUI App
# ---------------------------------------------------------------------------


class TelaiOSEval(App[None]):
    """TelaiOS capability evaluator TUI — Chroma-backed."""

    TITLE = "TelaiOS Capability Evaluator"
    CSS = CSS
    BINDINGS: ClassVar[list[Binding]] = [  # type: ignore[assignment]
        Binding("q", "quit", "Quit"),
        Binding("r", "run", "Run"),
        Binding("ctrl+c", "quit", "Quit", show=False),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._cfg = _Config()
        self._rag: RagManager | None = None

    def _get_rag(self) -> RagManager:
        """Lazy-init the RagManager and pre-populate Chroma collection."""
        if self._rag is None:
            self._rag = _init_rag()
        return self._rag

    # ── Layout ──────────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with TabbedContent(id="main-tabs"):
            for tab_id, name, desc in _CAPABILITIES:
                with TabPane(name, id=tab_id):
                    yield from self._compose_cap_pane(tab_id, desc)
        yield Footer()

    def _compose_cap_pane(self, tab_id: str, desc: str) -> ComposeResult:
        yield Static(desc, classes="desc-block")
        with Horizontal(classes="split"):
            with Vertical(classes="config-panel"):
                yield Label("Provider")
                yield Select(
                    options=[(label, val) for val, label in _PROVIDER_OPTIONS],
                    value="openai",
                    id=f"{tab_id}-provider",
                )
                yield Label("Model")
                yield Select(
                    options=[(label, val) for val, label in _MODEL_OPTIONS["openai"]],
                    value="gpt-4o-mini",
                    id=f"{tab_id}-model",
                )
                yield Label("API Key  (optional)")
                yield Input(
                    placeholder="sk-… or leave blank for dry-run",
                    password=True,
                    id=f"{tab_id}-apikey",
                )
                yield Label("Query / Code snippet")
                yield Input(
                    value=self._cfg.query,
                    placeholder="Enter query…",
                    id=f"{tab_id}-query",
                )
                yield Button("Run [r]", variant="primary", classes="run-btn", id=f"{tab_id}-run")
            with Vertical(classes="output-panel"):
                yield RichLog(highlight=True, markup=True, id=f"{tab_id}-log")

    # ── Events ──────────────────────────────────────────────────────────────

    @on(Select.Changed)
    def _on_select_changed(self, event: Select.Changed) -> None:
        widget_id: str = event.select.id or ""
        if not widget_id.endswith("-provider"):
            return
        tab_id = widget_id[: -len("-provider")]
        provider = str(event.value)
        models = _MODEL_OPTIONS.get(provider, _MODEL_OPTIONS["openai"])
        try:
            model_select: Select[str] = self.query_one(f"#{tab_id}-model", Select)
            model_select.set_options([(label, val) for label, val in models])
        except NoMatches:
            pass

    @on(Button.Pressed)
    def _on_run_pressed(self, event: Button.Pressed) -> None:
        btn_id: str = event.button.id or ""
        if not btn_id.endswith("-run"):
            return
        tab_id = btn_id[: -len("-run")]
        self._dispatch_run(tab_id)

    def action_run(self) -> None:
        """Run the currently active tab."""
        active = self.query_one(TabbedContent).active
        if active:
            self._dispatch_run(active)

    # ── Run dispatch ────────────────────────────────────────────────────────

    def _read_inputs(self, tab_id: str) -> tuple[str, str, str, str]:
        """Return (provider, model, api_key, query) for the given tab."""

        def _val(widget_id: str, default: str = "") -> str:
            try:
                w = self.query_one(f"#{widget_id}")
                if isinstance(w, Input):
                    return w.value or default
                if isinstance(w, Select):
                    v = w.value
                    return str(v) if v is not None else default
            except NoMatches:
                pass
            return default

        return (
            _val(f"{tab_id}-provider", "openai"),
            _val(f"{tab_id}-model", "gpt-4o-mini"),
            _val(f"{tab_id}-apikey", ""),
            _val(f"{tab_id}-query", "What is RAG?"),
        )

    def _dispatch_run(self, tab_id: str) -> None:
        provider, model, api_key, query = self._read_inputs(tab_id)
        try:
            log: RichLog = self.query_one(f"#{tab_id}-log", RichLog)
        except NoMatches:
            return
        log.clear()

        rag = self._get_rag()

        if api_key:
            llm_cfg = LLMConfig(provider=provider, model=model, api_key=api_key)
            self._run_live(tab_id, query, llm_cfg, rag, log)
        else:
            self._run_dry(tab_id, query, rag, log)

    @work(exclusive=False)
    async def _run_live(
        self,
        tab_id: str,
        query: str,
        llm_cfg: LLMConfig,
        rag: RagManager,
        log: RichLog,
    ) -> None:
        await _live_run(tab_id.replace("_", " ").title(), query, llm_cfg, rag, log)

    @work(exclusive=False)
    async def _run_dry(self, tab_id: str, query: str, rag: RagManager, log: RichLog) -> None:
        try:
            match tab_id:
                case "simple_rag":
                    await _dry_run_simple(query, rag, log)
                case "hybrid_rag":
                    await _dry_run_hybrid(query, rag, log)
                case "crag":
                    await _dry_run_crag(query, rag, log)
                case "self_rag":
                    await _dry_run_self_rag(query, rag, log)
                case "agentic_rag":
                    await _dry_run_agentic(query, rag, log)
                case "graph_rag":
                    await _dry_run_graph(query, rag, log)
                case "agent_chat":
                    await _dry_run_chat(query, rag, log)
                case "code_review":
                    await _dry_run_code_review(query, rag, log)
                case _:
                    log.write(f"[red]Unknown capability: {tab_id}[/red]")
        except Exception as exc:
            log.write(f"[red]Error:[/red] {exc}")
            log.write(traceback.format_exc())


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Launch the TUI."""
    TelaiOSEval().run()


if __name__ == "__main__":
    main()
