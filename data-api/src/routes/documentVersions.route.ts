import { Router } from "express";
import multer from "multer";
import * as controller from "../controllers/documentVersion.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage() });

router.get(
  "/:projectId/documents/:documentId/versions",
  requireProjectAccess("viewer"),
  controller.listVersions,
);

router.post(
  "/:projectId/documents/:documentId/versions",
  requireProjectAccess("editor"),
  upload.single("file"),
  controller.uploadVersion,
);

router.get(
  "/:projectId/documents/:documentId/versions/:versionId/download",
  requireProjectAccess("viewer"),
  controller.downloadVersion,
);

export default router;
