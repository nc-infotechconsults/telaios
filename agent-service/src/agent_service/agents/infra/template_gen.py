from __future__ import annotations

import os


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
