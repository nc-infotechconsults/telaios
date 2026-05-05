# Phase 10 — Delete Legacy

## Objective
Remove `src/agent_service/` entirely, clean up all temporary shims, and perform final verification.

## Commands
```bash
bun run agent:install
bun run agent:test
bun run agent:dev
```

## Tasks

### Task 10.1 — Delete `src/agent_service/`
```bash
rm -rf src/agent_service/
```

### Task 10.2 — Remove Temporary Shims
Delete all shim files created in Phases 3-8:
- `src/agent_service/services/document_converter.py` (shim)
- `src/agent_service/services/chunkers.py` (shim)
- `src/agent_service/services/text_chunker.py` (shim)
- `src/agent_service/services/embedding_service.py` (shim)
- `src/agent_service/services/document_extractor.py` (shim)
- `src/agent_service/services/planning_service/__init__.py` (shim)
- Any other shim files with deprecation warnings

### Task 10.3 — Update `pyproject.toml`
Remove any references to `agent_service`:
```toml
[tool.setuptools.packages.find]
where = ["src"]
# Remove any include/exclude patterns referencing agent_service
```

### Task 10.4 — Search for Remaining References
```bash
# Python files:
rg -n 'agent_service' --type py
# Must return empty

# Non-Python files:
rg -n 'agent_service' --type toml
rg -n 'agent_service' --type yaml
rg -n 'agent_service' --type json
# Review and fix any remaining references
```

### Task 10.5 — Final Verification
Run all verification commands:

```bash
# 1. No agent_service references in Python files
rg -n 'agent_service' --type py
# ^ must return empty

# 2. All tests pass
pytest
# ^ all green

# 3. App boots cleanly
bun run agent:dev
# ^ boots, no errors

# 4. Health check
curl http://localhost:8000/health
# ^ returns 200

# 5. File size check
find src/domain src/api src/tools -name '*.py' -exec wc -l {} + | awk '$1 > 500 {print}'
# ^ should return empty

# 6. Single source of truth for types
rg "from core.types import" src/ | wc -l
# ^ should be high

# 7. No LangGraph in domain/tools
rg "import langgraph" src/domain/ src/tools/ --type py
# ^ should return empty

# 8. OpenAPI schema check
curl http://localhost:8000/openapi.json | python -m json.tool > /tmp/openapi_final.json
# Compare with baseline
```

### Task 10.6 — Commit and Create PR
```bash
git add -A
git commit -m "feat: complete agent-service migration to vendor-agnostic architecture

- Remove src/agent_service/ entirely
- All functionality rebuilt in src/domain/, src/tools/, src/api/
- Vendor-agnostic abstractions in src/core/
- LangGraph provider isolated under src/core/providers/langchain/
- Document copilot v2 only (v1 deleted)
- All tests passing, no file >500 LOC"
```

## Acceptance Criteria
- [x] `rg -n 'agent_service' --type py` returns empty
- [x] Full test suite (`pytest`) passes
- [x] `bun run agent:dev` boots cleanly; health check 200
- [x] No Python file in `src/domain/`, `src/api/`, `src/tools/` exceeds 500 LOC
- [x] `core/types.py` is the only shared type definition (no duplicates)
- [ ] OpenAPI schema diff vs main branch: zero endpoint changes (except version bump)
- [x] Docker compose smoke test (`bun run docker:postgres`) passes
- [ ] Document copilot v2 resume test (start in old code, finish in new) passes

## Implementation Notes
- Verified Python legacy refs empty.
- Verified tests green: `389 passed, 25 skipped`.
- Verified boot + `/health`: `200 {"status":"ok"}`.
- Verified vendor imports isolated out of `src/domain/` and `src/tools/`.
- Fixed recursive review shell wrapper in `src/tools/builtin/agent_tools.py`.
- Fixed path traversal handling in `src/tools/builtin/file_tools.py` to return error strings instead of raising.
- Aligned migrated tests to `ExecutableTool` / tool return-value semantics.

## Risks
- **Hidden runtime dependency on old module path**: Some config files or scripts may still reference `agent_service`. **Mitigation**: Grep for string `agent_service` in non-Python files (`*.toml`, `*.yaml`, `*.json`) too.

## Files Touched
- `src/agent_service/` (delete entire directory)
- All shim files from Phases 3-8 (delete)
- `pyproject.toml` (update — remove agent_service references)

## Verification
```bash
rg -n 'agent_service' --type py
# Must return empty
pytest
# All green
bun run agent:dev
# Boots cleanly
curl http://localhost:8000/health
# Returns 200
```

## Rollback Plan
If integration/regression fails catastrophically:
1. Revert branch to Phase 8 tag
2. Keep `src/agent_service/` in tree (skip Phase 10)
3. Merge feature branch with both old and new coexisting; run dual-stack until next sprint
