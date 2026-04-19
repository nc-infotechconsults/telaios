/**
 * Docker controller.
 *
 * Handles HTTP requests for Docker engine management endpoints.
 * Delegates business logic to docker-actions.service.
 */
import type { Request, Response } from "express";
import * as dockerService from "../services/docker-actions.service";
import { NotFoundError, InvalidEnvironmentTypeError } from "../services/docker-actions.service";
import logger from "../utils/logger";

function handleError(res: Response, err: unknown): Response {
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  if (err instanceof InvalidEnvironmentTypeError) {
    return res.status(400).json({ error: err.message });
  }
  logger.error({ err }, "Docker controller error");
  const message = err instanceof Error ? err.message : "Internal server error";
  return res.status(500).json({ error: message });
}

// ─── Containers ───────────────────────────────────────────────────────────────

export async function listContainers(req: Request, res: Response) {
  try {
    const containers = await dockerService.listDockerContainers(req.params.id);
    return res.json(containers);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getContainer(req: Request, res: Response) {
  try {
    const container = await dockerService.getDockerContainer(req.params.id, req.params.containerId);
    if (!container) return res.status(404).json({ error: "Container not found" });
    return res.json(container);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function getContainerLogs(req: Request, res: Response) {
  try {
    const { tail } = req.query as Record<string, string>;
    const logs = await dockerService.getDockerContainerLogs(
      req.params.id,
      req.params.containerId,
      tail ? parseInt(tail, 10) : 200,
    );
    res.setHeader("Content-Type", "text/plain");
    return res.send(logs);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function startContainer(req: Request, res: Response) {
  try {
    await dockerService.startDockerContainer(req.params.id, req.params.containerId);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

export async function stopContainer(req: Request, res: Response) {
  try {
    await dockerService.stopDockerContainer(req.params.id, req.params.containerId);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

export async function restartContainer(req: Request, res: Response) {
  try {
    await dockerService.restartDockerContainer(req.params.id, req.params.containerId);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

export async function removeContainer(req: Request, res: Response) {
  try {
    await dockerService.removeDockerContainer(req.params.id, req.params.containerId);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

// ─── Images ───────────────────────────────────────────────────────────────────

export async function listImages(req: Request, res: Response) {
  try {
    const images = await dockerService.listDockerImages(req.params.id);
    return res.json(images);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function removeImage(req: Request, res: Response) {
  try {
    await dockerService.removeDockerImage(req.params.id, req.params.imageId);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

// ─── Volumes ──────────────────────────────────────────────────────────────────

export async function listVolumes(req: Request, res: Response) {
  try {
    const volumes = await dockerService.listDockerVolumes(req.params.id);
    return res.json(volumes);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function removeVolume(req: Request, res: Response) {
  try {
    await dockerService.removeDockerVolume(req.params.id, req.params.volumeName);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

// ─── Networks ─────────────────────────────────────────────────────────────────

export async function listNetworks(req: Request, res: Response) {
  try {
    const networks = await dockerService.listDockerNetworks(req.params.id);
    return res.json(networks);
  } catch (err) {
    return handleError(res, err);
  }
}

// ─── Inspect ──────────────────────────────────────────────────────────────────

export async function inspectImage(req: Request, res: Response) {
  try {
    const data = await dockerService.inspectDockerImage(req.params.id, req.params.imageId);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function inspectNetwork(req: Request, res: Response) {
  try {
    const data = await dockerService.inspectDockerNetwork(req.params.id, req.params.networkId);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function inspectVolume(req: Request, res: Response) {
  try {
    const data = await dockerService.inspectDockerVolume(req.params.id, req.params.volumeName);
    return res.json(data);
  } catch (err) {
    return handleError(res, err);
  }
}

// ─── Volume file browser ──────────────────────────────────────────────────────

export async function listVolumeFiles(req: Request, res: Response) {
  try {
    const { path: dirPath = "/" } = req.query as Record<string, string>;

    if (dirPath.includes("..")) {
      return res.status(400).json({ error: "Invalid path: path traversal not allowed" });
    }

    const files = await dockerService.listDockerVolumeFiles(req.params.id, req.params.volumeName, dirPath);
    return res.json(files);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function downloadVolumeFile(req: Request, res: Response) {
  try {
    const { path: filePath } = req.query as Record<string, string>;

    if (!filePath) {
      return res.status(400).json({ error: "path query parameter is required" });
    }
    if (!filePath.startsWith("/") || filePath.includes("..")) {
      return res.status(400).json({ error: "Invalid path: must be absolute and contain no path traversal" });
    }

    const { stream, cleanup } = await dockerService.downloadDockerVolumeFile(
      req.params.id,
      req.params.volumeName,
      filePath,
    );

    const fileName = filePath.split("/").filter(Boolean).pop() ?? "archive";
    res.setHeader("Content-Type", "application/x-tar");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}.tar"`);

    stream.pipe(res);
    stream.on("end", () => { cleanup().catch(() => { /* ignore */ }); });
    stream.on("error", (err) => {
      cleanup().catch(() => { /* ignore */ });
      logger.error({ err }, "Volume file download stream error");
    });
  } catch (err) {
    return handleError(res, err);
  }
}
