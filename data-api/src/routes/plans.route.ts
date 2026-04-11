import { Router } from "express";
import * as planController from "../controllers/plan.controller";
import * as messageController from "../controllers/message.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router();

router.get("/", planController.listPlans);
router.post("/", requireProjectAccess("editor"), planController.createPlan);
router.get("/:id", requireProjectAccess("viewer"), planController.getPlan);
router.patch("/:id", requireProjectAccess("editor"), planController.patchPlan);
router.delete("/:id", requireProjectAccess("editor"), planController.deletePlan);

// Messages scoped to a plan
router.get("/:id/messages", planController.getPlanMessages);
router.delete("/:id/tasks", requireProjectAccess("editor"), planController.deletePlanTasks);

export default router;
