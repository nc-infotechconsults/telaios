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

// ─── Container actions ─────────────────────────────────────────────────────────

export async function createContainer(req: Request, res: Response) {
  try {
    const result = await dockerService.createDockerContainer(req.params.id, req.body);
    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function execContainer(req: Request, res: Response) {
  try {
    const { cmd, working_dir, user, timeout_ms } = req.body as {
      cmd: string[];
      working_dir?: string;
      user?: string;
      timeout_ms?: number;
    };

    if (!Array.isArray(cmd) || cmd.length === 0) {
      return res.status(400).json({ error: "cmd must be a non-empty array of strings" });
    }

    const result = await dockerService.execDockerContainer(
      req.params.id,
      req.params.containerId,
      cmd,
      working_dir,
      user,
      timeout_ms,
    );
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function containerStats(req: Request, res: Response) {
  try {
    const stats = await dockerService.getDockerContainerStats(req.params.id, req.params.containerId);
    return res.json(stats);
  } catch (err) {
    return handleError(res, err);
  }
}

// ─── Image actions ─────────────────────────────────────────────────────────────

export async function pullImage(req: Request, res: Response) {
  try {
    const { image, tag, username, password } = req.body as {
      image: string;
      tag?: string;
      username?: string;
      password?: string;
    };

    if (!image) {
      return res.status(400).json({ error: "image is required" });
    }

    await dockerService.pullDockerImage(req.params.id, image, tag, username, password);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

export async function tagImage(req: Request, res: Response) {
  try {
    const { repo, tag } = req.body as { repo: string; tag: string };

    if (!repo || !tag) {
      return res.status(400).json({ error: "repo and tag are required" });
    }

    await dockerService.tagDockerImage(req.params.id, req.params.imageId, repo, tag);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

export async function pruneImages(req: Request, res: Response) {
  try {
    const result = await dockerService.pruneDockerImages(req.params.id);
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

// ─── Volume actions ────────────────────────────────────────────────────────────

export async function createVolume(req: Request, res: Response) {
  try {
    const { name, driver, driver_opts } = req.body as {
      name: string;
      driver?: string;
      driver_opts?: Record<string, string>;
    };

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const result = await dockerService.createDockerVolume(req.params.id, name, driver, driver_opts);
    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function pruneVolumes(req: Request, res: Response) {
  try {
    const result = await dockerService.pruneDockerVolumes(req.params.id);
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

// ─── Network actions ───────────────────────────────────────────────────────────

export async function createNetwork(req: Request, res: Response) {
  try {
    const { name, driver, subnet, gateway, internal } = req.body as {
      name: string;
      driver?: string;
      subnet?: string;
      gateway?: string;
      internal?: boolean;
    };

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const result = await dockerService.createDockerNetwork(
      req.params.id,
      name,
      driver,
      subnet,
      gateway,
      internal,
    );
    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

export async function removeNetwork(req: Request, res: Response) {
  try {
    await dockerService.removeDockerNetwork(req.params.id, req.params.networkId);
    return res.status(204).send();
  } catch (err) {
    return handleError(res, err);
  }
}

export async function pruneNetworks(req: Request, res: Response) {
  try {
    const result = await dockerService.pruneDockerNetworks(req.params.id);
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}
