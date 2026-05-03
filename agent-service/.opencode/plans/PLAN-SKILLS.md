# Skills Management Compliance Implementation Plan

## Overview

The current skills system in `agent-service` passes `Skill` objects directly via `ToolRegistry.load_skill()`. This plan makes the system fully compliant with the OpenCode skill specification, which requires:

1. **Filesystem-based loading** — Skills loaded from structured directories
2. **SKILL.md parsing** — Frontmatter + markdown parsing with validation
3. **Reference indexing** — Skills indexed by name, description, and tags
4. **Packaging** — Skills packaged as zip files for distribution
5. **Structured filesystem** — Standard directory layout per skill

## OpenCode Skill Specification (from AGENTS.md)

```
skills/
  {skill-name}/           # kebab-case directory name
    SKILL.md              # Required: skill definition
    scripts/              # Required: executable scripts
      {script-name}.sh    # Bash scripts (preferred)
  {skill-name}.zip        # Required: packaged for distribution
```

## Current State Analysis

| Component | Current State | Required State |
|-----------|---------------|----------------|
| Skill loading | `ToolRegistry.load_skill(skill: Skill)` | Load from filesystem directories |
| Skill definition | `Skill` Pydantic model passed as object | Parsed from SKILL.md frontmatter + content |
| Skill storage | In-memory objects | Structured filesystem + optional S3 |
| Skill validation | Pydantic model validation | SKILL.md format validation |
| Skill indexing | None | Name/description/tag index |
| Skill packaging | None | Zip packaging for distribution |
| Skill scripts | None | Scripts directory per skill |

## Architecture

```
src/tools/skill/
├── __init__.py
├── adapter.py              # Existing: Skill → ExecutableTool
├── loader.py               # [NEW] Filesystem skill loader
├── parser.py               # [NEW] SKILL.md parser (frontmatter + content)
├── validator.py            # [NEW] SKILL.md format validator
├── indexer.py              # [NEW] Skill search/index
├── packager.py             # [NEW] Zip packaging
├── registry.py             # [NEW] SkillRegistry (manages loaded skills)
└── types.py                # [NEW] SkillFile, SkillManifest types

src/agent_service/api/
└── skills.py               # [NEW] Skills management API endpoints
```

---

## Phase 1: Core Types and Parsing

### Task 1: Skill File Types

**Description:** Define Pydantic models for skill file representation.

**Acceptance criteria:**
- [ ] `SkillFrontmatter`: name, description, version, tags, author
- [ ] `SkillManifest`: frontmatter + instructions + scripts
- [ ] `SkillFile`: represents a single file in the skill directory
- [ ] `SkillDirectory`: represents the full skill structure
- [ ] All models have validation

**Verification:**
- [ ] Type checks pass
- [ ] Validation rejects invalid frontmatter
- [ ] Round-trip serialization works

**Files likely touched:**
- `src/tools/skill/types.py` (new)
- `src/tools/skill/__init__.py`

**Dependencies:** None

**Estimated scope:** Small (2 files)

---

### Task 2: SKILL.md Parser

**Description:** Parse SKILL.md files extracting YAML frontmatter and markdown content.

**Sources:**
- python-frontmatter: https://pypi.org/project/python-frontmatter/
- YAML spec: https://yaml.org/spec/1.2.2/

**Acceptance criteria:**
- [ ] Parse YAML frontmatter from markdown
- [ ] Extract: name, description, version, tags, author
- [ ] Extract markdown body as instructions
- [ ] Handle missing frontmatter gracefully
- [ ] Return `SkillManifest`

**Verification:**
- [ ] Parse existing skill SKILL.md files
- [ ] Test with malformed frontmatter
- [ ] Test with missing fields

**Files likely touched:**
- `src/tools/skill/parser.py` (new)
- `pyproject.toml` (add python-frontmatter)

**Dependencies:** Task 1

**Estimated scope:** Small (2 files)

---

### Task 3: SKILL.md Validator

**Description:** Validate SKILL.md files against the specification.

**Acceptance criteria:**
- [ ] Required fields: name, description
- [ ] Name format: kebab-case
- [ ] Description: non-empty, max 200 chars
- [ ] Instructions: non-empty markdown body
- [ ] Scripts directory: exists and contains executable scripts
- [ ] Returns validation report with errors/warnings

**Verification:**
- [ ] Validate existing skills
- [ ] Test with invalid SKILL.md files
- [ ] Verify error messages are actionable

**Files likely touched:**
- `src/tools/skill/validator.py` (new)

**Dependencies:** Tasks 1-2

**Estimated scope:** Small (1-2 files)

---

## Phase 2: Filesystem Loading

### Task 4: SkillDirectoryScanner

**Description:** Scan a directory for valid skills and load them.

**Acceptance criteria:**
- [ ] Scan directory for subdirectories
- [ ] For each subdirectory, look for SKILL.md
- [ ] Parse and validate each SKILL.md
- [ ] Collect scripts from scripts/ subdirectory
- [ ] Return list of `SkillManifest` objects
- [ ] Log warnings for invalid skills

