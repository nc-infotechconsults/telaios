import { Router } from "express";
import multer from "multer";
import * as documentController from "../controllers/document.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage() });

router.get(
  "/:projectId/documents",
  requireProjectAccess("viewer"),
  documentController.listDocuments,
);

router.post(
  "/:projectId/documents",
  requireProjectAccess("editor"),
  upload.single("file"),
  documentController.uploadDocument,
);

router.get(
  "/:projectId/documents/:id",
  requireProjectAccess("viewer"),
  documentController.getDocument,
);

router.get(
  "/:projectId/documents/:id/download",
  requireProjectAccess("viewer"),
  documentController.getDownloadUrl,
);

router.patch(
  "/:projectId/documents/:id",
  requireProjectAccess("editor"),
  documentController.patchDocument,
);

router.delete(
  "/:projectId/documents/:id",
  requireProjectAccess("editor"),
  documentController.deleteDocument,
);

export default router;
