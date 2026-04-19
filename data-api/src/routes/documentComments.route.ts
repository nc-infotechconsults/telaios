import { Router } from "express";
import * as controller from "../controllers/documentComment.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

router.get(
  "/:projectId/documents/:documentId/comments",
  requireProjectAccess("viewer"),
  controller.listComments,
);

router.post(
  "/:projectId/documents/:documentId/comments",
  requireProjectAccess("editor"),
  controller.createComment,
);

router.patch(
  "/:projectId/documents/:documentId/comments/:commentId",
  requireProjectAccess("editor"),
  controller.patchComment,
);

router.delete(
  "/:projectId/documents/:documentId/comments/:commentId",
  requireProjectAccess("editor"),
  controller.deleteComment,
);

export default router;
