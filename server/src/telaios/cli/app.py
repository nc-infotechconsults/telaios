"""
telaios.cli.app
---------------
REPL-style TUI for evaluating the KnowledgeBasePipeline.

Commands:
  /ingest <path>   — ingest folder, file, PDF, or URL
  /text <content>  — ingest raw text inline
  /git <url|path>  — ingest any git repo (GitHub, GitLab, Bitbucket, SSH, local)
  /reset           — delete project data from all collections
  /clear           — clear the screen
  /help            — show this help
  <query>          — search the knowledge base and show ranked chunks

Launch:
  uv run telaios-planner
"""

from __future__ import annotations

import logging
import time
import traceback
from datetime import datetime
from pathlib import Path

from textual import on, work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical
from textual.widgets import Button, Footer, Header, Input, RichLog, Static

from telaios.core.knowledge.factory import KnowledgePipelineFactory
from telaios.core.knowledge.retrieval import score_to_tier
from telaios.domain.enums import RelevanceTier
from telaios.core.knowledge_source import (
    DoclingSource,
    FileSource,
    GitSource,
    TextSource,
    URLSource,
)

logger = logging.getLogger(__name__)

_PROJECT_ID = "tui-eval"

# ── CSS ───────────────────────────────────────────────────────────────────────

CSS = """
Screen {
    background: $surface;
    layers: base overlay;
}

/* ── Log area ── */
#log {
    height: 1fr;
    border: none;
    padding: 0 2;
    scrollbar-gutter: stable;
    scrollbar-color: $primary-darken-2 $surface;
}

/* ── Status bar ── */
#statusbar {
    height: 1;
    background: $primary-darken-3;
    color: $text-muted;
    padding: 0 2;
    content-align: left middle;
}

#statusbar.busy {
    background: $warning-darken-2;
    color: $text;
}

#statusbar.error {
    background: $error-darken-2;
    color: $text;
}

/* ── Input row ── */
#input-row {
    height: 3;
    background: $surface-darken-1;
    border-top: solid $primary-darken-2;
    padding: 0 1;
    align: left middle;
}

#prompt {
    color: $primary;
    content-align: left middle;
    width: 2;
}

#cmd {
    height: 3;
    border: none;
    background: transparent;
}

#cmd:focus {
    border: none;
}

#send-btn {
    width: 9;
    height: 3;
    margin-left: 1;
    background: $primary-darken-2;
    color: $text;
    border: none;
}

#send-btn:hover {
    background: $primary;
}

#send-btn:disabled {
    background: $surface-darken-2;
    color: $text-muted;
}

#send-btn.busy {
    background: $warning-darken-2;
}
"""

# ── App ───────────────────────────────────────────────────────────────────────


