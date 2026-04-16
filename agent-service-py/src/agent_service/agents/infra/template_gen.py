from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import List, Literal, Optional


@dataclass
class InfraTemplate:
    path: str
    content: str
    description: Optional[str] = None


@dataclass
class InfraTemplateRequest:
    stack: str
    target: Literal["docker", "docker-compose", "kubernetes", "ci-github-actions", "ci-gitlab", "all"]
    port: int = 3000
    context: Optional[str] = None


async def write_templates(workspace_path: str, templates: List[InfraTemplate]) -> List[str]:
    """Write generated template files to the workspace. Returns relative paths written."""
    written: list[str] = []
    for tmpl in templates:
        abs_path = os.path.join(workspace_path, tmpl.path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, "w", encoding="utf-8") as fh:
            fh.write(tmpl.content)
        written.append(tmpl.path)
    return written


async def detect_stack(workspace_path: str) -> str:
    """Detect the technology stack of a workspace from indicator files."""
    INDICATORS = [
        ("package.json", "node"),
        ("requirements.txt", "python"),
        ("Pipfile", "python"),
        ("pyproject.toml", "python"),
        ("go.mod", "go"),
        ("Cargo.toml", "rust"),
        ("pom.xml", "java-maven"),
        ("build.gradle", "java-gradle"),
        ("Gemfile", "ruby"),
        ("composer.json", "php"),
    ]
    for file, stack in INDICATORS:
        if os.path.isfile(os.path.join(workspace_path, file)):
            return stack
    return "unknown"


def build_infra_prompt(req: InfraTemplateRequest) -> str:
    targets = (
        ["docker", "docker-compose", "kubernetes", "ci-github-actions"]
        if req.target == "all"
        else [req.target]
    )
    target_list = ", ".join(targets)

    return f"""\
You are an expert DevOps engineer and infrastructure architect.

Generate production-ready infrastructure-as-code files for the following:
- Technology stack: {req.stack}
- Target(s): {target_list}
- Application port: {req.port}
- Additional context: {req.context or "standard web application"}

Requirements:
- Follow best practices for each target (multi-stage Dockerfile, resource limits in k8s, etc.)
- Include security best practices (non-root user in Docker, readiness probes in k8s, etc.)
- Add helpful comments explaining key configuration choices

Respond with a JSON array of files:
[
  {{
    "path": "Dockerfile",
    "content": "# full file content",
    "description": "Multi-stage Dockerfile for production"
  }},
  {{
    "path": "docker-compose.yml",
    "content": "# full file content",
    "description": "Development docker-compose"
  }}
]

Respond with ONLY valid JSON. No markdown fences."""
