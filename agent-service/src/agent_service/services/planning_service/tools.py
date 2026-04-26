from __future__ import annotations

from typing import Any, Dict, List, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel

from agent_service.services.repo_explorer import (
    ensure_local_path,
    list_directory,
    read_file,
    search_code,
)


def _build_repo_tools(repos: List[Dict[str, Any]], project_id: str) -> List[StructuredTool]:
    if not repos:
        return []

    local_path_cache: Dict[str, str] = {}

    async def _get_path(repo_name: str) -> Optional[str]:
        if repo_name in local_path_cache:
            return local_path_cache[repo_name]
        repo = next((r for r in repos if r["name"] == repo_name), None)
        if not repo:
            return None
        try:
            p = await ensure_local_path(repo, project_id)
            local_path_cache[repo_name] = p
            return p
        except Exception:
            return None

    repo_names = ", ".join(r["name"] for r in repos)

    async def list_dir_fn(repo: str, path: str = "") -> str:
        local = await _get_path(repo)
        if not local:
            return f'Repository "{repo}" could not be accessed. Available: {repo_names}'
        return list_directory(local, path)

    async def read_file_fn(repo: str, path: str) -> str:
        local = await _get_path(repo)
        if not local:
            return f'Repository "{repo}" could not be accessed. Available: {repo_names}'
        return read_file(local, path)

    async def search_code_fn(repo: str, pattern: str, file_glob: str = "*") -> str:
        local = await _get_path(repo)
        if not local:
            return f'Repository "{repo}" could not be accessed. Available: {repo_names}'
        return search_code(local, pattern, file_glob)

    class ListDirInput(BaseModel):
        repo: str
        path: str = ""

    class ReadFileInput(BaseModel):
        repo: str
        path: str

    class SearchCodeInput(BaseModel):
        repo: str
        pattern: str
        file_glob: str = "*"

    return [
        StructuredTool.from_function(
            coroutine=list_dir_fn,
            name="list_directory",
            description=(
                f"List files and subdirectories at a path inside a project repository. "
                f"Available repos: {repo_names}. "
                f"Use this to explore the project structure. Start with an empty path to see the root."
            ),
            args_schema=ListDirInput,
        ),
        StructuredTool.from_function(
            coroutine=read_file_fn,
            name="read_file",
            description=(
                f"Read the contents of a file inside a project repository. "
                f"Available repos: {repo_names}. "
                f"Use this to read package.json, config files, entry points, schemas, etc."
            ),
            args_schema=ReadFileInput,
        ),
        StructuredTool.from_function(
            coroutine=search_code_fn,
            name="search_code",
            description=(
                f"Search for a text pattern across repository files (like grep -r). "
                f"Available repos: {repo_names}. "
                f"Use this to find implementations, locate configs, or discover patterns."
            ),
            args_schema=SearchCodeInput,
        ),
    ]
