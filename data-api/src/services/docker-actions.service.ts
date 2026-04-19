/**
 * Docker actions service.
 *
 * Loads the environment by ID, validates it is type "docker",
 * decrypts the connection_config, and delegates to DockerClient.
 *
 * Throws typed errors that the controller layer maps to HTTP status codes.
 */
import { AppDataSource } from "../configs/data-source.config";
import { Environment } from "../entities/Environment.entity";
import { decrypt } from "../utils/crypto.util";
import { DockerClient } from "./docker.service";
import type { DockerConnectionConfig, DockerContainerSummary, DockerImageSummary, DockerVolumeSummary, DockerNetworkSummary, DockerVolumeFileEntry } from "./docker.service";

const envRepo = () => AppDataSource.getRepository(Environment);

export class NotFoundError extends Error {}
export class InvalidEnvironmentTypeError extends Error {}

function loadAndDecryptConfig(env: Environment): DockerConnectionConfig {
  const raw = decrypt(env.connection_config);
  if (!raw) throw new Error("No connection config set for environment");
  return JSON.parse(raw) as DockerConnectionConfig;
}

async function resolveDockerEnv(envId: string): Promise<{ env: Environment; cfg: DockerConnectionConfig }> {
  const env = await envRepo().findOneBy({ id: envId });
  if (!env) throw new NotFoundError(`Environment ${envId} not found`);
  if (env.type !== "docker") throw new InvalidEnvironmentTypeError(`Environment ${envId} is not a Docker environment`);
  const cfg = loadAndDecryptConfig(env);
  return { env, cfg };
}

// ─── Containers ───────────────────────────────────────────────────────────────

export async function listDockerContainers(envId: string): Promise<DockerContainerSummary[]> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.listContainers(cfg);
}

export async function getDockerContainer(envId: string, containerId: string): Promise<unknown> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.getContainer(cfg, containerId);
}

export async function getDockerContainerLogs(envId: string, containerId: string, tail = 200): Promise<string> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.getContainerLogs(cfg, containerId, tail);
}

export async function startDockerContainer(envId: string, containerId: string): Promise<void> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.startContainer(cfg, containerId);
}

export async function stopDockerContainer(envId: string, containerId: string): Promise<void> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.stopContainer(cfg, containerId);
}

export async function restartDockerContainer(envId: string, containerId: string): Promise<void> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.restartContainer(cfg, containerId);
}

export async function removeDockerContainer(envId: string, containerId: string, force = true): Promise<void> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.removeContainer(cfg, containerId, force);
}

// ─── Images ───────────────────────────────────────────────────────────────────

export async function listDockerImages(envId: string): Promise<DockerImageSummary[]> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.listImages(cfg);
}

export async function removeDockerImage(envId: string, imageId: string, force = false): Promise<void> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.removeImage(cfg, imageId, force);
}

// ─── Volumes ──────────────────────────────────────────────────────────────────

export async function listDockerVolumes(envId: string): Promise<DockerVolumeSummary[]> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.listVolumes(cfg);
}

export async function removeDockerVolume(envId: string, volumeName: string): Promise<void> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.removeVolume(cfg, volumeName);
}

// ─── Networks ─────────────────────────────────────────────────────────────────

export async function listDockerNetworks(envId: string): Promise<DockerNetworkSummary[]> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.listNetworks(cfg);
}

// ─── Inspect ──────────────────────────────────────────────────────────────────

export async function inspectDockerImage(envId: string, imageId: string): Promise<unknown> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.inspectImage(cfg, imageId);
}

export async function inspectDockerNetwork(envId: string, networkId: string): Promise<unknown> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.inspectNetwork(cfg, networkId);
}

export async function inspectDockerVolume(envId: string, volumeName: string): Promise<unknown> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.inspectVolume(cfg, volumeName);
}

// ─── Volume file browser ──────────────────────────────────────────────────────

export async function listDockerVolumeFiles(
  envId: string,
  volumeName: string,
  dirPath: string,
): Promise<DockerVolumeFileEntry[]> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.listVolumeFiles(cfg, volumeName, dirPath);
}

export async function downloadDockerVolumeFile(
  envId: string,
  volumeName: string,
  filePath: string,
): Promise<{ stream: NodeJS.ReadableStream; cleanup: () => Promise<void> }> {
  const { cfg } = await resolveDockerEnv(envId);
  return DockerClient.downloadVolumeFile(cfg, volumeName, filePath);
}
