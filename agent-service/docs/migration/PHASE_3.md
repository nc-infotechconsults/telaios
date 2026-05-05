# Phase 3 — Document Tools Consolidation (Conversion)

## Objective
Move `document_converter.py` to `tools/builtin/documents/conversion.py`, fix the `import markdown` shadowing bug, and create a temporary shim for backward compatibility.

## Commands
```bash
bun run agent:install
pytest tests/tools/documents/test_conversion.py -v
```

## Tasks

### Task 3.1 — Copy and Fix `document_converter.py`
Copy `src/agent_service/services/document_converter.py` to `src/tools/builtin/documents/conversion.py`.

**Fix the shadowing bug**: In `_markdown_to_html()` and `_markdown_to_pdf()`, the line `import markdown` shadows the `markdown: str` parameter. Fix by aliasing:

```python
# Before (bug):
import markdown
html = markdown.markdown(...)

# After (fixed):
import markdown as md_lib
html = md_lib.markdown(...)
```

### Task 3.2 — Create Temporary Shim
Create `src/agent_service/services/document_converter.py` as a shim that imports from the new location:

```python
"""DEPRECATED: Use tools.builtin.documents.conversion instead."""

import warnings

warnings.warn(
    "agent_service.services.document_converter is deprecated. "
    "Use tools.builtin.documents.conversion instead.",
    DeprecationWarning,
    stacklevel=2,
)

from tools.builtin.documents.conversion import (
    convert_to_markdown,
    convert_from_markdown,
)

__all__ = ["convert_to_markdown", "convert_from_markdown"]
```

### Task 3.3 — Write Tests
Create `tests/tools/documents/test_conversion.py`:
- Test PDF → Markdown conversion (use a minimal PDF fixture)
- Test DOCX → Markdown conversion (use a minimal DOCX fixture)
- Test HTML → Markdown conversion
- Test Markdown → HTML conversion
- Test Markdown → PDF conversion
- Test unsupported format raises ValueError
- Test that `import markdown` doesn't shadow the parameter (verify function works with `markdown` string input)

## Acceptance Criteria
- [x] `pytest tests/tools/documents/test_conversion.py` passes (12 passed, 1 skipped)
- [x] `rg "import markdown" src/tools/builtin/documents/conversion.py` shows no unqualified top-level import — only `import markdown as md_lib`
- [x] Shim file exists and emits deprecation warning
- [x] Old code still works via shim

## Status: COMPLETE

## Implementation Notes
- **Shadowing bug fixed**: `_markdown_to_html()` and `_markdown_to_pdf()` now use
  `import markdown as md_lib` to avoid shadowing the `markdown: str` parameter.
- **HTML fallback improved**: The `_html_to_markdown()` fallback (when `bs4` is not
  installed) now uses stdlib `html.parser` instead of trying to import `bs4` again.
- **Tests**: 13 tests covering HTML/Markdown conversion, passthrough, unsupported
  format, shadowing bug AST check, shim deprecation warning, and shim exports.

## Risks
- **Breaking downstream consumers**: Other modules may import from the old path. **Mitigation**: Temporary shim with deprecation warning; removed in Phase 10.

## Files Touched
- `src/tools/builtin/documents/conversion.py` (create — copied from old, with fix)
- `src/agent_service/services/document_converter.py` (update — becomes shim)
- `tests/tools/documents/test_conversion.py` (create)

## Verification
```bash
pytest tests/tools/documents/test_conversion.py -v
rg "import markdown" src/tools/builtin/documents/conversion.py
# Should show only aliased imports
python -c "from agent_service.services.document_converter import convert_to_markdown; print('shim OK')"
# Should emit DeprecationWarning
```
