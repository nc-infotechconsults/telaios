import type { Request, Response } from "express";
import { z } from "zod";
import { PatchDocumentStatusSchema } from "../schemas/document.schema";
import * as documentService from "../services/document.service";
import * as documentChunkService from "../services/documentChunk.service";

// ─── Status update ────────────────────────────────────────────────────────────

export async function updateDocumentStatus(req: Request, res: Response) {
  const parsed = PatchDocumentStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }

  // Internal endpoint: project_id not required; look up by id only
  const doc = await documentService.getDocumentById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });

  const updated = await documentService.patchDocument(doc.id, doc.project_id, {
    status: parsed.data.status,
    error_message: parsed.data.error_message ?? null,
  });

  return res.json(updated);
}

// ─── Chunk storage ────────────────────────────────────────────────────────────

const StoreChunksSchema = z.object({
  chunks: z.array(
    z.object({
      chunk_index: z.number().int().nonnegative(),
      content: z.string().min(1),
      embedding: z.array(z.number()),
      metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    }),
  ),
});

export async function storeDocumentChunks(req: Request, res: Response) {
  const parsed = StoreChunksSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }

  const doc = await documentService.getDocumentById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Not found" });

  await documentChunkService.storeChunks(doc.id, parsed.data.chunks);
  return res.status(201).json({ stored: parsed.data.chunks.length });
}

// ─── Similarity search ────────────────────────────────────────────────────────

const SearchSchema = z.object({
  project_id: z.string().uuid(),
  embedding: z.array(z.number()),
  limit: z.number().int().positive().max(20).optional().default(5),
});

export async function searchDocumentChunks(req: Request, res: Response) {
  const parsed = SearchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }

  const results = await documentChunkService.searchChunks(
    parsed.data.project_id,
    parsed.data.embedding,
    parsed.data.limit,
  );

  return res.json(results);
}
