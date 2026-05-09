"""
domain/agents/document_copilot.py
---------------------------------
Document Copilot v2 — stateful document processing agent.

Uses ``core.Agent`` ABC and ``core.interrupt.InterruptHandle`` for HITL.
No LangGraph or framework-specific imports.

Lifecycle phases:
1. EXTRACT — Download and extract text from document
2. ANALYZE — Analyze content structure (entities, tables, key-values)
3. CHUNK — Split into segments
4. EMBED — Generate embeddings for chunks
5. WAITING_FOR_HUMAN — HITL pause for review
6. COMPLETE — Processing done

Usage::

    from domain.agents.document_copilot import DocumentCopilot, DocumentCopilotPhase

    copilot = DocumentCopilot(
        agent=agent,
        checkpointer=checkpointer,
        interrupt_handle=interrupt,
        thread_id="doc:project1:doc1:session1",
    )
    result = await copilot.resume()
"""

from __future__ import annotations

import logging
from enum import Enum
from typing import Any

from core.agent import Agent
from core.checkpoint import Checkpointer
from core.interrupt import InterruptHandle
from core.types import (
    AgentInput,
    AgentOutput,
    Message,
    MessageRole,
    DocumentExtractionError,
    DocumentAnalysisError,
    DocumentChunkingError,
    DocumentEmbeddingError,
)

logger = logging.getLogger(__name__)


class DocumentCopilotPhase(str, Enum):
    """Phases of the document copilot lifecycle."""

    EXTRACT = "extract"
    ANALYZE = "analyze"
    CHUNK = "chunk"
    EMBED = "embed"
    WAITING_FOR_HUMAN = "waiting_for_human"
    COMPLETE = "complete"


