import { Router } from "express";
import * as environmentController from "../controllers/environment.controller";

const router = Router();

router.get("/:id", environmentController.getEnvironment);
router.patch("/:id", environmentController.patchEnvironment);
router.delete("/:id", environmentController.deleteEnvironment);
router.post("/:id/test", environmentController.testEnvironmentConnection);

// Resource browser
router.get("/:id/resources", environmentController.listResources);
router.get("/:id/resources/:kind/:name", environmentController.getResource);
router.get("/:id/resources/:kind/:name/logs", environmentController.getResourceLogs);

// Helm
router.post("/:id/helm/install", environmentController.installHelmChart);
router.get("/:id/helm/releases", environmentController.listHelmReleases);
router.delete("/:id/helm/releases/:releaseName", environmentController.uninstallHelmRelease);
router.get("/:id/helm/charts/scan", environmentController.scanProjectCharts);

export default router;
