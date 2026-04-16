from __future__ import annotations

import json
import os
import re
import subprocess
from typing import List, Optional, Tuple

from pydantic import BaseModel

from agent_service.core.agent_framework.base_agent import BaseAgent, AgentResult as BaseAgentResult
from agent_service.core.agent_framework.context import AgentContext
from agent_service.core.agent_framework.event_bus import get_agent_event_bus
from agent_service.core.llm import build_chat_model
from agent_service.services import data_client
from agent_service.services.embedding_service import embed_texts
from langchain_core.messages import HumanMessage, SystemMessage


class KnowledgeAgentConfig(BaseModel):
    llmProvider: str = "openai"
    llmModel: str = "gpt-4o"
    llmApiKey: str = ""
    llmBaseUrl: Optional[str] = None
    maxContextFiles: int = 10


KNOWLEDGE_SYSTEM_PROMPT = """\
You are an expert software engineer with deep knowledge of codebases.
You have been given snippets from relevant source files and project documents, and are asked a question.

Answer accurately and concisely. If you're unsure, say so explicitly.
Cite specific file paths and line numbers when referencing code, or document names when referencing project documents.

Respond with a JSON object:
{
  "answer": "detailed answer here",
  "confidence": 0.85,
  "sources": ["path/to/file1.ts", "Document: design-spec.pdf"]
}

Respond with ONLY valid JSON. No markdown fences."""


class KnowledgeAgent(BaseAgent):
    def __init__(self, id: str, config: KnowledgeAgentConfig) -> None:
        super().__init__(id, "knowledge")
        self._config = config
        self._llm = None

    async def on_init(self, ctx: AgentContext) -> None:
        self._llm = build_chat_model(
            provider=self._config.llmProvider,
            model=self._config.llmModel,
            api_key=self._config.llmApiKey,
            base_url=self._config.llmBaseUrl,
        )

    async def on_execute(self, ctx: AgentContext) -> None:
        bus = get_agent_event_bus()

        query = (ctx.task.description if ctx.task else None) or (ctx.task.title if ctx.task else None) or "Describe the codebase"
        await bus.publish("knowledge.query", {"agentId": self.id, "executionId": ctx.executionId, "query": query})

        max_files = self._config.maxContextFiles
        context_files: list[dict] = []

        for repo_name, local_path in (ctx.workspaces or {}).items():
            relevant = await self._find_relevant_files(local_path, query, max_files)
            for file_path, content in relevant:
                context_files.append({"repoName": repo_name, "filePath": file_path, "content": content})
                if len(context_files) >= max_files:
                    break
            if len(context_files) >= max_files:
                break

        code_context_block = "\n\n".join(
            f"### {f['repoName']}/{f['filePath']}\n```\n{f['content'][:3000]}\n```"
            for f in context_files
        ) if context_files else ""

        doc_context_block = ""
        try:
            query_embeddings = await embed_texts([query])
            if query_embeddings and query_embeddings[0]:
                chunks = await data_client.search_document_chunks(ctx.project.id, query_embeddings[0], 5)
                if chunks:
                    doc_context_block = "\n\n".join(
                        f"### Document: {c.get('document_name','unknown')} (chunk {c.get('chunk_index',0)})\n{c.get('content','')}"
                        for c in chunks
                    )
        except Exception:
            pass

        parts = []
        if doc_context_block:
            parts.append(f"## Project Documents\n\n{doc_context_block}")
        if code_context_block:
            parts.append(f"## Source Files\n\n{code_context_block}")
        context_block = "\n\n".join(parts) if parts else "No relevant context found."

        response = await self._llm.ainvoke([
            SystemMessage(content=KNOWLEDGE_SYSTEM_PROMPT),
            HumanMessage(content=f"Question: {query}\n\nRelevant context:\n\n{context_block}"),
        ])
        content = response.content if isinstance(response.content, str) else json.dumps(response.content)

        try:
            json_match = re.search(r"\{[\s\S]*\}", content)
            answer = json.loads(json_match.group(0) if json_match else content)
        except Exception:
            answer = {
                "answer": content,
                "confidence": 0.5,
                "sources": [f"{f['repoName']}/{f['filePath']}" for f in context_files],
            }

        self._result = BaseAgentResult(success=True, output=json.dumps(answer))

        await bus.publish("knowledge.answered", {
            "agentId": self.id,
            "executionId": ctx.executionId,
            "confidence": answer.get("confidence", 0.5),
        })

    async def on_cleanup(self) -> None:
        pass

    async def _find_relevant_files(
        self, workspace_path: str, query: str, max_files: int
    ) -> List[Tuple[str, str]]:
        STOP_WORDS = frozenset([
            "the", "a", "an", "in", "on", "at", "of", "for", "to", "is", "are",
            "was", "were", "how", "what", "where", "when", "why", "does", "do",
            "can", "could", "would", "should", "which", "that", "this",
        ])
        keywords = [
            w for w in re.sub(r"[^a-z0-9\s]", " ", query.lower()).split()
            if len(w) > 3 and w not in STOP_WORDS
        ][:5]

        matching_paths: set[str] = set()

        for keyword in keywords:
            if len(matching_paths) >= max_files:
                break
            try:
                result = subprocess.run(
                    ["grep", "-rl", keyword, ".",
                     "--include=*.ts", "--include=*.tsx",
                     "--include=*.js", "--include=*.jsx",
                     "--include=*.py", "--include=*.go", "--include=*.rs"],
                    cwd=workspace_path,
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                for line in result.stdout.strip().split("\n"):
                    p = line.strip().lstrip("./")
                    if p:
                        matching_paths.add(p)
                        if len(matching_paths) >= max_files:
                            break
            except Exception:
                pass

        if len(matching_paths) < max_files:
            walked = self._walk_directory(workspace_path, max_files - len(matching_paths))
            matching_paths.update(walked)

        results: list[tuple[str, str]] = []
        for rel_path in list(matching_paths)[:max_files]:
            try:
                with open(os.path.join(workspace_path, rel_path), "r", encoding="utf-8", errors="replace") as fh:
                    results.append((rel_path, fh.read()))
            except Exception:
                pass

        return results

    def _walk_directory(self, directory: str, limit: int) -> List[str]:
        IGNORE = frozenset([
            "node_modules", ".git", "dist", "build", ".next", "coverage",
            "__pycache__", ".venv", "venv",
        ])
        SRC_EXTS = frozenset([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb"])
        results: list[str] = []

        def walk(current: str) -> None:
            if len(results) >= limit:
                return
            try:
                entries = list(os.scandir(current))
            except Exception:
                return
            for entry in entries:
                if len(results) >= limit:
                    return
                if entry.is_dir() and entry.name not in IGNORE:
                    walk(entry.path)
                elif entry.is_file() and os.path.splitext(entry.name)[1] in SRC_EXTS:
                    results.append(os.path.relpath(entry.path, directory))

        walk(directory)
        return results
