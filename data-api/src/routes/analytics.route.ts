import { Router } from "express";
import * as analyticsController from "../controllers/analytics.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router();

// Document analytics route registered before the base analytics route
router.get(
  "/:projectId/analytics/documents",
  requireProjectAccess("viewer"),
  analyticsController.getProjectDocAnalytics
);

router.get(
  "/:projectId/analytics",
  requireProjectAccess("viewer"),
  analyticsController.getProjectAnalytics
);

export default router;
