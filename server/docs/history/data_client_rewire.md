# `data_client` Rewire Checklist

`agent-service/src/telaios/infra/data_client.py` was an HTTP client that called
the `data-api` service for document and chunk operations.  It is **not** copied
into `server/` — all call sites have been replaced with `NotImplementedError`
stubs that must be wired to module facades in Phase 6–7.

## TODO items (one per call site)

| File | Function | `data_client` call | Target facade (Phase) |
|---|---|---|---|
| `tools/builtin/documents/processing.py` | `_get_document` | `data_client.get_document` | `modules.documents.service.DocumentService.get` (Phase 7) |
| `tools/builtin/documents/processing.py` | `_update_document_status` | `data_client.update_document_status` | `modules.documents.service.DocumentService.update_status` (Phase 7) |
| `tools/builtin/documents/processing.py` | `_store_document_chunks` | `data_client.store_document_chunks` | `modules.documents.service.DocumentChunkService.bulk_upsert` (Phase 7) |

## Rewire procedure (for Phase 7)

1. Import the relevant service from the module facade, e.g.
   `from telaios.modules.documents import DocumentService`.
2. Accept the service as a parameter or resolve it from DI.
3. Replace `raise NotImplementedError(...)` with the real call.
4. Delete the `# TODO(migration):` comment.
5. Remove the row from this table.

## Call sites deferred to Phase 6

The following call sites live in `api/routers/` (which is ported in Phase 6–7)
and retain `data_client` references in the legacy `agent-service` source.
They will be handled when those router files are ported:

- `agent-service/src/telaios/api/routers/documents_v2.py` (6 calls)
- `agent-service/src/telaios/api/routers/documents_v2_jobs.py` (4 calls)
- `agent-service/src/telaios/domain/agents/document_assistant.py` (4 calls)
