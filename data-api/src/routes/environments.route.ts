import { Router } from "express";
import * as environmentController from "../controllers/environment.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

// Project-scoped environment routes
router.get(
  "/:projectId/environments",
  requireProjectAccess("viewer"),
  environmentController.listEnvironments,
);
router.post(
  "/:projectId/environments",
  requireProjectAccess("editor"),
  environmentController.createEnvironment,
);

export default router;
