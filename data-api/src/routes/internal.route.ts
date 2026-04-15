import { Router } from "express";
import {
  updateDocumentStatus,
  storeDocumentChunks,
  searchDocumentChunks,
  updatePlanStatus,
  skipDependentTasksHandler,
  cancelPlanTasksHandler,
  createTaskArtifactsHandler,
} from "../controllers/internal.controller";

const router = Router();

// PATCH /internal/documents/:id/status  — update processing status
router.patch("/documents/:id/status", updateDocumentStatus);

// POST  /internal/documents/:id/chunks  — bulk-store embedding chunks
router.post("/documents/:id/chunks", storeDocumentChunks);

// POST  /internal/documents/search      — RAG similarity search
router.post("/documents/search", searchDocumentChunks);

// PATCH /internal/plans/:id/status      — plan lifecycle transitions
router.patch("/plans/:id/status", updatePlanStatus);

// POST  /internal/tasks/:id/skip-dependents — cascade-skip downstream tasks
router.post("/tasks/:id/skip-dependents", skipDependentTasksHandler);

// POST  /internal/plans/:id/cancel-tasks    — cancel all pending/ready tasks
router.post("/plans/:id/cancel-tasks", cancelPlanTasksHandler);

// POST  /internal/tasks/:id/artifacts   — bulk-create execution artifacts
router.post("/tasks/:id/artifacts", createTaskArtifactsHandler);

export default router;
