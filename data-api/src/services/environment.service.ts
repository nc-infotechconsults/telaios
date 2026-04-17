import { AppDataSource } from "../configs/data-source.config";
import { Environment } from "../entities/Environment.entity";
import { HelmRelease } from "../entities/HelmRelease.entity";
import { encrypt, decrypt } from "../utils/crypto.util";
import type { CreateEnvironmentDto, PatchEnvironmentDto, InstallHelmChartDto } from "../schemas/environment.schema";
import { KubernetesClient } from "./kubernetes.service";
import { DockerClient } from "./docker.service";
import { HelmService } from "./helm.service";
import type { K8sResourceKind } from "./kubernetes.service";

const envRepo = () => AppDataSource.getRepository(Environment);
const releaseRepo = () => AppDataSource.getRepository(HelmRelease);

function parseConnectionConfig(env: Environment): Record<string, unknown> | null {
  const raw = decrypt(env.connection_config);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asCfg<T>(cfg: Record<string, unknown>): T {
  return cfg as unknown as T;
}

export async function listEnvironmentsByProject(projectId: string) {
  return envRepo().find({
    where: { project_id: projectId },
    order: { created_at: "DESC" },
  });
}

export async function createEnvironment(
  projectId: string,
  dto: CreateEnvironmentDto,
  createdBy?: string,
) {
  const data: Partial<Environment> = {
    project_id: projectId,
    name: dto.name,
    type: dto.type,
    namespace: dto.namespace,
    created_by: createdBy,
  };
  if (dto.connection_config) {
    data.connection_config = encrypt(JSON.stringify(dto.connection_config));
  }
  const env = envRepo().create(data);
  return envRepo().save(env);
}

export async function getEnvironment(id: string) {
  return envRepo().findOne({ where: { id }, relations: ["helm_releases"] });
}

export async function patchEnvironment(id: string, dto: PatchEnvironmentDto) {
  const data: {
    name?: string;
    type?: "kubernetes" | "docker";
    status?: "connected" | "disconnected" | "error";
    namespace?: string;
    connection_config?: string;
  } = {
    name: dto.name,
    type: dto.type,
    status: dto.status,
    namespace: dto.namespace,
  };
  if (dto.connection_config) {
    data.connection_config = encrypt(JSON.stringify(dto.connection_config));
  }
  await envRepo().update(id, data);
  return envRepo().findOneBy({ id });
}

export async function deleteEnvironment(id: string): Promise<void> {
  await envRepo().softDelete(id);
}

export async function testEnvironmentConnection(id: string): Promise<{ ok: boolean; message?: string }> {
  const env = await envRepo().findOneBy({ id });
  if (!env) return { ok: false, message: "Environment not found" };

  const cfg = parseConnectionConfig(env);
  if (!cfg) return { ok: false, message: "No connection config set" };

  try {
    if (env.type === "kubernetes") {
      await KubernetesClient.listNamespaces(asCfg(cfg));
      await envRepo().update(id, { status: "connected" });
      return { ok: true };
    }
    if (env.type === "docker") {
      const result = await DockerClient.testConnection(asCfg(cfg));
      await envRepo().update(id, { status: result.ok ? "connected" : "error" });
      return result;
    }
    return { ok: false, message: "Unknown environment type" };
  } catch (err) {
    await envRepo().update(id, { status: "error" });
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed" };
  }
}

export async function listResources(
  id: string,
  namespace: string,
  kind: string,
): Promise<unknown[]> {
  const env = await envRepo().findOneBy({ id });
  if (!env) return [];

  const cfg = parseConnectionConfig(env);
  if (!cfg) return [];

  if (env.type === "kubernetes") {
    return KubernetesClient.listResources(
      asCfg(cfg),
      namespace || env.namespace || "default",
      kind as K8sResourceKind,
    );
  }
  if (env.type === "docker") {
    return DockerClient.listContainers(asCfg(cfg));
  }
  return [];
}

export async function getResource(
  id: string,
  namespace: string,
  kind: string,
  name: string,
): Promise<unknown> {
  const env = await envRepo().findOneBy({ id });
  if (!env) return null;
  const cfg = parseConnectionConfig(env);
  if (!cfg) return null;

  if (env.type === "kubernetes") {
    return KubernetesClient.getResource(
      asCfg(cfg),
      namespace || env.namespace || "default",
      kind as K8sResourceKind,
      name,
    );
  }
  if (env.type === "docker") {
    return DockerClient.getContainer(asCfg(cfg), name);
  }
  return null;
}

export async function getResourceLogs(
  id: string,
  namespace: string,
  name: string,
  container?: string,
): Promise<string> {
  const env = await envRepo().findOneBy({ id });
  if (!env) return "";
  const cfg = parseConnectionConfig(env);
  if (!cfg) return "";

  if (env.type === "kubernetes") {
    return KubernetesClient.getPodLogs(
      asCfg(cfg),
      namespace || env.namespace || "default",
      name,
      container,
    );
  }
  if (env.type === "docker") {
    return DockerClient.getContainerLogs(asCfg(cfg), name);
  }
  return "";
}

export async function installHelmChart(
  environmentId: string,
  projectId: string,
  dto: InstallHelmChartDto,
  deployedBy?: string,
): Promise<HelmRelease> {
  const ns = dto.namespace ?? "default";
  const releaseNotes = await HelmService.install(
    dto.release_name,
    dto.chart_name,
    ns,
    dto.values_override as Record<string, unknown> | undefined,
    dto.chart_repo_url,
    dto.chart_version,
  );

  const release = releaseRepo().create({
    environment_id: environmentId,
    project_id: projectId,
    name: dto.release_name,
    chart_repo_url: dto.chart_repo_url,
    chart_name: dto.chart_name,
    chart_version: dto.chart_version,
    namespace: ns,
    values_override: dto.values_override as Record<string, unknown> | undefined,
    status: "deployed",
    release_notes: releaseNotes,
    deployed_by: deployedBy,
    deployed_at: new Date(),
  });
  return releaseRepo().save(release);
}

export async function listHelmReleases(environmentId: string): Promise<HelmRelease[]> {
  return releaseRepo().find({
    where: { environment_id: environmentId },
    order: { created_at: "DESC" },
  });
}

export async function uninstallHelmRelease(
  environmentId: string,
  releaseName: string,
): Promise<void> {
  const release = await releaseRepo().findOneBy({ environment_id: environmentId, name: releaseName });
  if (release) {
    try {
      await HelmService.uninstall(releaseName, release.namespace ?? "default");
    } catch {
      // best effort
    }
    await releaseRepo().update(release.id, { status: "uninstalled" });
  }
}

export async function scanProjectCharts(projectId: string) {
  return HelmService.scanProjectForCharts(projectId);
}
