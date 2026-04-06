import { Router } from "express";
import * as planController from "../controllers/plan.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess";

const router = Router();

router.get("/", planController.listPlans);
router.post("/", requireProjectAccess("editor"), planController.createPlan);
router.get("/:id", requireProjectAccess("viewer"), planController.getPlan);
router.patch("/:id", requireProjectAccess("editor"), planController.patchPlan);

export default router;
