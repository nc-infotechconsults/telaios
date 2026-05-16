"""
telaios.cli.app
---------------
Textual TUI for evaluating TelaiOS RAG and agent capabilities.

Backed by Chroma vector store (ephemeral). Users select knowledge sources
(text, files, URLs, GitHub repos); the system auto-selects the best RAG
strategy based on corpus + query analysis.

Layout
------
  Header
  ┌─ Sources ──┬─ Auto ──┬─ Simple ──┬─ Hybrid ──┬─ CRAG ──┬─ Self ──┬─ Agentic ──┬─ Graph ──┬─ Chat ──┬─ Review ──┐
  │  Config (left) │ Output log (right)                                                       │
  └───────────────────────────────────────────────────────────────────────────────────────────┘
  Footer  (q: quit  r: run  Tab: navigate)

Launch
------
  uv run telaios-eval
"""

from __future__ import annotations

import logging
import traceback
from typing import Any, ClassVar

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
from telaios.core.knowledge_source import (
    DoclingSource,
    FileSource,
    GitHubSource,
    TextSource,
    URLSource,
)
from telaios.core.rag_manager import RagManager
from telaios.core.types import (
    AgentInput,
    EmbeddingConfig,
    LLMConfig,
    Message,
    MessageRole,
    RagConfig,
    RagStrategy,
    VectorStoreConfig,
)

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────────────

_COLLECTION_NAME = "telaios-tui"

