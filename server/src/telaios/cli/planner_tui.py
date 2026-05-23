"""
telaios.cli.planner_tui
-----------------------
Textual TUI for the PlannerAgent (LangGraph v2, Postgres-backed).

Use for local dev/validation only.  Production access goes through the
FastAPI SSE endpoints.

Launch
------
  uv run telaios-planner

Workflow
--------
  1. Type your planning objective and press Enter (or click Send).
  2. The agent may ask clarifying questions — answer them in the input box.
  3. When the agent produces a plan, use Confirm or Refuse (+ reason).
  4. After confirmation the thread status changes to ACCEPTED and the
     full task list is shown in the Plan panel on the right.

Layout
------
  Header
  ┌─ Chat log (left) ─────────────┬─ Plan tasks (right) ─────────┐
  │  Streaming events, questions  │  Task list once ready        │
  └───────────────────────────────┴──────────────────────────────┘
  ┌─ [Input] ─────────────── [Send]  [Confirm]  [Refuse] ────────┐
  Footer
"""

from __future__ import annotations

import contextlib
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
    RichLog,
    Static,
)

from telaios.modules.planner.schemas import (
    ChunkEventData,
    DoneEventData,
    ErrorEventData,
    PausePlanReadyEventData,
    PauseQuestionsEventData,
    PlanningSessionStatus,
    ToolCallEventData,
    ToolResultEventData,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------

_CSS = """
Screen {
    background: $surface;
}

#main-split {
    height: 1fr;
}

#chat-panel {
    width: 2fr;
    border: solid $primary-darken-2;
    padding: 0 1;
    height: 1fr;
}

#plan-panel {
    width: 1fr;
    border: solid $primary-darken-2;
    padding: 0 1;
    height: 1fr;
}

#status-bar {
    height: 1;
    padding: 0 1;
    color: $text-muted;
    background: $surface-darken-1;
}

#input-bar {
    height: 3;
    padding: 0 1;
    background: $surface;
}

#message-input {
    width: 1fr;
}

.action-btn {
    margin-left: 1;
    min-width: 12;
}

RichLog {
    height: 1fr;
    scrollbar-gutter: stable;
}
"""


# ---------------------------------------------------------------------------
# TUI App
# ---------------------------------------------------------------------------


class PlannerTUI(App[None]):
    """TelaiOS Planner Agent TUI (dev/validation)."""

    TITLE = "TelaiOS — Planner Agent"
    CSS = _CSS
    BINDINGS: ClassVar = [
        Binding("ctrl+c", "quit", "Quit", show=False),
        Binding("q", "quit", "Quit"),
        Binding("ctrl+s", "send", "Send", show=False),
    ]

    def __init__(self) -> None:
        super().__init__()
        self._service: Any | None = None  # PlannerService; loaded lazily
        self._planner_thread_id: str | None = None
        self._status: PlanningSessionStatus = PlanningSessionStatus.PENDING
        self._is_paused: bool = False
        self._pause_type: str | None = None  # "questions" | "plan_ready"
        self._chunk_buffer: str = ""  # accumulates streaming tokens for one response

    # ── Layout ───────────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with Horizontal(id="main-split"):
            with Vertical(id="chat-panel"):
                yield Static("[bold]Chat[/bold]", classes="panel-title")
                yield RichLog(highlight=True, markup=True, id="chat-log")
            with Vertical(id="plan-panel"):
                yield Static("[bold]Plan[/bold]", classes="panel-title")
                yield RichLog(highlight=True, markup=True, id="plan-log")
        yield Static("Status: initialising…", id="status-bar")
        with Horizontal(id="input-bar"):
            yield Input(
                placeholder="Type your objective or answer here…",
                id="message-input",
            )
            yield Button("Send", variant="primary", classes="action-btn", id="btn-send")
            yield Button(
                "Confirm", variant="success", classes="action-btn", id="btn-confirm", disabled=True
            )
            yield Button(
                "Refuse", variant="error", classes="action-btn", id="btn-refuse", disabled=True
            )
        yield Footer()

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    def on_mount(self) -> None:
        self._init_service()

    @work(exclusive=True)
    async def _init_service(self) -> None:
        self._chat_log("Connecting to PlannerService…")
        try:
            from telaios.modules.planner.service import PlannerService

            self._service = await PlannerService.get_or_create()
            self._planner_thread_id = await self._service.create_thread("tui-user")
            self._chat_log("[green]Ready.[/green] Type your planning objective and press Send.")
            self._set_status("Ready — new thread created")
        except Exception as exc:
            logger.exception("Failed to initialise PlannerService")
            self._chat_log(f"[red]Init error:[/red] {exc}")
            self._chat_log(f"[dim]{traceback.format_exc()}[/dim]")
            self._set_status("Error — see chat log")

    # ── Event handlers ────────────────────────────────────────────────────────

    @on(Button.Pressed, "#btn-send")
    def _on_btn_send(self, _: Button.Pressed) -> None:
        self.action_send()

    @on(Button.Pressed, "#btn-confirm")
    def _on_btn_confirm(self, _: Button.Pressed) -> None:
        self._dispatch_confirm()

    @on(Button.Pressed, "#btn-refuse")
    def _on_btn_refuse(self, _: Button.Pressed) -> None:
        self._dispatch_refuse()

    @on(Input.Submitted, "#message-input")
    def _on_input_submitted(self, _: Input.Submitted) -> None:
        self.action_send()

    # ── Actions ───────────────────────────────────────────────────────────────

    def action_send(self) -> None:
        content = self._take_input()
        if not content:
            return
        if self._service is None:
            self._chat_log("[yellow]Service not ready yet — please wait.[/yellow]")
            return
        if self._planner_thread_id is None:
            self._chat_log("[yellow]No thread — reinitialising…[/yellow]")
            self._init_service()
            return
        self._run_send(content)

    def _dispatch_confirm(self) -> None:
        if self._service is None or self._planner_thread_id is None:
            return
        self._run_confirm()

    def _dispatch_refuse(self) -> None:
        content = self._take_input()
        if not content:
            self._chat_log("[yellow]Enter a reason in the input box before refusing.[/yellow]")
            return
        if self._service is None or self._planner_thread_id is None:
            return
        self._run_refuse(content)

    # ── Workers ───────────────────────────────────────────────────────────────

    @work(exclusive=False)
    async def _run_send(self, content: str) -> None:
        assert self._service is not None
        assert self._planner_thread_id is not None

        self._set_buttons_enabled(False)
        self._chat_log(f"[bold cyan]You:[/bold cyan] {content}")
        self._set_status("Planning…")
        self._is_paused = False
        self._pause_type = None

        try:
            stream = await self._service.send(self._planner_thread_id, "tui-user", content)
            async for event in stream:
                self._handle_sse_event(event)
        except Exception as exc:
            logger.exception("Send failed")
            self._chat_log(f"[red]Error:[/red] {exc}")
            self._set_status("Error")

        self._update_button_states()

    @work(exclusive=False)
    async def _run_confirm(self) -> None:
        assert self._service is not None
        assert self._planner_thread_id is not None

        self._set_buttons_enabled(False)
        self._chat_log("[bold green]You: Confirmed the plan.[/bold green]")
        self._set_status("Confirming…")

        try:
            await self._service.confirm(self._planner_thread_id, "tui-user")
            self._status = PlanningSessionStatus.ACCEPTED
            self._is_paused = False
            self._chat_log("[bold green]Plan accepted. Thread complete.[/bold green]")
            self._set_status("Accepted")
        except Exception as exc:
            logger.exception("Confirm failed")
            self._chat_log(f"[red]Confirm error:[/red] {exc}")
            self._set_status("Error")

        self._update_button_states()

    @work(exclusive=False)
    async def _run_refuse(self, reason: str) -> None:
        assert self._service is not None
        assert self._planner_thread_id is not None

        self._set_buttons_enabled(False)
        self._chat_log(f"[bold red]You:[/bold red] Refused — {reason}")
        self._set_status("Replanning…")
        self._is_paused = False
        self._pause_type = None

        try:
            stream = await self._service.refuse(self._planner_thread_id, "tui-user", reason)
            async for event in stream:
                self._handle_sse_event(event)
        except Exception as exc:
            logger.exception("Refuse failed")
            self._chat_log(f"[red]Refuse error:[/red] {exc}")
            self._set_status("Error")

        self._update_button_states()

    # ── SSE event handling ────────────────────────────────────────────────────

    def _handle_sse_event(self, event: Any) -> None:
        """Translate an SSEEvent into TUI output."""
        data = event.data

        if isinstance(data, ChunkEventData):
            # Accumulate streaming tokens; flush to log on the next non-chunk event
            # or when the done event arrives.
            self._chunk_buffer += data.content

        else:
            # Flush any accumulated chunk buffer before rendering the next event.
            if self._chunk_buffer:
                self._chat_log(f"[bold blue]Agent:[/bold blue] {self._chunk_buffer}")
                self._chunk_buffer = ""

            if isinstance(data, ToolCallEventData):
                self._chat_log(
                    f"  [dim]→ Tool: [yellow]{data.name}[/yellow]  args={data.args}[/dim]"
                )

            elif isinstance(data, ToolResultEventData):
                preview = data.content[:120] + "…" if len(data.content) > 120 else data.content
                self._chat_log(f"  [dim]← {data.name}:[/dim] {preview}")

            elif isinstance(data, PauseQuestionsEventData):
                self._is_paused = True
                self._pause_type = "questions"
                self._status = PlanningSessionStatus.INTERVIEWING
                self._chat_log("\n[bold yellow]Agent has questions:[/bold yellow]")
                for q in data.questions:
                    self._chat_log(f"  [yellow]?[/yellow] {q.question}")
                self._chat_log("[dim]Answer in the input box and press Send.[/dim]")

            elif isinstance(data, PausePlanReadyEventData):
                self._is_paused = True
                self._pause_type = "plan_ready"
                self._status = PlanningSessionStatus.AWAITING_CONFIRMATION
                self._chat_log("\n[bold green]Plan ready for review:[/bold green]")
                self._render_plan_tasks(data)

            elif isinstance(data, DoneEventData):
                # Flush any remaining buffer
                if self._chunk_buffer:
                    self._chat_log(f"[bold blue]Agent:[/bold blue] {self._chunk_buffer}")
                    self._chunk_buffer = ""
                self._status = (
                    PlanningSessionStatus(data.status)
                    if data.status in PlanningSessionStatus._value2member_map_
                    else PlanningSessionStatus.PENDING
                )
                self._set_status(f"Status: {data.status}")

            elif isinstance(data, ErrorEventData):
                self._chat_log(f"[red]Error:[/red] {data.message}")
                self._set_status("Error")

    def _render_plan_tasks(self, data: PausePlanReadyEventData) -> None:
        """Render task list in the right-side plan panel."""
        if data.response:
            self._chat_log(f"\n{data.response}")

        try:
            plan_log: RichLog = self.query_one("#plan-log", RichLog)
            plan_log.clear()
            plan_log.write(f"[bold]Tasks ({len(data.tasks)}):[/bold]\n")
            for i, task in enumerate(data.tasks, 1):
                plan_log.write(f"[bold]{i}. {task.name}[/bold]  [{task.category}]")
                plan_log.write(f"   {task.short_description}")
                if task.dependencies:
                    plan_log.write(f"   [dim]Depends on: {', '.join(task.dependencies)}[/dim]")
                plan_log.write("")
        except NoMatches:
            pass

        self._chat_log(
            f"\n[bold]{len(data.tasks)} task(s)[/bold] ready — Confirm to accept or Refuse with feedback."
        )

    # ── UI helpers ────────────────────────────────────────────────────────────

    def _chat_log(self, text: str) -> None:
        try:
            log: RichLog = self.query_one("#chat-log", RichLog)
            log.write(text)
        except NoMatches:
            pass

    def _set_status(self, text: str) -> None:
        try:
            bar: Static = self.query_one("#status-bar", Static)
            bar.update(f"Status: {text}")
        except NoMatches:
            pass

    def _take_input(self) -> str:
        try:
            inp: Input = self.query_one("#message-input", Input)
            value = inp.value.strip()
            inp.value = ""
            return value
        except NoMatches:
            return ""

    def _set_buttons_enabled(self, enabled: bool) -> None:
        for btn_id in ("#btn-send", "#btn-confirm", "#btn-refuse"):
            try:
                btn: Button = self.query_one(btn_id, Button)
                btn.disabled = not enabled
            except NoMatches:
                pass

    def _update_button_states(self) -> None:
        """Update buttons based on current state."""
        with contextlib.suppress(NoMatches):
            self.query_one("#btn-send", Button).disabled = False

        is_plan_ready = self._is_paused and self._pause_type == "plan_ready"
        for btn_id in ("#btn-confirm", "#btn-refuse"):
            with contextlib.suppress(NoMatches):
                self.query_one(btn_id, Button).disabled = not is_plan_ready


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Launch the Planner TUI."""
    import sys
    from pathlib import Path

    log_file = Path("planner_tui.log")
    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[
            logging.FileHandler(str(log_file), mode="w"),
        ],
    )
    logger.info("Planner TUI starting — logs at %s", log_file.absolute())
    PlannerTUI().run()
    sys.exit(0)


if __name__ == "__main__":
    main()
