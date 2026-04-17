import { Router } from "express";
import * as controller from "../controllers/documentActivity.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

router.get(
  "/:projectId/documents/:documentId/activity",
  requireProjectAccess("viewer"),
  controller.listDocumentActivities,
);

router.get(
  "/:projectId/activity/documents",
  requireProjectAccess("viewer"),
  controller.listProjectActivities,
);

export default router;
