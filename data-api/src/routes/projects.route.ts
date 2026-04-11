import { Router } from "express";
import * as projectController from "../controllers/project.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router();

router.get("/", projectController.listProjects);
router.post("/", projectController.createProject);
router.get("/:id", requireProjectAccess("viewer"), projectController.getProject);
router.patch("/:id", requireProjectAccess("editor"), projectController.patchProject);
router.delete("/:id", requireProjectAccess("owner"), projectController.deleteProject);

export default router;
