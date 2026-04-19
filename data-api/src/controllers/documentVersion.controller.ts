import type { Request, Response } from "express";
import crypto from "crypto";
import { CreateVersionSchema } from "../schemas/documentVersion.schema";
import * as versionService from "../services/documentVersion.service";
import * as documentService from "../services/document.service";
import * as activityService from "../services/documentActivity.service";
import { uploadToS3, getPresignedDownloadUrl } from "../utils/s3.util";

export async function listVersions(req: Request, res: Response) {
  const doc = await documentService.getDocument(req.params.documentId, req.params.projectId);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const versions = await versionService.listVersions(req.params.documentId);
  return res.json(versions);
}

export async function uploadVersion(req: Request, res: Response) {
  if (!req.file) {
    return res.status(400).json({ error: "No file provided" });
  }

  const doc = await documentService.getDocument(req.params.documentId, req.params.projectId);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const parsed = CreateVersionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation error", issues: parsed.error.issues });
  }

  const { originalname, mimetype, buffer, size } = req.file;

  const checksum_sha256 = crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");

  const nextVersion = (await versionService.getLatestVersionNumber(req.params.documentId)) + 1;
  const s3_key = `projects/${req.params.projectId}/documents/${req.params.documentId}/v${nextVersion}/${originalname}`;

  await uploadToS3(s3_key, buffer, mimetype);

  const userId = (req as Request & { user?: { id?: string } }).user?.id ?? null;
  const version = await versionService.createVersion(req.params.documentId, userId, {
    s3_key,
    size_bytes: size,
    checksum_sha256,
    change_description: parsed.data.change_description,
  });

  // Update document's current_version_id
  await documentService.patchDocument(req.params.documentId, req.params.projectId, {});
  const updatedDoc = await documentService.getDocument(req.params.documentId, req.params.projectId);
  if (updatedDoc) {
    updatedDoc.current_version_id = version.id;
    const { AppDataSource } = await import("../configs/data-source.config");
    const { Document } = await import("../entities/Document.entity");
    await AppDataSource.getRepository(Document).save(updatedDoc);
  }

  void activityService.recordActivity(req.params.documentId, userId, "version_created", {
    version_number: version.version_number,
  });

  return res.status(201).json(version);
}

export async function downloadVersion(req: Request, res: Response) {
  const version = await versionService.getVersion(req.params.versionId);
  if (!version) return res.status(404).json({ error: "Version not found" });

  const url = await getPresignedDownloadUrl(version.s3_key);
  return res.json({ url });
}
