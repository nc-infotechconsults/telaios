import { Router } from "express";
import multer from "multer";
import * as controller from "../controllers/documentTemplate.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage() });

router.get(
  "/:projectId/templates",
  requireProjectAccess("viewer"),
  controller.listProjectTemplates,
);

router.post(
  "/:projectId/templates",
  requireProjectAccess("editor"),
  upload.single("file"),
  controller.createTemplate,
);

export default router;
