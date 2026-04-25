import type { Request, Response } from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { CreateDocumentSchema, PatchDocumentSchema } from "../schemas/document.schema";
import * as documentService from "../services/document.service";
import { uploadToS3, getPresignedDownloadUrl, deleteFromS3, buildS3Key } from "../utils/s3.util";
import logger from "../utils/logger";

export async function listDocuments(req: Request, res: Response) {
  const docs = await documentService.listDocuments(req.params.projectId);
  res.json(docs);
}

export async function uploadDocument(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided" });
  }

  const { originalname, mimetype, buffer, size } = req.file;

  // Detect file_type from mimetype / extension
  const ext = originalname.split(".").pop()?.toLowerCase() ?? "";
  const fileTypeMap: Record<string, string> = {
    pdf: "pdf",
    docx: "docx",
    xlsx: "xlsx",
    md: "md",
    txt: "txt",
    csv: "csv",
    json: "json",
  };
  const file_type = fileTypeMap[ext] ?? "other";

  const checksum_sha256 = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");

  const documentId = uuidv4();
  const s3_key = buildS3Key(req.params.projectId, documentId, originalname);

  await uploadToS3(s3_key, buffer, mimetype);

  const folderId = req.body?.folder_id ?? null;

  const parsed = CreateDocumentSchema.safeParse({
    name: originalname,
    file_type,
    mime_type: mimetype,
    s3_key,
    size_bytes: size,
    checksum_sha256,
    status: "processing",
    folder_id: folderId || null,
  });

  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }

  const userId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  const doc = await documentService.createDocument(req.params.projectId, userId, parsed.data);

  // Fire-and-forget: trigger async processing in agent-service
  const agentServiceUrl = process.env.AGENT_SERVICE_URL ?? "http://localhost:8000";
  const internalKey = process.env.INTERNAL_API_KEY ?? "";
  void fetch(`${agentServiceUrl}/documents/${doc.id}/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${internalKey}`,
    },
    body: JSON.stringify({ project_id: req.params.projectId }),
  }).catch((err: unknown) => {
    logger.warn({ err, documentId: doc.id }, "Failed to trigger document processing");
  });

  return res.status(201).json(doc);
}

export async function getDocument(req: Request, res: Response) {
  const doc = await documentService.getDocument(req.params.id, req.params.projectId);
  if (!doc) return res.status(404).json({ error: "Not found" });
  return res.json(doc);
}

export async function getDownloadUrl(req: Request, res: Response) {
  const doc = await documentService.getDocument(req.params.id, req.params.projectId);
  if (!doc) return res.status(404).json({ error: "Not found" });
  const url = await getPresignedDownloadUrl(doc.s3_key);
  return res.json({ url });
}

export async function patchDocument(req: Request, res: Response) {
  const parsed = PatchDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }
  const updated = await documentService.patchDocument(req.params.id, req.params.projectId, parsed.data);
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
}

export async function deleteDocument(req: Request, res: Response) {
  const doc = await documentService.getDocument(req.params.id, req.params.projectId);
  if (!doc) return res.status(404).json({ error: "Not found" });
  await deleteFromS3(doc.s3_key);
  await documentService.deleteDocument(req.params.id, req.params.projectId);
  res.status(204).send();
}

export async function listTrash(req: Request, res: Response) {
  const docs = await documentService.listTrashedDocuments(req.params.projectId);
  res.json(docs);
}

export async function restoreDocument(req: Request, res: Response) {
  await documentService.restoreDocument(req.params.id, req.params.projectId);
  const doc = await documentService.getDocument(req.params.id, req.params.projectId);
  if (!doc) return res.status(404).json({ error: "Not found" });
  return res.json(doc);
}

export async function updateContent(req: Request, res: Response) {
  const { content } = req.body as { content?: string };
  if (typeof content !== "string") {
    return res.status(400).json({ error: "content (string) is required" });
  }

  const doc = await documentService.getDocument(req.params.id, req.params.projectId);
  if (!doc) return res.status(404).json({ error: "Not found" });

  const EDITABLE_TYPES = new Set(["md", "txt", "csv", "json"]);
  if (!EDITABLE_TYPES.has(doc.file_type)) {
    return res.status(422).json({ error: `${doc.file_type} files cannot be edited in-browser` });
  }

  const buffer = Buffer.from(content, "utf-8");
  const checksum_sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  await uploadToS3(doc.s3_key, buffer, doc.mime_type);

  const updated = await documentService.patchDocument(req.params.id, req.params.projectId, {
    size_bytes: buffer.byteLength,
    checksum_sha256,
    status: "ready",
  });

  return res.json(updated);
}

export async function searchDocuments(req: Request, res: Response) {
  const { q, type, tag } = req.query as { q?: string; type?: string; tag?: string };
  const { AppDataSource } = await import("../configs/data-source.config");

  const params: unknown[] = [req.params.projectId];
  let query = `SELECT DISTINCT d.* FROM documents d`;

  if (tag) {
    query += ` JOIN document_document_tags ddt ON ddt.document_id = d.id`;
    query += ` JOIN document_tags dt ON dt.id = ddt.tag_id`;
  }

  if (q) {
    query += ` LEFT JOIN document_chunks dc ON dc.document_id = d.id`;
  }

  query += ` WHERE d.project_id = $1 AND d.deleted_at IS NULL`;

  if (q) {
    params.push(`%${q}%`);
    query += ` AND (d.name ILIKE $${params.length} OR dc.content ILIKE $${params.length})`;
  }

  if (type) {
    params.push(type);
    query += ` AND d.file_type = $${params.length}`;
  }

  if (tag) {
    params.push(tag);
    query += ` AND dt.id = $${params.length}`;
  }

  query += ` ORDER BY d.created_at DESC`;

  const results = await AppDataSource.query(query, params);
  res.json(results);
}
