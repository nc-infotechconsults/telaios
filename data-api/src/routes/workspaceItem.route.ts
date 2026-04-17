import { Router } from "express";
import * as workspaceController from "../controllers/workspace.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router();

router.get("/:id", requireProjectAccess("viewer"), workspaceController.getWorkspace);
router.patch("/:id", requireProjectAccess("editor"), workspaceController.patchWorkspace);
router.delete("/:id", requireProjectAccess("owner"), workspaceController.deleteWorkspace);
router.post("/:id/launch", requireProjectAccess("editor"), workspaceController.launchWorkspace);

export default router;
