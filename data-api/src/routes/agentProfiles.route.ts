import { Router } from "express";
import * as agentProfileController from "../controllers/agentProfile.controller";
import { requireSystemRole } from "../middleware/requireSystemRole.middleware";

const router = Router();

router.get("/", agentProfileController.listAgentProfiles);
router.post("/", requireSystemRole("admin"), agentProfileController.createAgentProfile);
router.post("/mcp-discover", agentProfileController.discoverMcpTools);
router.get("/:id", agentProfileController.getAgentProfile);
router.patch("/:id", requireSystemRole("admin"), agentProfileController.patchAgentProfile);
router.delete("/:id", requireSystemRole("admin"), agentProfileController.deleteAgentProfile);

export default router;
