import type { Request, Response } from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { CreateDocumentSchema, PatchDocumentSchema } from "../schemas/document.schema";
import * as documentService from "../services/document.service";
import { uploadToS3, getPresignedDownloadUrl, deleteFromS3, buildS3Key } from "../utils/s3.util";

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

  const parsed = CreateDocumentSchema.safeParse({
    name: originalname,
    file_type,
    mime_type: mimetype,
    s3_key,
    size_bytes: size,
    checksum_sha256,
    status: "processing",
  });

  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }

  const userId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  const doc = await documentService.createDocument(req.params.projectId, userId, parsed.data);

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
