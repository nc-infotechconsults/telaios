import { Router } from "express";
import * as controller from "../controllers/documentCopilot.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

router.post(
  "/:projectId/documents/:id/copilot/summarize",
  requireProjectAccess("viewer"),
  controller.summarize,
);

router.post(
  "/:projectId/documents/:id/copilot/ask",
  requireProjectAccess("viewer"),
  controller.ask,
);

router.post(
  "/:projectId/documents/:id/copilot/extract",
  requireProjectAccess("viewer"),
  controller.extract,
);

export default router;
