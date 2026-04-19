import { Router } from "express";
import * as controller from "../controllers/documentTag.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

router.get(
  "/:projectId/tags",
  requireProjectAccess("viewer"),
  controller.listTags,
);

router.post(
  "/:projectId/tags",
  requireProjectAccess("editor"),
  controller.createTag,
);

router.patch(
  "/:projectId/tags/:tagId",
  requireProjectAccess("editor"),
  controller.patchTag,
);

router.delete(
  "/:projectId/tags/:tagId",
  requireProjectAccess("editor"),
  controller.deleteTag,
);

router.get(
  "/:projectId/documents/:documentId/tags",
  requireProjectAccess("viewer"),
  controller.getDocumentTags,
);

router.post(
  "/:projectId/documents/:documentId/tags/:tagId",
  requireProjectAccess("editor"),
  controller.assignTag,
);

router.delete(
  "/:projectId/documents/:documentId/tags/:tagId",
  requireProjectAccess("editor"),
  controller.unassignTag,
);

export default router;
