import { z } from "zod";

export const DocumentFileTypeSchema = z.enum([
  "pdf",
  "docx",
  "xlsx",
  "md",
  "txt",
  "csv",
  "json",
  "other",
]);

export const DocumentStatusSchema = z.enum([
  "uploading",
  "processing",
  "ready",
  "error",
]);

export const CreateDocumentSchema = z.object({
  name: z.string().min(1),
  file_type: DocumentFileTypeSchema,
  mime_type: z.string().min(1),
  s3_key: z.string().min(1),
  size_bytes: z.number().int().positive(),
  checksum_sha256: z.string().min(1),
  status: DocumentStatusSchema.optional().default("uploading"),
  metadata: z.record(z.string(), z.unknown()).nullable().optional().default(null),
  folder_id: z.string().uuid().nullable().optional().default(null),
});

export const PatchDocumentStatusSchema = z.object({
  status: DocumentStatusSchema,
  error_message: z.string().nullable().optional(),
});

export const PatchDocumentSchema = z.object({
  name: z.string().min(1).optional(),
  status: DocumentStatusSchema.optional(),
  error_message: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export type CreateDocumentDto = z.infer<typeof CreateDocumentSchema>;
export type PatchDocumentDto = z.infer<typeof PatchDocumentSchema>;
export type PatchDocumentStatusDto = z.infer<typeof PatchDocumentStatusSchema>;
