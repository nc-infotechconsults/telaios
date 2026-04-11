import { Router } from "express";
import * as taskController from "../controllers/task.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router();

router.get("/", taskController.listTasks);
router.post("/", requireProjectAccess("editor"), taskController.createTask);
router.get("/:id", requireProjectAccess("viewer"), taskController.getTask);
router.patch("/:id", requireProjectAccess("editor"), taskController.patchTask);

export default router;

