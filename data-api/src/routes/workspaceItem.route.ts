import { Router } from "express";
import * as workspaceController from "../controllers/workspace.controller";

const router = Router();

router.get("/:id", workspaceController.getWorkspace);
router.patch("/:id", workspaceController.patchWorkspace);
router.delete("/:id", workspaceController.deleteWorkspace);
router.post("/:id/launch", workspaceController.launchWorkspace);

export default router;
