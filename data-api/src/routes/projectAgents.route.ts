import { Router } from "express";
import * as projectAgentController from "../controllers/projectAgent.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

// List project agents
router.get(
  "/:projectId/agents",
  requireProjectAccess("viewer"),
  projectAgentController.listProjectAgents,
);

// Clone library agent into project
router.post(
  "/:projectId/agents/from-library/:libraryAgentId",
  requireProjectAccess("editor"),
  projectAgentController.cloneFromLibrary,
);

// Create custom project agent directly
router.post(
  "/:projectId/agents",
  requireProjectAccess("editor"),
  projectAgentController.createProjectAgent,
);

// Update project agent config
router.put(
  "/:projectId/agents/:agentId",
  requireProjectAccess("editor"),
  projectAgentController.updateProjectAgent,
);

// Remove project agent (hard delete)
router.delete(
  "/:projectId/agents/:agentId",
  requireProjectAccess("editor"),
  projectAgentController.removeProjectAgent,
);

export default router;
