import { Router } from "express";
import * as controller from "../controllers/documentTemplate.controller";

const router = Router({ mergeParams: true });

router.get(
  "/templates",
  controller.listGlobalTemplates,
);

router.get(
  "/templates/:templateId",
  controller.getTemplate,
);

router.patch(
  "/templates/:templateId",
  controller.patchTemplate,
);

router.delete(
  "/templates/:templateId",
  controller.deleteTemplate,
);

export default router;