class DocumentCopilot:
    """
    Stateful document copilot agent.

    Manages the document processing pipeline through discrete phases,
    with checkpoint persistence and optional human-in-the-loop review.

    Args:
        agent: The LLM agent for analysis tasks.
        checkpointer: Checkpoint store for phase persistence.
        interrupt_handle: HITL interrupt handle for human review.
        thread_id: Unique identifier for this processing session.
        project_id: Project ID for document operations.
        document_id: Document ID for document operations.
    """

    def __init__(
        self,
        agent: Agent,
        checkpointer: Checkpointer,
        interrupt_handle: InterruptHandle,
        thread_id: str,
        project_id: str = "",
        document_id: str = "",
    ):
        self._agent = agent
        self._checkpointer = checkpointer
        self._interrupt = interrupt_handle
        self._thread_id = thread_id
        self._project_id = project_id
        self._document_id = document_id
        self._phase = DocumentCopilotPhase.EXTRACT
        self._document_text: str = ""
        self._analysis_result: dict[str, Any] = {}
        self._chunks: list[str] = []
        self._embeddings: list[list[float]] = []

    @property
    def phase(self) -> DocumentCopilotPhase:
        """Current processing phase."""
        return self._phase

    @property
    def thread_id(self) -> str:
        """Thread ID for this session."""
        return self._thread_id

    async def resume(self) -> AgentOutput:
        """Resume from the last checkpoint.

        Loads the saved phase from the checkpoint store and continues
        processing from that point.
        """
        state = await self._checkpointer.get(self._thread_id)
        if state:
            self._phase = DocumentCopilotPhase(state.get("phase", "extract"))
            self._document_text = state.get("document_text", "")
            self._analysis_result = state.get("analysis_result", {})
            self._chunks = state.get("chunks", [])
            self._project_id = state.get("project_id", self._project_id)
            self._document_id = state.get("document_id", self._document_id)

        if self._phase == DocumentCopilotPhase.EXTRACT:
            return await self._extract()
        elif self._phase == DocumentCopilotPhase.ANALYZE:
            return await self._analyze()
        elif self._phase == DocumentCopilotPhase.CHUNK:
            return await self._chunk()
        elif self._phase == DocumentCopilotPhase.EMBED:
            return await self._embed()
        elif self._phase == DocumentCopilotPhase.WAITING_FOR_HUMAN:
            return await self._wait_for_human()
        elif self._phase == DocumentCopilotPhase.COMPLETE:
            return AgentOutput(content="Document processing complete.")
        else:
            return AgentOutput(content="Unknown phase.")

    async def run_phase(self, phase: DocumentCopilotPhase) -> AgentOutput:
        """Run a specific phase directly (for testing or manual control)."""
        self._phase = phase
        await self._save_state()
        return await self.resume()

    async def _extract(self) -> AgentOutput:
        """Extract text content from the document."""
        logger.info("Document copilot: extracting content for %s", self._document_id)

        try:
            from tools.builtin.documents.extraction import extract_text

            # In a real implementation, the document buffer would be fetched
            # from S3 or passed as a parameter. For now, we work with what's
            # in the checkpoint or use the agent to extract.
            if not self._document_text:
                # Use the agent to extract content
                agent_input = AgentInput(
                    messages=[
                        Message(
                            role=MessageRole.SYSTEM,
                            content="Extract the full text content from the document.",
                        ),
                        Message(
                            role=MessageRole.HUMAN,
                            content=f"Document ID: {self._document_id}",
                        ),
                    ]
                )
                result = await self._agent.run(agent_input)
                self._document_text = result.content

            self._phase = DocumentCopilotPhase.ANALYZE
            await self._save_state()
            return await self.resume()

        except Exception as exc:
            logger.error("Document copilot extraction failed: %s", exc)
            raise DocumentExtractionError(f"Extraction failed: {exc}") from exc

    async def _analyze(self) -> AgentOutput:
        """Analyze document content structure."""
        logger.info("Document copilot: analyzing content for %s", self._document_id)

        try:
            prompt = (
                "Analyze the following document and extract:\n"
                "1. Key entities (people, organizations, dates, locations)\n"
                "2. Main topics and themes\n"
                "3. Document structure (sections, headings)\n"
                "4. Key-value pairs (version numbers, statuses, etc.)\n\n"
                f"Document content (first 10k chars):\n{self._document_text[:10000]}"
            )

            agent_input = AgentInput(
                messages=[
                    Message(
                        role=MessageRole.SYSTEM,
                        content="You are an expert document analyst. Extract structured information from the document.",
                    ),
                    Message(role=MessageRole.HUMAN, content=prompt),
                ]
            )
            result = await self._agent.run(agent_input)
            self._analysis_result = {
                "summary": result.content,
                "document_id": self._document_id,
            }

            self._phase = DocumentCopilotPhase.CHUNK
            await self._save_state()
            return await self.resume()

        except Exception as exc:
            logger.error("Document copilot analysis failed: %s", exc)
            raise DocumentAnalysisError(f"Analysis failed: {exc}") from exc

    async def _chunk(self) -> AgentOutput:
        """Split document into chunks."""
        logger.info("Document copilot: chunking document %s", self._document_id)

        try:
            from core.types import ChunkingConfig, Document, DocumentMetadata
            from tools.builtin.documents.chunking import chunk_document

            doc = Document(
                id=self._document_id,
                content=self._document_text,
                metadata=DocumentMetadata(),
            )
            config = ChunkingConfig(strategy="semantic", chunk_size=1000, chunk_overlap=100)
            chunks = chunk_document(doc, config)
            self._chunks = [c.content for c in chunks]

            self._phase = DocumentCopilotPhase.EMBED
            await self._save_state()
            return await self.resume()

        except Exception as exc:
            logger.error("Document copilot chunking failed: %s", exc)
            raise DocumentChunkingError(f"Chunking failed: {exc}") from exc

    async def _embed(self) -> AgentOutput:
        """Generate embeddings for document chunks."""
        logger.info("Document copilot: embedding chunks for %s", self._document_id)

        try:
            from core.types import Chunk
            from tools.builtin.documents.embedding import embed_chunks

            chunks = [
                Chunk(id=f"{self._document_id}:chunk:{i}", document_id=self._document_id, content=c)
                for i, c in enumerate(self._chunks)
            ]
            embedded = await embed_chunks(chunks)
            self._embeddings = [c.embedding or [] for c in embedded]

            # Optionally wait for human review
            self._phase = DocumentCopilotPhase.WAITING_FOR_HUMAN
            await self._save_state()
            return await self.resume()

        except Exception as exc:
            logger.error("Document copilot embedding failed: %s", exc)
            raise DocumentEmbeddingError(f"Embedding failed: {exc}") from exc

    async def _wait_for_human(self) -> AgentOutput:
        """Pause for human review using HITL interrupt."""
        logger.info("Document copilot: waiting for human review on %s", self._document_id)

        self._interrupt.send_interrupt(
            f"Document processing complete for {self._document_id}. "
            f"Analyzed {len(self._chunks)} chunks. Please review."
        )
        resume_value = await self._interrupt.wait_for_resume()

        # Process the resume value
        if resume_value:
            logger.info("Document copilot: human resumed with: %s", resume_value)

        self._phase = DocumentCopilotPhase.COMPLETE
        await self._save_state()
        return AgentOutput(
            content=f"Document processing complete. Resumed with: {resume_value}"
        )

    async def _save_state(self) -> None:
        """Persist current state to the checkpoint store."""
        state = await self._checkpointer.get(self._thread_id) or {}
        state.update(
            {
                "phase": self._phase.value,
                "document_text": self._document_text,
                "analysis_result": self._analysis_result,
                "chunks": self._chunks,
                "project_id": self._project_id,
                "document_id": self._document_id,
            }
        )
        await self._checkpointer.put(self._thread_id, state)

    async def get_state(self) -> dict[str, Any]:
        """Get the current state (for debugging/inspection)."""
        return {
            "phase": self._phase.value,
            "thread_id": self._thread_id,
            "project_id": self._project_id,
            "document_id": self._document_id,
            "document_text_length": len(self._document_text),
            "analysis_result": self._analysis_result,
            "chunks_count": len(self._chunks),
            "embeddings_count": len(self._embeddings),
        }