_SOURCE_TYPES: list[tuple[str, str]] = [
    ("text", "Paste text"),
    ("file", "Local file(s)"),
    ("document", "PDF/DOCX (Docling)"),
    ("url", "Web URL"),
    ("github", "GitHub repo"),
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

_CAPABILITIES: list[tuple[str, str, str]] = [
    (
        "auto_rag",
        "Auto",
        "System picks the best RAG strategy automatically "
        "based on corpus analysis and query intent.",
    ),
    (
        "simple_rag",
        "Simple RAG",
        "Retrieve → Prepend context → LLM answer. One-shot: no rewriting, no reflection.",
    ),
    (
        "hybrid_rag",
        "Hybrid RAG",
        "Dense + sparse retrieval → RRF fusion → LLM. "
        "Best for mixed content types and domain-specific vocabulary.",
    ),
    (
        "crag",
        "CRAG",
        "Corrective RAG: grade documents → rewrite query or "
        "web-search fallback → LLM. Rejects irrelevant chunks.",
    ),
    (
        "self_rag",
        "Self-RAG",
        "Self-Reflective RAG: reflect on hallucination "
        "→ regenerate if needed. Grounding-aware generation.",
    ),
    (
        "agentic_rag",
        "Agentic RAG",
        "Agent loop decides when and what to retrieve "
        "across multiple hops. Powered by LangGraph ReAct graph.",
    ),
    (
        "graph_rag",
        "Graph RAG",
        "Knowledge-graph traversal for structured relational context. Uses GraphStore abstraction.",
    ),
    (
        "agent_chat",
        "Agent Chat",
        "Freeform multi-turn ReAct agent with tool calls. Checkpointed via LangGraph MemorySaver.",
    ),
    (
        "code_review",
        "Code Review",
        "Agent-based code review across five "
        "dimensions: correctness, readability, architecture, security, performance.",
    ),
]

# ── CSS ──────────────────────────────────────────────────────────────────────

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

#corpus-stats {
    color: $text-muted;
    padding: 1 0;
}
"""

# ── Helpers ──────────────────────────────────────────────────────────────────


def _init_rag() -> RagManager:
    """Create RagManager with ephemeral Chroma + fastembed."""
    return RagManager(
        vector_store=VectorStoreConfig(provider="chroma"),
        embedding=EmbeddingConfig(provider="fastembed", model="BAAI/bge-small-en-v1.5"),
    )


async def _run_pipeline(
    strategy: RagStrategy,
    query: str,
    rag: RagManager,
    llm: Any,
    log: RichLog,
    top_k: int = 3,
    extra: dict[str, Any] | None = None,
) -> None:
    """Execute a RAG pipeline and write results to the log."""

    config = RagConfig(strategy=strategy, top_k=top_k, extra=extra or {})
    pipeline = rag.create_pipeline(config, llm=llm, collection_name=_COLLECTION_NAME)

    log.write(f"[bold cyan]── {strategy.value.upper()} ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")

    output = await pipeline.answer(
        AgentInput(messages=[Message(role=MessageRole.HUMAN, content=query)])
    )
    log.write(f"\n[bold green]Answer:[/bold green] {output.content}")


async def _run_auto(
    query: str,
    rag: RagManager,
    llm: Any,
    log: RichLog,
    corpus_stats: dict[str, Any] | None = None,
) -> None:
    """Auto-select strategy and run."""
    from telaios.core.strategy_selector import StrategySelector

    selector = StrategySelector()
    qp = selector.analyze_query(query)
    cp = selector.analyze_corpus(corpus_stats or {})

    strategy, reason = selector.select(cp, qp)

    log.write("[bold cyan]── Auto Strategy Selection ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    log.write(f"\n[bold]Corpus:[/bold] {cp.document_count} docs, {cp.total_chars} chars")
    log.write(f"[bold]Strategy:[/bold] [yellow]{strategy.value}[/yellow]")
    log.write(f"[bold]Reason:[/bold] [dim]{reason}[/dim]")
    log.write("")

    await _run_pipeline(strategy, query, rag, llm, log, extra={"auto_selected": True})


# ── Config state ─────────────────────────────────────────────────────────────


class _Config:
    source_type: str = "text"
    source_value: str = ""
    provider: str = "openai"
    model: str = "gpt-4o-mini"
    api_key: str = ""
    query: str = "What is RAG and how does it work?"


# ── TUI App ──────────────────────────────────────────────────────────────────


class TelaiOSEval(App[None]):
    """TelaiOS capability evaluator TUI."""

    TITLE = "TelaiOS Capability Evaluator"
    CSS = CSS
    BINDINGS: ClassVar[list[Binding]] = [  # type: ignore[assignment]
        Binding("q", "quit", "Quit"),
        Binding("r", "run", "Run"),
        Binding("i", "ingest", "Ingest"),
        Binding("ctrl+c", "quit", "Quit", show=False),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._cfg = _Config()
        self._rag: RagManager | None = None
        self._corpus_stats: dict[str, Any] | None = None

    def _get_rag(self) -> RagManager:
        if self._rag is None:
            self._rag = _init_rag()
        return self._rag

    # ── Layout ──────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with TabbedContent(id="main-tabs"):
            # Tab 0: Sources (ingest knowledge)
            with TabPane("Sources", id="sources"):
                yield from self._compose_sources_pane()
            # Tabs 1+: Capabilities
            for tab_id, name, desc in _CAPABILITIES:
                with TabPane(name, id=tab_id):
                    yield from self._compose_cap_pane(tab_id, desc)
        yield Footer()

    # ── Sources tab ─────────────────────────────────────────────────────

    def _compose_sources_pane(self) -> ComposeResult:
        yield Static(
            "Select a knowledge source type and click Ingest [i]. "
            "The system extracts, embeds, and stores documents in Chroma.",
            classes="desc-block",
        )
        with Horizontal(classes="split"):
            with Vertical(classes="config-panel"):
                yield Label("Source type")
                yield Select(
                    options=[(label, val) for val, label in _SOURCE_TYPES],
                    value="text",
                    id="source-type",
                )
                yield Label("Source value")
                yield Input(
                    placeholder="Paste text, file path, URL, or GitHub URL…",
                    id="source-value",
                )
                yield Label("GitHub branch (subpath)")
                yield Input(
                    placeholder="main  or  main src/",
                    id="source-github-extra",
                )
                yield Label("GitHub token (optional)")
                yield Input(
                    placeholder="ghp_… or leave blank",
                    password=True,
                    id="source-github-token",
                )
                yield Button("Ingest [i]", variant="primary", classes="run-btn", id="source-ingest")
                yield Static("", id="corpus-stats")
            with Vertical(classes="output-panel"):
                yield RichLog(highlight=True, markup=True, id="source-log")

    @on(Select.Changed, "#source-type")
    def _on_source_type_changed(self, event: Select.Changed) -> None:
        """Update placeholder when source type changes."""
        val = str(event.value)
        try:
            inp: Input = self.query_one("#source-value", Input)
        except NoMatches:
            return
        placeholders: dict[str, str] = {
            "text": "Paste your text / code here…",
            "file": "/path/to/file.md  or  /path/to/docs/  (directory)",
            "document": "/path/to/report.pdf  or  /path/to/slides.pptx",
            "url": "https://example.com/article",
            "github": "https://github.com/owner/repo",
        }
        inp.placeholder = placeholders.get(val, inp.placeholder)

    @on(Button.Pressed, "#source-ingest")
    def _on_ingest_pressed(self, event: Button.Pressed) -> None:
        self._dispatch_ingest()

    def action_ingest(self) -> None:
        self._dispatch_ingest()

    def _read_source_inputs(self) -> tuple[str, str, str, str]:
        """Return (source_type, source_value, github_extra, github_token)."""

        def _val(wid: str, default: str = "") -> str:
            try:
                w = self.query_one(f"#{wid}")
                if isinstance(w, Input):
                    return w.value or default
                if isinstance(w, Select):
                    v = w.value
                    return str(v) if v is not None else default
            except NoMatches:
                pass
            return default

        return (
            _val("source-type", "text"),
            _val("source-value", ""),
            _val("source-github-extra", "main"),
            _val("source-github-token", ""),
        )

    def _dispatch_ingest(self) -> None:
        source_type, source_value, gh_extra, gh_token = self._read_source_inputs()
        logger.debug(
            "Ingest: type=%s value=%s gh=%s",
            source_type,
            source_value[:80],
            gh_extra,
        )
        try:
            log: RichLog = self.query_one("#source-log", RichLog)
            stats_label: Static = self.query_one("#corpus-stats", Static)
        except NoMatches:
            return

        log.clear()
        if not source_value.strip():
            log.write("[red]Please enter a source value.[/red]")
            return

        self._run_ingest(source_type, source_value, gh_extra, gh_token, log, stats_label)

    @work(exclusive=False)
    async def _run_ingest(
        self,
        source_type: str,
        source_value: str,
        gh_extra: str,
        gh_token: str,
        log: RichLog,
        stats_label: Static,
    ) -> None:
        rag = self._get_rag()
        log.write(f"[bold]Ingesting from [yellow]{source_type}[/yellow]:[/bold] {source_value}")

        try:
            source: Any
            match source_type:
                case "text":
                    source = TextSource(source_value, title="user-input")
                case "file":
                    paths = [p.strip() for p in source_value.split(",")]
                    source = FileSource(*paths, label=f"Files: {', '.join(paths)}")
                case "url":
                    source = URLSource(source_value)
                case "document":
                    paths = [p.strip() for p in source_value.split(",")]
                    source = DoclingSource(*paths, label=f"Docling: {', '.join(paths)}")
                case "github":
                    branch = "main"
                    subpath = ""
                    parts = gh_extra.split(maxsplit=1) if gh_extra else []
                    if parts:
                        branch = parts[0]
                        subpath = parts[1] if len(parts) > 1 else ""
                    source = GitHubSource(
                        source_value, branch=branch, subpath=subpath, token=gh_token or None
                    )
                case _:
                    log.write(f"[red]Unknown source type: {source_type}[/red]")
                    return

            stats = await rag.ingest_from_source(source, collection_name=_COLLECTION_NAME)
            self._corpus_stats = stats

            doc_count = stats.get("document_count", 0)
            total_chars = stats.get("total_chars", 0)
            code_ratio = stats.get("code_ratio", 0)
            types = stats.get("source_types", [])

            log.write(f"\n[bold green]Ingested {doc_count} document(s)[/bold green]")
            log.write(f"  Total chars: {total_chars:,}")
            log.write(f"  Source types: {', '.join(types) or 'none'}")
            if code_ratio > 0:
                log.write(f"  Code ratio: {code_ratio:.0%}")
            log.write(f"  Collection: [bold]{_COLLECTION_NAME}[/bold]")
            log.write(
                "\n[dim]Ready — switch to a capability tab and press [bold]r[/bold] to run.[/dim]"
            )

            stats_label.update(
                f"Corpus: {doc_count} docs, {total_chars:,} chars  "
                f"[dim](press Tab to switch to a capability)[/dim]"
            )
        except Exception as exc:
            logger.exception("Ingest failed")
            log.write(f"[red]Ingest error:[/red] {exc}")
            log.write(traceback.format_exc())

    # ── Capability tabs ─────────────────────────────────────────────────

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
                    placeholder="sk-… or leave blank for FakeLLM",
                    password=True,
                    id=f"{tab_id}-apikey",
                )
                yield Label("Query")
                yield Input(
                    value=self._cfg.query,
                    placeholder="Enter query…",
                    id=f"{tab_id}-query",
                )
                yield Button("Run [r]", variant="primary", classes="run-btn", id=f"{tab_id}-run")
            with Vertical(classes="output-panel"):
                yield RichLog(highlight=True, markup=True, id=f"{tab_id}-log")

    # ── Events ──────────────────────────────────────────────────────────

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
        active = self.query_one(TabbedContent).active
        if active:
            self._dispatch_run(active)

    # ── Run dispatch ────────────────────────────────────────────────────

    def _read_inputs(self, tab_id: str) -> tuple[str, str, str, str]:
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
        logger.debug("Run: tab=%s query=%s api=%s", tab_id, query[:80], bool(api_key))
        try:
            log: RichLog = self.query_one(f"#{tab_id}-log", RichLog)
        except NoMatches:
            return
        log.clear()

        rag = self._get_rag()
        llm = self._build_llm(api_key, provider, model)

        self._run(tab_id, query, rag, llm, log)

    def _build_llm(self, api_key: str, provider: str, model: str) -> Any:
        """Build LLM: FakeLLM for dry-run, real LLM if API key provided."""
        if not api_key:
            return FakeLLM()

        try:
            from telaios.core.factory import create_llm

            return create_llm(LLMConfig(provider=provider, model=model, api_key=api_key))
        except Exception:
            return FakeLLM()

    @work(exclusive=False)
    async def _run(
        self,
        tab_id: str,
        query: str,
        rag: RagManager,
        llm: Any,
        log: RichLog,
    ) -> None:
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
        try:
            if tab_id == "auto_rag":
                await _run_auto(query, rag, llm, log, self._corpus_stats)
            else:
                strat = strategy_map.get(tab_id, RagStrategy.SIMPLE)
                await _run_pipeline(strat, query, rag, llm, log)
        except Exception as exc:
            logger.exception("Run failed: tab=%s query=%s", tab_id, query[:80])
            log.write(f"[red]Error:[/red] {exc}")
            log.write(traceback.format_exc())


# ── Entry point ──────────────────────────────────────────────────────────────


def main() -> None:
    """Launch the TUI. Logs are written to ``tui.log`` in the current directory."""
    import logging
    from pathlib import Path

    log_file = Path("tui.log")
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(str(log_file), mode="w"),
            logging.StreamHandler(),  # also goes to stderr, visible via textual console
        ],
    )
    logger = logging.getLogger("telaios")
    logger.info("TUI starting — logs at %s", log_file.absolute())
    TelaiOSEval().run()


if __name__ == "__main__":
    main()