class TelaiOSEval(App[None]):
    """TelaiOS pipeline evaluation REPL."""

    TITLE = "TelaiOS"
    SUB_TITLE = "RAG Evaluation"
    CSS = CSS
    BINDINGS: list = [
        Binding("ctrl+c", "quit", "Quit", show=True),
        Binding("ctrl+l", "clear_log", "Clear", show=True),
        Binding("up", "history_prev", "Prev", show=False),
        Binding("down", "history_next", "Next", show=False),
        Binding("escape", "cancel_input", "", show=False),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._history: list[str] = []
        self._history_pos: int = -1
        self._busy_count: int = 0

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        yield RichLog(id="log", highlight=True, markup=True, wrap=True)
        yield Static("", id="statusbar")
        with Horizontal(id="input-row"):
            yield Static(">", id="prompt")
            yield Input(id="cmd", placeholder="type a query or /help")
            yield Button("Send", id="send-btn", variant="default")
        yield Footer()

    def on_mount(self) -> None:
        self._set_status("ready", f"project: [bold]{_PROJECT_ID}[/bold]  ·  pipeline: not loaded")
        self._show_welcome()
        self.query_one("#cmd", Input).focus()

    # ── Status bar ───────────────────────────────────────────────────────────

    def _set_status(self, state: str, text: str) -> None:
        bar = self.query_one("#statusbar", Static)
        bar.remove_class("busy", "error")
        if state == "busy":
            bar.add_class("busy")
        elif state == "error":
            bar.add_class("error")
        bar.update(text)

    def _set_busy(self, label: str) -> None:
        self._busy_count += 1
        self._set_status("busy", f"⠿  {label}")
        btn = self.query_one("#send-btn", Button)
        btn.add_class("busy")
        btn.disabled = True

    def _clear_busy(self) -> None:
        self._busy_count = max(0, self._busy_count - 1)
        if self._busy_count == 0:
            self._set_status("ready", f"project: [bold]{_PROJECT_ID}[/bold]  ·  pipeline: ready")
            btn = self.query_one("#send-btn", Button)
            btn.remove_class("busy")
            btn.disabled = False

    # ── Input handling ───────────────────────────────────────────────────────

    @on(Input.Submitted, "#cmd")
    def _on_submit(self, _event: Input.Submitted) -> None:
        self._handle_cmd()

    @on(Button.Pressed, "#send-btn")
    def _on_send(self, _event: Button.Pressed) -> None:
        self._handle_cmd()

    def _handle_cmd(self) -> None:
        inp = self.query_one("#cmd", Input)
        text = inp.value.strip()
        if not text:
            return
        inp.value = ""
        if not self._history or self._history[-1] != text:
            self._history.append(text)
        self._history_pos = -1
        self._dispatch(text)

    def _dispatch(self, text: str) -> None:
        if text.startswith("/ingest "):
            self._run_ingest(text[8:].strip())
        elif text.startswith("/text "):
            self._run_text_ingest(text[6:].strip())
        elif text.startswith("/git "):
            self._run_git_ingest(text[5:].strip())
        elif text == "/reset":
            self._run_reset()
        elif text == "/clear":
            self.action_clear_log()
        elif text in ("/help", "/?"):
            self._show_welcome()
        else:
            self._run_query(text)

    # ── Key actions ──────────────────────────────────────────────────────────

    def action_clear_log(self) -> None:
        self.query_one("#log", RichLog).clear()

    def action_cancel_input(self) -> None:
        inp = self.query_one("#cmd", Input)
        inp.value = ""
        self._history_pos = -1

    def action_history_prev(self) -> None:
        if not self._history:
            return
        inp = self.query_one("#cmd", Input)
        if self._history_pos == -1:
            self._history_pos = len(self._history) - 1
        elif self._history_pos > 0:
            self._history_pos -= 1
        inp.value = self._history[self._history_pos]
        inp.cursor_position = len(inp.value)

    def action_history_next(self) -> None:
        if self._history_pos == -1:
            return
        inp = self.query_one("#cmd", Input)
        if self._history_pos < len(self._history) - 1:
            self._history_pos += 1
            inp.value = self._history[self._history_pos]
        else:
            self._history_pos = -1
            inp.value = ""
        inp.cursor_position = len(inp.value)

    # ── Logging helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _ts() -> str:
        return datetime.now().strftime("%H:%M:%S")

    def _section(self, log: RichLog, title: str) -> None:
        ts = self._ts()
        log.write("")
        log.write(f"[bold white]▶ {title}[/bold white]  [dim]{ts}[/dim]")
        log.write(f"[dim]{'─' * 60}[/dim]")

    def _step(self, log: RichLog, msg: str) -> float:
        log.write(f"  [dim]⠿ {msg}[/dim]")
        return time.monotonic()

    def _done(self, log: RichLog, msg: str, since: float) -> None:
        elapsed = time.monotonic() - since
        log.write(f"  [green]✓[/green] {msg}  [dim]{elapsed:.2f}s[/dim]")

    def _fail(self, log: RichLog, label: str, exc: Exception) -> None:
        log.write(f"  [bold red]✗ {label}:[/bold red] {exc}")
        log.write(f"  [dim]{traceback.format_exc()}[/dim]")
        log.write("")

    def _progress_fn(self, log: RichLog):
        def _emit(msg: str) -> None:
            log.write(f"    [dim]· {msg}[/dim]")
        return _emit

    # ── Workers ──────────────────────────────────────────────────────────────

    @work(exclusive=False)
    async def _run_query(self, query: str) -> None:
        log = self.query_one("#log", RichLog)
        self._section(log, query)
        self._set_busy(f"querying — {query[:50]}")

        try:
            t_total = time.monotonic()

            t = self._step(log, "Loading pipeline…")
            pipeline = await KnowledgePipelineFactory.get()
            self._done(log, "Pipeline ready", t)

            t = self._step(log, "Searching knowledge base…")
            result = await pipeline.query(
                project_id=_PROJECT_ID,
                text=query,
                top_k=5,
                on_progress=self._progress_fn(log),
            )
            self._done(
                log,
                f"[bold]{len(result.chunks)}[/bold] chunk(s) ranked"
                f" from [cyan]{', '.join(result.sources_searched)}[/cyan]",
                t,
            )

            if not result.chunks:
                log.write("")
                log.write("  [yellow]No results.[/yellow] Ingest first:")
                log.write("  [dim]/ingest <path>  ·  /text <content>  ·  /git <url>[/dim]")
                log.write("")
                return

            log.write("")

            # ── Answer ────────────────────────────────────────────────────────
            if result.answer:
                log.write("[bold]Answer[/bold]")
                log.write(f"[dim]{'─' * 60}[/dim]")
                # Wrap answer lines so they indent nicely
                for line in result.answer.splitlines():
                    log.write(f"  {line}")
                log.write("")

                # Citations block
                if result.citations:
                    log.write("[bold]Citations[/bold]")
                    for cit in result.citations:
                        loc = f":{cit.start_line}" if cit.start_line else ""
                        sym = f"  [dim]{cit.symbol_name}[/dim]" if cit.symbol_name else ""
                        col = f" [dim]({cit.collection})[/dim]" if cit.collection else ""
                        log.write(
                            f"  [[bold]{cit.index}[/bold]] [cyan]{cit.source_path}{loc}[/cyan]{sym}{col}"
                        )
                    log.write("")

            # ── Retrieved chunks (sources) ─────────────────────────────────
            log.write(f"[bold]Sources[/bold]  [dim]({len(result.chunks)} retrieved · ranked by RRF)[/dim]")
            log.write(f"[dim]{'─' * 60}[/dim]")
            for i, chunk in enumerate(result.chunks):
                meta = chunk.metadata
                source = meta.get("source_path") or meta.get("title") or "unknown"
                symbol = meta.get("symbol_name")
                sym_type = meta.get("symbol_type") or ""
                lang = meta.get("language") or ""
                collection = meta.get("_collection", "")
                start_line = meta.get("start_line")

                if symbol:
                    loc = f":{start_line}" if start_line else ""
                    header = (
                        f"[cyan]{source}{loc}[/cyan] [bold]{symbol}[/bold]"
                        f"[dim] {sym_type}{' · ' + lang if lang else ''}[/dim]"
                    )
                else:
                    header = f"[cyan]{source}[/cyan]"

                col_badge = f"[dim]({collection})[/dim] " if collection else ""
                if i < len(result.scores):
                    tier = score_to_tier(result.scores[i])
                    tier_markup = {
                        RelevanceTier.HIGH:   "[bold green]high  [/bold green]",
                        RelevanceTier.MEDIUM: "[yellow]medium[/yellow]",
                        RelevanceTier.LOW:    "[dim]low   [/dim]",
                    }[tier]
                else:
                    tier_markup = "[dim]graph [/dim]"
                log.write(f"  [[bold]{i + 1}[/bold]] {col_badge}{tier_markup}  {header}")

                preview = chunk.content[:160].replace("\n", " ").strip()
                if len(chunk.content) > 160:
                    preview += "…"
                log.write(f"  [dim]    {preview}[/dim]")
                log.write("")

            elapsed_total = time.monotonic() - t_total
            log.write(f"  [dim]total: {elapsed_total:.2f}s[/dim]")
            log.write("")

        except Exception as exc:
            self._fail(log, "Query error", exc)
            logger.exception("Query failed")
        finally:
            self._clear_busy()

    @work(exclusive=False)
    async def _run_ingest(self, value: str) -> None:
        log = self.query_one("#log", RichLog)
        self._section(log, f"/ingest {value}")
        self._set_busy(f"ingesting {value[:40]}")

        path = Path(value)
        try:
            t_total = time.monotonic()

            t = self._step(log, "Loading pipeline…")
            pipeline = await KnowledgePipelineFactory.get()
            self._done(log, "Pipeline ready", t)

            progress = self._progress_fn(log)
            total_docs = 0
            total_chunks = 0

            if value.startswith("http://") or value.startswith("https://"):
                t = self._step(log, f"Fetching URL…")
                r = await pipeline.ingest_documents(_PROJECT_ID, URLSource(value), on_progress=progress)
                self._done(log, f"URL → {r.document_count} doc(s), {r.chunk_count} chunk(s)", t)
                total_docs += r.document_count
                total_chunks += r.chunk_count

            elif path.is_dir():
                t = self._step(log, "Scanning folder…")
                files = list(path.rglob("*"))
                text_files = [f for f in files if f.is_file() and _is_text_file(f)]
                doc_files  = [f for f in files if f.is_file() and _is_docling_file(f)]
                self._done(
                    log,
                    f"Found [bold]{len(text_files)}[/bold] code/text  +  "
                    f"[bold]{len(doc_files)}[/bold] document file(s)",
                    t,
                )

                if text_files:
                    t = self._step(log, f"Ingesting {len(text_files)} code/text file(s) → [repositories]…")
                    r = await pipeline.ingest_repository(
                        _PROJECT_ID, FileSource(*[str(f) for f in text_files]), on_progress=progress
                    )
                    self._done(log, f"[repositories] → {r.document_count} doc(s), {r.chunk_count} chunk(s)", t)
                    total_docs += r.document_count
                    total_chunks += r.chunk_count

                if doc_files:
                    t = self._step(log, f"Ingesting {len(doc_files)} document file(s) → [documents]…")
                    r = await pipeline.ingest_documents(
                        _PROJECT_ID, DoclingSource(*[str(f) for f in doc_files]), on_progress=progress
                    )
                    self._done(log, f"[documents] → {r.document_count} doc(s), {r.chunk_count} chunk(s)", t)
                    total_docs += r.document_count
                    total_chunks += r.chunk_count

                if not text_files and not doc_files:
                    log.write("  [yellow]No ingestible files found in folder.[/yellow]")
                    log.write("")
                    return

            elif path.is_file():
                if _is_docling_file(path):
                    t = self._step(log, f"Ingesting {path.name} → [documents]…")
                    r = await pipeline.ingest_documents(_PROJECT_ID, DoclingSource(str(path)), on_progress=progress)
                else:
                    t = self._step(log, f"Ingesting {path.name} → [repositories]…")
                    r = await pipeline.ingest_repository(_PROJECT_ID, FileSource(str(path)), on_progress=progress)
                self._done(log, f"→ {r.document_count} doc(s), {r.chunk_count} chunk(s)", t)
                total_docs += r.document_count
                total_chunks += r.chunk_count

            else:
                log.write(f"  [red]✗ Path not found:[/red] {value}")
                log.write("")
                return

            elapsed_total = time.monotonic() - t_total
            log.write("")
            log.write(
                f"  [bold green]Done[/bold green]  "
                f"[bold]{total_docs}[/bold] file(s) · [bold]{total_chunks}[/bold] chunk(s) · "
                f"project [cyan]{_PROJECT_ID}[/cyan]  [dim]{elapsed_total:.2f}s[/dim]"
            )
            log.write("")

        except Exception as exc:
            self._fail(log, "Ingest error", exc)
            logger.exception("Ingest failed")
        finally:
            self._clear_busy()

    @work(exclusive=False)
    async def _run_text_ingest(self, content: str) -> None:
        log = self.query_one("#log", RichLog)
        preview = content[:50].replace("\n", " ")
        self._section(log, f"/text {preview}{'…' if len(content) > 50 else ''}")
        self._set_busy("ingesting inline text…")

        try:
            t_total = time.monotonic()

            t = self._step(log, "Loading pipeline…")
            pipeline = await KnowledgePipelineFactory.get()
            self._done(log, "Pipeline ready", t)

            t = self._step(log, "Ingesting text → [documents]…")
            r = await pipeline.ingest_documents(
                _PROJECT_ID, TextSource(content, title="inline-text"),
                on_progress=self._progress_fn(log),
            )
            elapsed_total = time.monotonic() - t_total
            self._done(log, f"→ {r.document_count} doc(s), {r.chunk_count} chunk(s)", t)
            log.write("")
            log.write(
                f"  [bold green]Done[/bold green]  [dim]{elapsed_total:.2f}s[/dim]"
            )
            log.write("")

        except Exception as exc:
            self._fail(log, "Text ingest error", exc)
            logger.exception("Text ingest failed")
        finally:
            self._clear_busy()

    @work(exclusive=False)
    async def _run_git_ingest(self, source: str) -> None:
        log = self.query_one("#log", RichLog)
        self._section(log, f"/git {source}")
        self._set_busy(f"cloning/scanning {source[:40]}")

        try:
            t_total = time.monotonic()

            t = self._step(log, "Loading pipeline…")
            pipeline = await KnowledgePipelineFactory.get()
            self._done(log, "Pipeline ready", t)

            if "github.com" in source and source.startswith("http"):
                from telaios.core.knowledge_source import GitHubSource
                src = GitHubSource(source)
                t = self._step(log, "Fetching via GitHub Trees API…")
            else:
                src = GitSource(source)
                action = "Cloning remote repo" if src._is_remote() else "Scanning local git repo"
                provider = src._provider()
                t = self._step(log, f"{action}  [dim][{provider}][/dim]…")

            r = await pipeline.ingest_repository(
                _PROJECT_ID, src, on_progress=self._progress_fn(log)
            )
            elapsed_total = time.monotonic() - t_total
            self._done(log, f"[repositories] → {r.document_count} file(s), {r.chunk_count} chunk(s)", t)
            log.write("")
            log.write(
                f"  [bold green]Done[/bold green]  [dim]{elapsed_total:.2f}s[/dim]"
            )
            log.write("")

        except Exception as exc:
            self._fail(log, "Git ingest error", exc)
            logger.exception("Git ingest failed")
        finally:
            self._clear_busy()

    @work(exclusive=False)
    async def _run_reset(self) -> None:
        log = self.query_one("#log", RichLog)
        self._section(log, "/reset")
        self._set_busy("clearing project data…")

        try:
            t = self._step(log, f"Deleting all data for project [{_PROJECT_ID}]…")
            await KnowledgePipelineFactory.delete_project_data(_PROJECT_ID)
            self._done(log, f"Cleared project [cyan]{_PROJECT_ID}[/cyan]", t)
            log.write("")
        except Exception as exc:
            self._fail(log, "Reset error", exc)
        finally:
            self._clear_busy()

    # ── Welcome ──────────────────────────────────────────────────────────────

    def _show_welcome(self) -> None:
        log = self.query_one("#log", RichLog)
        log.write("")
        log.write("[bold cyan]TelaiOS — RAG Evaluation[/bold cyan]")
        log.write("[dim]HyDE + Hybrid (Qdrant dense · BM25 sparse · RRF) + Graph augmentation[/dim]")
        log.write(f"[dim]Project: {_PROJECT_ID}[/dim]")
        log.write("")
        log.write(f"[dim]{'─' * 60}[/dim]")
        log.write("  [cyan]/ingest[/cyan] [dim]<path>[/dim]      folder, file, PDF, URL")
        log.write("  [cyan]/text[/cyan] [dim]<content>[/dim]     ingest raw text inline")
        log.write("  [cyan]/git[/cyan] [dim]<url|path>[/dim]     GitHub · GitLab · Bitbucket · SSH · local")
        log.write("  [cyan]/reset[/cyan]             delete all project data")
        log.write("  [cyan]/clear[/cyan]  [dim]ctrl+l[/dim]      clear screen")
        log.write("  [dim]↑ ↓[/dim]                 command history")
        log.write("  [dim]<anything else>[/dim]      query the knowledge base")
        log.write(f"[dim]{'─' * 60}[/dim]")
        log.write("")


# ── Helpers ───────────────────────────────────────────────────────────────────


def _is_text_file(path: Path) -> bool:
    return path.suffix.lower() in {
        ".py", ".md", ".txt", ".json", ".yaml", ".yml", ".toml",
        ".cfg", ".ini", ".env", ".sh", ".bash", ".zsh",
        ".js", ".ts", ".tsx", ".jsx", ".css", ".html", ".htm",
        ".xml", ".svg", ".csv", ".sql", ".rst", ".tex", ".conf",
        ".java", ".kt", ".go", ".rs", ".c", ".cpp", ".h", ".hpp",
        ".rb", ".php", ".swift", ".scala",
    } or path.name.lower() in {"makefile", "dockerfile", "jenkinsfile", "vagrantfile"}


def _is_docling_file(path: Path) -> bool:
    return path.suffix.lower() in {".pdf", ".docx", ".pptx", ".xlsx"}


# ── Entry point ───────────────────────────────────────────────────────────────


def main() -> None:
    """Launch the evaluation TUI. Debug logs → tui.log."""
    log_file = Path("tui.log")
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(str(log_file), mode="w"),
        ],
    )
    logger.info("TUI starting — logs at %s", log_file.absolute())
    TelaiOSEval().run()


if __name__ == "__main__":
    main()