**Verification:**
- [ ] Scan existing skills directory
- [ ] Test with mixed valid/invalid skills
- [ ] Verify script discovery

**Files likely touched:**
- `src/tools/skill/loader.py` (new)

**Dependencies:** Tasks 1-3

**Estimated scope:** Medium (2-3 files)

---

### Task 5: SkillRegistry

**Description:** Create a registry that manages loaded skills with CRUD operations.

**Acceptance criteria:**
- [ ] `load_from_directory(path)` — Load skills from filesystem
- [ ] `get(name)` — Get skill by name
- [ ] `list()` — List all skills
- [ ] `search(query)` — Search by name/description/tags
- [ ] `add(skill)` — Add a skill manifest
- [ ] `remove(name)` — Remove a skill
- [ ] Thread-safe operations

**Verification:**
- [ ] Test all CRUD operations
- [ ] Test concurrent access
- [ ] Test search with various queries

**Files likely touched:**
- `src/tools/skill/registry.py` (new)
- `src/tools/skill/__init__.py`

**Dependencies:** Task 4

**Estimated scope:** Medium (2-3 files)

---

### Task 6: ToolRegistry Integration

**Description:** Integrate SkillRegistry with existing ToolRegistry.

**Acceptance criteria:**
- [ ] `ToolRegistry.load_skills_from_directory(path)` — Load and register all skills
- [ ] `ToolRegistry.load_skill_by_name(name)` — Load and register single skill
- [ ] Backward-compatible: `load_skill(skill: Skill)` still works
- [ ] Skills converted to ExecutableTool via existing adapter

**Verification:**
- [ ] Test loading skills from directory
- [ ] Test backward compatibility
- [ ] Verify tools are callable

**Files likely touched:**
- `src/tools/registry.py` (extend)
- `src/tools/skill/adapter.py` (extend if needed)

**Dependencies:** Task 5

**Estimated scope:** Small (1-2 files)

---

## Phase 3: Indexing and Search

### Task 7: Skill Indexer

**Description:** Build a searchable index of skills for fast lookup.

**Acceptance criteria:**
- [ ] Index by name (exact match)
- [ ] Index by description (full-text search)
- [ ] Index by tags (exact match)
- [ ] Index by trigger phrases (from description)
- [ ] Rebuild index on skill changes

**Verification:**
- [ ] Test exact name lookup
- [ ] Test fuzzy description search
- [ ] Test tag filtering

**Files likely touched:**
- `src/tools/skill/indexer.py` (new)

**Dependencies:** Task 5

**Estimated scope:** Small (1-2 files)

---

### Task 8: Skill Reference API

**Description:** API endpoints for skill management.

**Acceptance criteria:**
- [ ] `GET /skills` — List all skills
- [ ] `GET /skills/{name}` — Get skill details
- [ ] `GET /skills/{name}/scripts` — List skill scripts
- [ ] `POST /skills/reload` — Reload skills from filesystem
- [ ] `GET /skills/search?q=...` — Search skills
- [ ] All endpoints require API key auth

**Verification:**
- [ ] Test all endpoints
- [ ] Verify auth enforcement
- [ ] Test with large skill sets

**Files likely touched:**
- `src/agent_service/api/skills.py` (new)
- `src/agent_service/main.py` (mount router)

**Dependencies:** Tasks 5-7

**Estimated scope:** Medium (2-3 files)

---

## Phase 4: Packaging

### Task 9: Skill Packager

**Description:** Package skills into zip files for distribution.

**Acceptance criteria:**
- [ ] `package_skill(skill_dir, output_dir)` — Create zip from skill directory
- [ ] Zip contains: SKILL.md, scripts/, any reference files
- [ ] Zip named `{skill-name}.zip`
- [ ] Validate skill before packaging
- [ ] Return zip file path

**Verification:**
- [ ] Package existing skills
- [ ] Verify zip contents
- [ ] Test with skills containing scripts

**Files likely touched:**
- `src/tools/skill/packager.py` (new)

**Dependencies:** Tasks 1-3

**Estimated scope:** Small (1-2 files)

---

### Task 10: Skill Installer

**Description:** Install skills from zip files or directories.

**Acceptance criteria:**
- [ ] `install_from_zip(zip_path, target_dir)` — Extract and validate
- [ ] `install_from_directory(source_dir, target_dir)` — Copy and validate
- [ ] Validate after installation
- [ ] Handle name conflicts (overwrite/skip/error)
- [ ] Return installation report

**Verification:**
- [ ] Install from zip
- [ ] Install from directory
- [ ] Test conflict handling

**Files likely touched:**
- `src/tools/skill/packager.py` (extend)

**Dependencies:** Task 9

**Estimated scope:** Small (1 file)

---

## Phase 5: Script Execution

### Task 11: Script Executor

**Description:** Execute skill scripts with proper environment handling.

**Acceptance criteria:**
- [ ] Execute bash scripts with timeout
- [ ] Capture stdout/stderr
- [ ] Pass arguments to scripts
- [ ] Set environment variables
- [ ] Return execution result
- [ ] Security: sandbox execution (no arbitrary commands)

