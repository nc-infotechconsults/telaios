import { Router } from "express";
import * as environmentController from "../controllers/environment.controller";
import * as dockerController from "../controllers/docker.controller";
import { requireProjectAccess } from "../middleware/requireProjectAccess.middleware";

const router = Router();

router.get("/:id", requireProjectAccess("viewer"), environmentController.getEnvironment);
router.patch("/:id", requireProjectAccess("editor"), environmentController.patchEnvironment);
router.delete("/:id", requireProjectAccess("owner"), environmentController.deleteEnvironment);
router.post("/:id/test", requireProjectAccess("editor"), environmentController.testEnvironmentConnection);

// Resource browser (Kubernetes)
router.get("/:id/resources", requireProjectAccess("viewer"), environmentController.listResources);
router.get("/:id/resources/:kind/:name", requireProjectAccess("viewer"), environmentController.getResource);
router.get("/:id/resources/:kind/:name/logs", requireProjectAccess("viewer"), environmentController.getResourceLogs);

// Helm
router.post("/:id/helm/install", requireProjectAccess("editor"), environmentController.installHelmChart);
router.get("/:id/helm/releases", requireProjectAccess("viewer"), environmentController.listHelmReleases);
router.delete("/:id/helm/releases/:releaseName", requireProjectAccess("editor"), environmentController.uninstallHelmRelease);
router.get("/:id/helm/charts/scan", requireProjectAccess("viewer"), environmentController.scanProjectCharts);

// Docker engine management
router.get("/:id/docker/containers", requireProjectAccess("viewer"), dockerController.listContainers);
router.post("/:id/docker/containers", requireProjectAccess("editor"), dockerController.createContainer);
router.get("/:id/docker/containers/:containerId", requireProjectAccess("viewer"), dockerController.getContainer);
router.get("/:id/docker/containers/:containerId/logs", requireProjectAccess("viewer"), dockerController.getContainerLogs);
router.get("/:id/docker/containers/:containerId/stats", requireProjectAccess("viewer"), dockerController.containerStats);
router.post("/:id/docker/containers/:containerId/start", requireProjectAccess("editor"), dockerController.startContainer);
router.post("/:id/docker/containers/:containerId/stop", requireProjectAccess("editor"), dockerController.stopContainer);
router.post("/:id/docker/containers/:containerId/restart", requireProjectAccess("editor"), dockerController.restartContainer);
router.post("/:id/docker/containers/:containerId/exec", requireProjectAccess("editor"), dockerController.execContainer);
router.delete("/:id/docker/containers/:containerId", requireProjectAccess("editor"), dockerController.removeContainer);
router.get("/:id/docker/images", requireProjectAccess("viewer"), dockerController.listImages);
router.get("/:id/docker/images/:imageId/inspect", requireProjectAccess("viewer"), dockerController.inspectImage);
router.post("/:id/docker/images/pull", requireProjectAccess("editor"), dockerController.pullImage);
router.post("/:id/docker/images/prune", requireProjectAccess("editor"), dockerController.pruneImages);
router.post("/:id/docker/images/:imageId/tag", requireProjectAccess("editor"), dockerController.tagImage);
router.delete("/:id/docker/images/:imageId", requireProjectAccess("editor"), dockerController.removeImage);
router.get("/:id/docker/volumes", requireProjectAccess("viewer"), dockerController.listVolumes);
router.get("/:id/docker/volumes/:volumeName/inspect", requireProjectAccess("viewer"), dockerController.inspectVolume);
router.get("/:id/docker/volumes/:volumeName/files", requireProjectAccess("viewer"), dockerController.listVolumeFiles);
router.get("/:id/docker/volumes/:volumeName/files/download", requireProjectAccess("viewer"), dockerController.downloadVolumeFile);
router.get("/:id/docker/volumes/:volumeName/files/content", requireProjectAccess("viewer"), dockerController.getVolumeFileContent);
router.put("/:id/docker/volumes/:volumeName/files/content", requireProjectAccess("editor"), dockerController.updateVolumeFileContent);
router.post("/:id/docker/volumes", requireProjectAccess("editor"), dockerController.createVolume);
router.post("/:id/docker/volumes/prune", requireProjectAccess("editor"), dockerController.pruneVolumes);
router.delete("/:id/docker/volumes/:volumeName", requireProjectAccess("editor"), dockerController.removeVolume);
router.get("/:id/docker/networks", requireProjectAccess("viewer"), dockerController.listNetworks);
router.get("/:id/docker/networks/:networkId/inspect", requireProjectAccess("viewer"), dockerController.inspectNetwork);
router.post("/:id/docker/networks", requireProjectAccess("editor"), dockerController.createNetwork);
router.post("/:id/docker/networks/prune", requireProjectAccess("editor"), dockerController.pruneNetworks);
router.delete("/:id/docker/networks/:networkId", requireProjectAccess("editor"), dockerController.removeNetwork);

export default router;
