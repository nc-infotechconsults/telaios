"""
telaios.cli.app
---------------
Textual TUI for evaluating TelaiOS RAG and agent capabilities.

Each tab exercises one strategy or capability against an in-memory corpus
(dry-run mode).  When the ``agents`` optional-dependency group is installed
AND a valid API key is supplied, the TUI runs live LLM calls.

Layout
------
  Header
  ┌─ Tabs: one per capability ──────────────────────────────────┐
  │  Config (left) │ Output log (right)                         │
  └─────────────────────────────────────────────────────────────┘
  Footer  (q: quit  r: run  Tab: navigate)
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

from telaios.cli.mock import InMemoryRetriever
from telaios.core.types import (
    AgentInput,
    LLMConfig,
    Message,
    MessageRole,
    RagConfig,
    RagStrategy,
)

# ---------------------------------------------------------------------------
# Capability descriptors
# ---------------------------------------------------------------------------

_CAPABILITIES: list[tuple[str, str, str]] = [
    # (tab_id, display_name, description)
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
# Helper: dry-run pipeline steps
# ---------------------------------------------------------------------------


async def _dry_run_simple(
    query: str,
    retriever: InMemoryRetriever,
    log: RichLog,
) -> None:
    from telaios.core.types import RetrievalQuery

    log.write("[bold cyan]── Simple RAG (dry-run) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.05)

    result = await retriever.aretrieve(RetrievalQuery(text=query, top_k=3))
    log.write(f"\n[bold]Retrieved {len(result.chunks)} chunks:[/bold]")
    for i, (chunk, score) in enumerate(zip(result.chunks, result.scores, strict=True), 1):
        log.write(f"  [{i}] (score={score:.2f}) {chunk.content[:120]}…")
    await asyncio.sleep(0.05)

    log.write("\n[bold green]LLM[/bold green] [dim](dry-run — no API key provided)[/dim]")
    log.write(
        "  Prompt would contain the above chunks as context.\n"
        "  Supply an API key in the Config panel to run a live call.",
    )


async def _dry_run_hybrid(
    query: str,
    retriever: InMemoryRetriever,
    log: RichLog,
) -> None:
    from telaios.core.fusion import reciprocal_rank_fusion
    from telaios.core.types import RetrievalQuery

    log.write("[bold cyan]── Hybrid RAG (dry-run) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.05)

    vec = await retriever.aretrieve(RetrievalQuery(text=query, top_k=5))
    bm25 = await retriever.aretrieve(RetrievalQuery(text=query, top_k=5))  # same backend here

    fused = reciprocal_rank_fusion([vec.chunks, bm25.chunks], k=60)
    log.write(f"\n[bold]RRF fused {len(fused)} chunks:[/bold]")
    for i, (chunk, _rrf_score) in enumerate(fused[:3], 1):
        log.write(f"  [{i}] {chunk.content[:120]}…")

    log.write("\n[bold green]LLM[/bold green] [dim](dry-run)[/dim]")
    log.write("  Supply an API key for a live call.")


async def _dry_run_crag(
    query: str,
    retriever: InMemoryRetriever,
    log: RichLog,
) -> None:
    from telaios.core.types import RetrievalQuery

    log.write("[bold cyan]── CRAG (dry-run) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.05)

    result = await retriever.aretrieve(RetrievalQuery(text=query, top_k=3))
    log.write(f"\n[bold]Step 1 — Retrieve ({len(result.chunks)} chunks)[/bold]")

    log.write("\n[bold]Step 2 — Grade documents[/bold]  [dim](dry-run: simulated)[/dim]")
    threshold = 0.6
    for chunk, score in zip(result.chunks, result.scores, strict=True):
        verdict = "[green]RELEVANT[/green]" if score >= threshold else "[red]IRRELEVANT[/red]"
        log.write(f"  {verdict} score={score:.2f}  {chunk.content[:80]}…")

    log.write("\n[bold]Step 3 — Generate[/bold]  [dim](dry-run)[/dim]")
    log.write("  Supply an API key for a live call.")


async def _dry_run_self_rag(
    query: str,
    retriever: InMemoryRetriever,
    log: RichLog,
) -> None:
    from telaios.core.types import RetrievalQuery

    log.write("[bold cyan]── Self-RAG (dry-run) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.05)

    result = await retriever.aretrieve(RetrievalQuery(text=query, top_k=3))
    log.write(f"\n[bold]Step 1 — Retrieve ({len(result.chunks)} chunks)[/bold]")

    log.write("\n[bold]Step 2 — Generate[/bold]  [dim](dry-run)[/dim]")
    log.write("  ISREL tokens: [yellow]would grade each chunk for relevance[/yellow]")
    log.write("  ISSUP tokens: [yellow]would check if generation is grounded[/yellow]")
    log.write("  ISUSE tokens: [yellow]would check if answer is useful[/yellow]")

    log.write("\n[bold]Step 3 — Reflect[/bold]  [dim](dry-run)[/dim]")
    log.write("  Supply an API key to see live reflection and possible regeneration.")


async def _dry_run_agentic(
    query: str,
    retriever: InMemoryRetriever,
    log: RichLog,
) -> None:
    from telaios.core.types import RetrievalQuery

    log.write("[bold cyan]── Agentic RAG (dry-run) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.05)

    log.write("\n[bold]Simulated agent loop (max 3 iterations)[/bold]")
    for i in range(1, 3):
        log.write(f"\n  [dim]Iteration {i}[/dim]")
        log.write(f"    Thought: Do I have enough context to answer '{query}'?")
        result = await retriever.aretrieve(RetrievalQuery(text=query, top_k=2))
        log.write(f"    Action:  retrieve_docs(query='{query}')")
        log.write(f"    Result:  {len(result.chunks)} chunks")
        await asyncio.sleep(0.1)

    log.write("\n  [bold green]Final Answer[/bold green]  [dim](dry-run)[/dim]")
    log.write("  Supply an API key to run a real ReAct agent via LangGraph.")


async def _dry_run_graph(
    query: str,
    log: RichLog,
) -> None:
    log.write("[bold cyan]── Graph RAG (dry-run) ──[/bold cyan]")
    log.write(f"[dim]Query:[/dim] {query}")
    await asyncio.sleep(0.05)

    log.write("\n[bold]Step 1 — Entity extraction[/bold]  [dim](dry-run)[/dim]")
    log.write("  Entities: [Python, RAG, LangGraph, …]  (simulated)")

    log.write("\n[bold]Step 2 — Graph traversal[/bold]  [dim](dry-run)[/dim]")
    log.write("  Python → created_by → Guido van Rossum")
    log.write("  RAG    → uses       → Vector Store")
    log.write("  RAG    → uses       → LLM")

    log.write("\n[bold]Step 3 — Context assembly → LLM[/bold]  [dim](dry-run)[/dim]")
    log.write("  Supply a graph store (Neo4j / NetworkX) + API key for a live run.")


async def _dry_run_chat(
    query: str,
    log: RichLog,
) -> None:
    log.write("[bold cyan]── Agent Chat (dry-run) ──[/bold cyan]")
    log.write(f"[bold]User:[/bold] {query}")
    await asyncio.sleep(0.05)

    log.write("\n[dim]Agent would:[/dim]")
    log.write("  1. Route message through LangGraph ReAct graph")
    log.write("  2. Decide whether to invoke tools")
    log.write("  3. Stream text_chunk events back")
    log.write("  4. Persist state via MemorySaver checkpoint")
    log.write("\n[bold green]Assistant[/bold green] [dim](dry-run)[/dim]")
    log.write("  Supply an API key to start a live agent conversation.")


async def _dry_run_code_review(
    code: str,
    log: RichLog,
) -> None:
    log.write("[bold cyan]── Code Review (dry-run) ──[/bold cyan]")
    log.write(f"[dim]Snippet ({len(code)} chars)[/dim]")
    await asyncio.sleep(0.05)

    dimensions = [
        ("Correctness", "Does the code do what it claims?"),
        ("Readability", "Is the intent clear without comments?"),
        ("Architecture", "Does it respect module boundaries?"),
        ("Security", "Any injection / auth / PII risks?"),
        ("Performance", "Any obvious N+1 queries or blocking I/O?"),
    ]
    log.write("\n[bold]Review dimensions:[/bold]")
    for name, desc in dimensions:
        log.write(f"  [yellow]{name}[/yellow]: {desc}  [dim](dry-run)[/dim]")

    log.write("\nSupply an API key to get a full agent-generated review.")


# ---------------------------------------------------------------------------
# Live pipeline runner (requires agents extras)
# ---------------------------------------------------------------------------


async def _live_run(
    capability: str,
    query: str,
    llm_cfg: LLMConfig,
    log: RichLog,
) -> None:
    try:
        from telaios.core.factory import create_llm
        from telaios.core.strategies.simple import SimpleRAG
    except ImportError:
        log.write(
            "[red]agents extras not installed.[/red]\nRun:  [bold]uv sync --extra agents[/bold]"
        )
        return

    log.write(f"[bold cyan]── {capability} (live) ──[/bold cyan]")
    log.write(f"[dim]Provider:[/dim] {llm_cfg.provider}  [dim]Model:[/dim] {llm_cfg.model}")

    retriever = InMemoryRetriever()
    llm = create_llm(llm_cfg)
    config = RagConfig(strategy=RagStrategy.SIMPLE)
    strategy = SimpleRAG(retriever=retriever, llm=llm, config=config)

    agent_input = AgentInput(messages=[Message(role=MessageRole.HUMAN, content=query)])
    try:
        output = await strategy.answer(agent_input)
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
    """TelaiOS capability evaluator TUI."""

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
        self._retriever = InMemoryRetriever()

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

        if api_key:
            llm_cfg = LLMConfig(provider=provider, model=model, api_key=api_key)
            self._run_live(tab_id, query, llm_cfg, log)
        else:
            self._run_dry(tab_id, query, log)

    @work(exclusive=False)
    async def _run_live(
        self,
        tab_id: str,
        query: str,
        llm_cfg: LLMConfig,
        log: RichLog,
    ) -> None:
        await _live_run(tab_id.replace("_", " ").title(), query, llm_cfg, log)

    @work(exclusive=False)
    async def _run_dry(self, tab_id: str, query: str, log: RichLog) -> None:
        try:
            match tab_id:
                case "simple_rag":
                    await _dry_run_simple(query, self._retriever, log)
                case "hybrid_rag":
                    await _dry_run_hybrid(query, self._retriever, log)
                case "crag":
                    await _dry_run_crag(query, self._retriever, log)
                case "self_rag":
                    await _dry_run_self_rag(query, self._retriever, log)
                case "agentic_rag":
                    await _dry_run_agentic(query, self._retriever, log)
                case "graph_rag":
                    await _dry_run_graph(query, log)
                case "agent_chat":
                    await _dry_run_chat(query, log)
                case "code_review":
                    await _dry_run_code_review(query, log)
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
