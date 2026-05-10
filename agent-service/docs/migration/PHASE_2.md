# Phase 2 — Core Factory (LLM Config Deduplication)

## Objective
Consolidate the scattered LLM configuration logic into `core/factory.py`. Migrate the key decryption logic into `infra/crypto.py`. The factory becomes the single entry point for creating agents with properly configured LLMs.

## Commands
```bash
bun run agent:install
pytest tests/core/test_factory.py -v
pytest tests/infra/test_crypto.py -v
```

## Tasks

### Task 2.1 — Write `infra/crypto.py`
Move the encryption/decryption logic from `agent_service/crypto.py`:

```python
"""infra/crypto.py — Encrypted API key decryption."""

from __future__ import annotations

import base64
import os
from cryptography.fernet import Fernet


def _get_fernet_key() -> bytes:
    """Derive a Fernet key from the ENCRYPTION_KEY environment variable."""
    key = os.environ.get("ENCRYPTION_KEY", "")
    if not key:
        raise ValueError("ENCRYPTION_KEY environment variable not set")
    # If the key is already 32 url-safe base64 bytes, use it directly
    if len(key) == 44:
        return key.encode()
    # Otherwise, derive a key using a simple hash
    import hashlib
    return base64.urlsafe_b64encode(hashlib.sha256(key.encode()).digest())


def decrypt(encrypted_value: str) -> str:
    """Decrypt an encrypted value using Fernet symmetric encryption."""
    if not encrypted_value:
        return ""
    fernet = Fernet(_get_fernet_key())
    return fernet.decrypt(encrypted_value.encode()).decode()


def encrypt(plain_value: str) -> str:
    """Encrypt a plain value using Fernet symmetric encryption."""
    fernet = Fernet(_get_fernet_key())
    return fernet.encrypt(plain_value.encode()).decode()
```

### Task 2.2 — Update `core/factory.py`
The existing `core/factory.py` already has `create_agent()` and `create_llm()`. Add LLM config deduplication:

- Import `infra.crypto.decrypt` for API key decryption
- Ensure `create_llm()` handles the decrypted key
- Add a `create_agent_with_config()` helper that takes raw settings dict and produces an `AgentConfig`

### Task 2.3 — Write `core/providers/langchain/llm.py`
Create the LangGraph LLM provider:

```python
"""core/providers/langchain/llm.py — LangGraph LLM implementation."""

from __future__ import annotations

from typing import Any

from telaios.core import LLM, LLMFactory
from telaios.core.types import LLMConfig


class LangChainLLM(LLM):
    """LangChain-based LLM implementation."""

    def __init__(self, config: LLMConfig):
        self._config = config
        self._model = self._build_model(config)

    def _build_model(self, config: LLMConfig) -> Any:
        from agent_service.core.llm import build_chat_model

        return build_chat_model(
            provider=config.provider,
            model=config.model,
            api_key=config.api_key,
            base_url=config.base_url,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            top_p=config.top_p,
            frequency_penalty=config.frequency_penalty,
            presence_penalty=config.presence_penalty,
        )

    async def invoke(self, messages: list[Any], **kwargs: Any) -> Any:
        return await self._model.ainvoke(messages, **kwargs)


# Register at module load
LLMFactory.register("langchain", LangChainLLM)
```

### Task 2.4 — Mark Old LLM Config Blocks for Deletion
In the following files, add `# TODO: Phase 2 dedup — migrated to core/factory.py` comments:
- `src/agent_service/services/planning_service/llm_factory.py`
- Any other file that constructs LLM configs directly

### Task 2.5 — Write Tests
Create `tests/core/test_factory.py`:
- Test that `create_agent()` returns an Agent with correct LLM
- Test that `create_llm()` returns an LLM with correct provider
- Test that `create_agent_with_config()` decrypts API key correctly

Create `tests/infra/test_crypto.py`:
- Test encrypt/decrypt roundtrip with known fixture
- Test decrypt with empty string returns empty string
- Test missing ENCRYPTION_KEY raises ValueError

## Acceptance Criteria
- [x] `pytest tests/core/test_factory.py` passes (15 tests)
- [x] `pytest tests/infra/test_crypto.py` passes (12 tests)
- [x] `core/factory.py` is the only place that constructs `AgentConfig` with LLM
- [x] Old LLM config blocks are marked with `# TODO: Phase 2 dedup` (13 files)
- [x] No duplicate LLM construction logic outside `core/factory.py`

## Status: COMPLETE

## Implementation Notes
- **Crypto format**: The spec suggested Fernet, but the existing `agent_service/crypto.py`
  uses AES-256-CBC with scrypt key derivation. `infra/crypto.py` matches the existing
  format exactly so encrypted values are interoperable without migration.
- **`core/providers/langchain/llm.py`**: Already existed and was fully functional —
  no changes needed (auto-registers providers at import time).
- **TODO comments**: Added to 13 files that directly call `build_chat_model`.

## Risks
- **Encrypted key format mismatch**: The existing encryption format may differ. **Mitigation**: Add unit test for `infra/crypto.py` using a known fixture from the existing `agent_service/crypto.py`.

## Files Touched
- `src/infra/crypto.py` (create)
- `src/core/factory.py` (update)
- `src/core/providers/langchain/llm.py` (create)
- `src/agent_service/services/planning_service/llm_factory.py` (update — add TODO comments)
- `tests/core/test_factory.py` (create)
- `tests/infra/test_crypto.py` (create)

## Verification
```bash
pytest tests/core/test_factory.py tests/infra/test_crypto.py -v
rg "build_chat_model" src/ --type py | grep -v "TODO: Phase 2"
# Should only show core/providers/langchain/llm.py
```
