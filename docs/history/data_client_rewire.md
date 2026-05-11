# data_client rewire checklist

Tracks every `NotImplementedError` stub left in the relocated `tools/` and `core/`
packages where the original `agent-service` called through `data_client.py` (an
HTTP client that hit the legacy `data-api` service). These stubs must be
replaced with direct calls to the Python module facades once the relevant
modules land (Phase 7).

---

## Stubs in `server/src/telaios/tools/builtin/documents/processing.py`

| Function | Stub | Target module | Phase |
|---|---|---|---|
| `_get_document` | `raise NotImplementedError("rewire to telaios.modules.documents.service in Phase 7")` | `telaios.modules.documents.service.DocumentService.get_document` | Phase 7A |
| `_update_document_status` | `raise NotImplementedError("rewire to telaios.modules.documents.service in Phase 7")` | `telaios.modules.documents.service.DocumentService.update_status` | Phase 7A |
| `_store_document_chunks` | `raise NotImplementedError("rewire to telaios.modules.documents.service in Phase 7")` | `telaios.modules.documents.service.DocumentService.store_chunks` | Phase 7A |

---

## Verification (run after Phase 7A lands)

```bash
grep -r "NotImplementedError.*rewire" server/src/telaios/tools/builtin/documents/processing.py
# should return nothing
```
