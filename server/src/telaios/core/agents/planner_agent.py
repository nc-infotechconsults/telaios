import uuid
from enum import StrEnum
from typing import Any, cast

from langchain.chat_models import init_chat_model
from langchain.messages import AnyMessage
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field, PrivateAttr, model_validator

from telaios.core.providers import Provider


class PlanStatus(StrEnum):
    PENDING = "pending"
    INTERVIEWING = "interviewing"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    ACCEPTED = "accepted"
    REFUSED = "refused"


class PlanTask(BaseModel):
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()), description="Unique identifier for the task"
    )
    name: str = Field(description="Name of the task")
    short_description: str = Field(description="Short description of the task")
    details: str = Field(
        description=(
            "Detailed description of the task, with specification about the execution, "
            "condition and all information required to fully accomplish it."
        )
    )
    dependencies: list[str] = Field(
        default_factory=list, description="List of task IDs that this task depends on"
    )
    category: str = Field(description="Category of the task")


class Question(BaseModel):
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()), description="Unique identifier for the question"
    )
    question: str = Field(description="The question to be asked to the user")
    type: str = Field(description="The type of question, e.g., 'yes_no', 'free_form', 'choice'")
    options: list[str] | None = Field(
        default=None, description="List of options for 'choice' type questions"
    )


class PlanResponseFormat(BaseModel):
    tasks: list[PlanTask] | None = Field(
        default=None,
        description="List of tasks that the agent plans to execute to accomplish the goal",
    )
    questions: list[Question] = Field(
        default_factory=list,
        description="List of questions to be asked to the user to have more details to correctly design the plan",
    )
    response: str | None = Field(
        default=None, description="Natural language response to the user, if any"
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _response_to_text(result: PlanResponseFormat) -> str:
    """Serialise a PlanResponseFormat to plain text for conversation history."""
    parts: list[str] = []
    if result.response:
        parts.append(result.response)
    if result.tasks:
        parts.append(f"\nI have created a plan with {len(result.tasks)} task(s):")
        for task in result.tasks:
            parts.append(f"- [{task.category}] {task.name}: {task.short_description}")
    if result.questions:
        parts.append("\nI have some clarifying questions:")
        for q in result.questions:
            parts.append(f"- {q.question}")
    return "\n".join(parts) if parts else "(no output)"


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------


class PlannerSession:
    """Stateful multi-turn conversation with the planner model.

    Status transitions
    ------------------
    PENDING  →  INTERVIEWING  (after first send, no tasks yet)
             →  AWAITING_CONFIRMATION  (after a send that produced tasks)
    INTERVIEWING  →  AWAITING_CONFIRMATION  (follow-up produced tasks)
                  →  INTERVIEWING  (follow-up produced only questions / response)
    AWAITING_CONFIRMATION  →  ACCEPTED  (user called confirm())
                           →  REFUSED   (user called refuse())
    """

    _TERMINAL = frozenset({PlanStatus.ACCEPTED, PlanStatus.REFUSED})

    def __init__(self, model: BaseChatModel, system_prompt: str) -> None:
        self._model = model
        self.messages: list[AnyMessage] = [SystemMessage(content=system_prompt)]
        self.status: PlanStatus = PlanStatus.PENDING
        self.last_response: PlanResponseFormat | None = None

    @property
    def is_terminal(self) -> bool:
        return self.status in self._TERMINAL

    async def send(self, user_message: str) -> PlanResponseFormat:
        """Append a user turn, invoke the model, return the structured response."""
        if self.is_terminal:
            raise RuntimeError(
                f"Session is in terminal state {self.status.value!r}; "
                "create a new session to continue."
            )

        self.messages.append(HumanMessage(content=user_message))
        self.status = PlanStatus.INTERVIEWING

        result = cast(PlanResponseFormat, await self._model.ainvoke(self.messages))

        # Persist AI turn as plain text so the model can refer back to it
        self.messages.append(AIMessage(content=_response_to_text(result)))
        self.last_response = result

        if result.tasks:
            self.status = PlanStatus.AWAITING_CONFIRMATION

        return result

    def confirm(self) -> None:
        """Accept the current plan; transitions to ACCEPTED."""
        self.status = PlanStatus.ACCEPTED

    def refuse(self) -> None:
        """Reject the plan; transitions to REFUSED."""
        self.status = PlanStatus.REFUSED


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------


class PlannerAgent(BaseModel):
    model_provider: str = Provider.OPENAI
    model_name: str = ""
    model_temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    model_max_tokens: int = Field(default=1024, ge=0)

    _model: BaseChatModel | None = PrivateAttr(default=None)

    system_prompt: str = ""
    api_key: str = ""
    base_url: str | None = None

    @model_validator(mode="after")
    def _init_model(self) -> PlannerAgent:
        chat_model_values: dict[str, Any] = {
            "model_provider": self.model_provider,
            "model": self.model_name,
            "temperature": self.model_temperature,
            "max_tokens": self.model_max_tokens,
            "api_key": self.api_key,
        }
        if self.base_url is not None:
            chat_model_values["base_url"] = self.base_url

        self._model = init_chat_model(**chat_model_values).with_structured_output(
            PlanResponseFormat
        )
        return self

    def create_session(self) -> PlannerSession:
        """Create a new multi-turn planning session."""
        assert self._model is not None, "Model not initialised"
        return PlannerSession(self._model, self.system_prompt)

    async def plan(self, prompt: str) -> PlanResponseFormat | None:
        """Single-turn plan generation (backward-compatible helper)."""
        session = self.create_session()
        return await session.send(prompt)
