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
