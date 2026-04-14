import { Router } from "express";
import * as projectAgentController from "../controllers/projectAgent.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

router.get("/:projectId/agents", requireProjectAccess("viewer"), projectAgentController.listProjectAgents);
router.post("/:projectId/agents", requireProjectAccess("editor"), projectAgentController.assignAgent);
router.patch("/:projectId/agents/:agentId", requireProjectAccess("editor"), projectAgentController.patchProjectAgent);
router.delete("/:projectId/agents/:agentId", requireProjectAccess("editor"), projectAgentController.removeProjectAgent);

export default router;