**Verification:**
- [ ] Test with simple scripts
- [ ] Test with argument passing
- [ ] Test timeout handling
- [ ] Test error handling

**Files likely touched:**
- `src/tools/skill/executor.py` (new)

**Dependencies:** Task 4

**Estimated scope:** Medium (2-3 files)

---

### Task 12: Script-Based Skill Tool

**Description:** Create an ExecutableTool that runs skill scripts.

**Acceptance criteria:**
- [ ] Tool wraps script execution
- [ ] Input schema matches script arguments
- [ ] Output is script stdout
- [ ] Error handling for script failures
- [ ] Integrates with ToolRegistry

**Verification:**
- [ ] Test tool calling script
- [ ] Verify output passed to LLM
- [ ] Test error scenarios

**Files likely touched:**
- `src/tools/skill/adapter.py` (extend)

**Dependencies:** Task 11

**Estimated scope:** Small (1-2 files)

---

## Phase 6: Configuration and Integration

### Task 13: Skill Configuration

**Description:** Add skill configuration to the service settings.

**Acceptance criteria:**
- [ ] `SKILLS_DIRECTORY` setting (default: `./skills`)
- [ ] `SKILLS_AUTOLOAD` setting (default: true)
- [ ] `SKILLS_PATHS` setting (list of directories to scan)
- [ ] Environment variable support
- [ ] .env file support

**Verification:**
- [ ] Test with custom skills directory
- [ ] Test with multiple paths
- [ ] Test autoload toggle

**Files likely touched:**
- `src/agent_service/config.py` (extend)

**Dependencies:** None

**Estimated scope:** Small (1 file)

---

### Task 14: Startup Integration

**Description:** Load skills during service startup.

**Acceptance criteria:**
- [ ] Load skills in FastAPI lifespan
- [ ] Log loaded skills count
- [ ] Log validation errors
- [ ] Register skills with ToolRegistry
- [ ] Graceful degradation if skills directory missing

**Verification:**
- [ ] Test startup with skills directory
- [ ] Test startup without skills directory
- [ ] Verify skills available after startup

**Files likely touched:**
- `src/agent_service/main.py` (extend lifespan)

**Dependencies:** Tasks 5-6, 13

**Estimated scope:** Small (1 file)

---

## SKILL.md Format Specification

Based on the OpenCode specification:

```yaml
---
name: my-skill                    # Required: kebab-case
description: One sentence description  # Required: max 200 chars
version: 1.0.0                    # Optional: semver
tags: [tag1, tag2]               # Optional: for search
author: name                      # Optional
---

# Skill Title

## Overview
Description of what the skill does.

## When to Use
- Condition 1
- Condition 2

## How It Works
1. Step 1
2. Step 2

## Usage
\`\`\`bash
bash /path/to/scripts/script.sh [args]
\`\`\`

## Output
Expected output format.

## Troubleshooting
Common issues and solutions.
```

## New Dependencies

```toml
# pyproject.toml additions
[project.optional-dependencies]
skills = [
    "python-frontmatter>=1.0.0",
    "pyyaml>=6.0",
]
```

## Migration Plan

### Backward Compatibility

The existing `ToolRegistry.load_skill(skill: Skill)` method continues to work. New methods are additive:

```python
# Existing (still works)
registry.load_skill(skill_object)

# New
registry.load_skills_from_directory("/path/to/skills")
registry.load_skill_by_name("my-skill")
```

### Migration Steps

1. Add new skill types and parser (no breaking changes)
2. Add SkillRegistry alongside existing flow
3. Add filesystem loading as optional feature
4. Add configuration for skills directory
5. Update startup to load from filesystem if configured
6. Deprecate direct `load_skill(skill)` in favor of filesystem loading (future)

## Verification Checklist

- [ ] SKILL.md parsing works for all existing skills
- [ ] Validation catches malformed SKILL.md files
- [ ] Skills loaded from filesystem at startup
- [ ] Skills searchable by name, description, tags
- [ ] Skills packageable as zip files
- [ ] Skills installable from zip files
- [ ] Scripts executable with proper sandboxing
- [ ] API endpoints functional
- [ ] Backward compatibility maintained
- [ ] Configuration via environment variables

## Checkpoint: After Tasks 1-3 (Core Types & Parsing)
- [ ] SKILL.md files parse correctly
- [ ] Validation catches errors
- [ ] Types are well-defined

## Checkpoint: After Tasks 4-6 (Filesystem Loading)
- [ ] Skills load from directory
- [ ] SkillRegistry manages skills
- [ ] ToolRegistry integration works

## Checkpoint: After Tasks 7-8 (Indexing & API)
- [ ] Skills searchable
- [ ] API endpoints functional

## Checkpoint: After Tasks 9-10 (Packaging)
- [ ] Skills packageable as zips
- [ ] Skills installable from zips

## Checkpoint: After Tasks 11-12 (Script Execution)
- [ ] Scripts executable
- [ ] Script-based tools work

## Checkpoint: After Tasks 13-14 (Integration)
- [ ] Skills load at startup
- [ ] Configuration works
- [ ] Full end-to-end flow works
