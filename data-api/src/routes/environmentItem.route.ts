import { Router } from "express";
import * as environmentController from "../controllers/environment.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router();

router.get("/:id", requireProjectAccess("viewer"), environmentController.getEnvironment);
router.patch("/:id", requireProjectAccess("editor"), environmentController.patchEnvironment);
router.delete("/:id", requireProjectAccess("owner"), environmentController.deleteEnvironment);
router.post("/:id/test", requireProjectAccess("editor"), environmentController.testEnvironmentConnection);

// Resource browser
router.get("/:id/resources", requireProjectAccess("viewer"), environmentController.listResources);
router.get("/:id/resources/:kind/:name", requireProjectAccess("viewer"), environmentController.getResource);
router.get("/:id/resources/:kind/:name/logs", requireProjectAccess("viewer"), environmentController.getResourceLogs);

// Helm
router.post("/:id/helm/install", requireProjectAccess("editor"), environmentController.installHelmChart);
router.get("/:id/helm/releases", requireProjectAccess("viewer"), environmentController.listHelmReleases);
router.delete("/:id/helm/releases/:releaseName", requireProjectAccess("editor"), environmentController.uninstallHelmRelease);
router.get("/:id/helm/charts/scan", requireProjectAccess("viewer"), environmentController.scanProjectCharts);

export default router;
