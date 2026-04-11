import { Router } from "express";
import * as repositoryController from "../controllers/repository.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

router.get("/:projectId/repositories", requireProjectAccess("viewer"), repositoryController.listRepositories);
router.post("/:projectId/repositories", requireProjectAccess("editor"), repositoryController.createRepository);
router.get("/:projectId/repositories/:id", requireProjectAccess("viewer"), repositoryController.getRepository);
router.patch("/:projectId/repositories/:id", requireProjectAccess("editor"), repositoryController.patchRepository);
router.delete("/:projectId/repositories/:id", requireProjectAccess("owner"), repositoryController.deleteRepository);

export default router;
