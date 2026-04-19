import { Router } from "express";
import * as controller from "../controllers/documentFavorite.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router({ mergeParams: true });

router.get(
  "/:projectId/favorites",
  requireProjectAccess("viewer"),
  controller.listFavorites,
);

router.get(
  "/:projectId/documents/:documentId/favorite",
  requireProjectAccess("viewer"),
  controller.checkFavorite,
);

router.post(
  "/:projectId/documents/:documentId/favorite",
  requireProjectAccess("viewer"),
  controller.addFavorite,
);

router.delete(
  "/:projectId/documents/:documentId/favorite",
  requireProjectAccess("viewer"),
  controller.removeFavorite,
);

export default router;
