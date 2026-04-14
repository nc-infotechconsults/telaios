import { Router } from "express";
import {
  updateDocumentStatus,
  storeDocumentChunks,
  searchDocumentChunks,
} from "../controllers/internal.controller";

const router = Router();

// PATCH /internal/documents/:id/status  — update processing status
router.patch("/documents/:id/status", updateDocumentStatus);

// POST  /internal/documents/:id/chunks  — bulk-store embedding chunks
router.post("/documents/:id/chunks", storeDocumentChunks);

// POST  /internal/documents/search      — RAG similarity search
router.post("/documents/search", searchDocumentChunks);

export default router;
