import { Router } from "express";
import * as controller from "../controllers/documentFolder.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

router.get(
  "/:projectId/folders",
  requireProjectAccess("viewer"),
  controller.listFolders,
);

router.get(
  "/:projectId/folders/all",
  requireProjectAccess("viewer"),
  controller.listAllFolders,
);

router.post(
  "/:projectId/folders",
  requireProjectAccess("editor"),
  controller.createFolder,
);

router.get(
  "/:projectId/folders/:id",
  requireProjectAccess("viewer"),
  controller.getFolder,
);

router.patch(
  "/:projectId/folders/:id",
  requireProjectAccess("editor"),
  controller.patchFolder,
);

router.delete(
  "/:projectId/folders/:id",
  requireProjectAccess("editor"),
  controller.deleteFolder,
);

export default router;
