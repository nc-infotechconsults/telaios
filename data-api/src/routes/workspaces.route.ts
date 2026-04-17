import { Router } from "express";
import * as workspaceController from "../controllers/workspace.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

// Project-scoped workspace routes
router.get(
  "/:projectId/workspaces",
  requireProjectAccess("viewer"),
  workspaceController.listWorkspaces,
);
router.post(
  "/:projectId/workspaces",
  requireProjectAccess("editor"),
  workspaceController.createWorkspace,
);

export default router;
