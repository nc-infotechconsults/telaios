import { Router } from "express";
import * as taskController from "../controllers/task.controller";
import * as taskArtifactController from "../controllers/task_artifact.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router();

router.get("/", taskController.listTasks);
router.post("/", requireProjectAccess("editor"), taskController.createTask);
router.get("/:id", requireProjectAccess("viewer"), taskController.getTask);
router.get("/:id/artifacts", requireProjectAccess("viewer"), taskArtifactController.listTaskArtifacts);
router.patch("/:id", requireProjectAccess("editor"), taskController.patchTask);
router.post("/:id/retry", requireProjectAccess("editor"), taskController.retryTask);
router.post("/:id/cancel", requireProjectAccess("editor"), taskController.cancelTask);

export default router;

