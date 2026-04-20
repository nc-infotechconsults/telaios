import { AppDataSource } from "../configs/data-source.config";
import { Environment } from "../entities/Environment.entity";
import { HelmRelease } from "../entities/HelmRelease.entity";
import { encrypt, decrypt } from "../utils/crypto.util";
import type { CreateEnvironmentDto, PatchEnvironmentDto, InstallHelmChartDto, UpgradeHelmChartDto } from "../schemas/environment.schema";
import { KubernetesClient } from "./kubernetes.service";
import { DockerClient } from "./docker.service";
import { HelmService } from "./helm.service";
import type { K8sResourceKind, K8sPVCFileEntry, K8sConnectionConfig } from "./kubernetes.service";

export class PVCConflictError extends Error {
  constructor(public readonly conflicting_pod: string) {
    super(`PVC is mounted by running pod: ${conflicting_pod}`);
    this.name = "PVCConflictError";
  }
}

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

  let releaseNotes: string | undefined;
  let helmStatus: "deployed" | "failed" = "deployed";

  try {
    releaseNotes = await HelmService.install(
      dto.release_name,
      dto.chart_name,
      ns,
      dto.values_override as Record<string, unknown> | undefined,
      dto.chart_repo_url,
      dto.chart_version,
    );
  } catch (err) {
    helmStatus = "failed";
    releaseNotes = err instanceof Error ? err.message : String(err);
  }

  const release = releaseRepo().create({
    environment_id: environmentId,
    project_id: projectId,
    name: dto.release_name,
    chart_repo_url: dto.chart_repo_url,
    chart_name: dto.chart_name,
    chart_version: dto.chart_version,
    namespace: ns,
    values_override: dto.values_override as Record<string, unknown> | undefined,
    status: helmStatus,
    release_notes: releaseNotes,
    deployed_by: deployedBy,
    deployed_at: new Date(),
  });
  const saved = await releaseRepo().save(release);

  if (helmStatus === "failed") {
    throw new Error(releaseNotes);
  }

  return saved;
}

export async function listHelmReleases(environmentId: string): Promise<HelmRelease[]> {
  return releaseRepo().find({
    where: { environment_id: environmentId },
    order: { created_at: "DESC" },
  });
}

export async function upgradeHelmRelease(
  environmentId: string,
  releaseName: string,
  dto: UpgradeHelmChartDto,
  deployedBy?: string,
): Promise<HelmRelease | null> {
  const release = await releaseRepo().findOneBy({ environment_id: environmentId, name: releaseName });
  if (!release) return null;

  const ns = dto.namespace ?? release.namespace ?? "default";
  const chart = dto.chart_name ?? release.chart_name;
  const repoUrl = dto.chart_repo_url ?? release.chart_repo_url;
  const chartVersion = dto.chart_version ?? release.chart_version;
  const valuesOverride = (dto.values_override as Record<string, unknown> | undefined) ?? release.values_override;

  let releaseNotes: string | undefined;
  let helmStatus: "deployed" | "failed" = "deployed";

  try {
    releaseNotes = await HelmService.upgrade(
      releaseName,
      chart,
      ns,
      valuesOverride,
      repoUrl,
      chartVersion,
    );
  } catch (err) {
    helmStatus = "failed";
    releaseNotes = err instanceof Error ? err.message : String(err);
  }

  const updateFields: Record<string, unknown> = {
    chart_repo_url: repoUrl,
    chart_name: chart,
    chart_version: chartVersion,
    namespace: ns,
    status: helmStatus,
    release_notes: releaseNotes,
    deployed_by: deployedBy,
    deployed_at: new Date(),
  };
  if (valuesOverride !== undefined) {
    updateFields.values_override = valuesOverride;
  }
  // Cast needed: TypeORM's _QueryDeepPartialEntity<T> doesn't accept
  // Record<string, unknown> for jsonb columns due to a TypeORM typing quirk.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await releaseRepo().update(release.id, updateFields as any);

  const updated = await releaseRepo().findOneBy({ id: release.id });

  if (helmStatus === "failed") {
    throw new Error(releaseNotes);
  }

  return updated;
}

export async function uninstallHelmRelease(
  environmentId: string,
  releaseName: string,
): Promise<void> {
  const release = await releaseRepo().findOneBy({ environment_id: environmentId, name: releaseName });
  if (release) {
    await HelmService.uninstall(releaseName, release.namespace ?? "default");
    await releaseRepo().update(release.id, { status: "uninstalled" });
  }
}

export async function scanProjectCharts(projectId: string) {
  return HelmService.scanProjectForCharts(projectId);
}

// ─── PVC File Browser ─────────────────────────────────────────────────────────

async function resolveK8sEnv(id: string) {
  const env = await envRepo().findOneBy({ id });
  if (!env) throw new Error("Environment not found");
  const cfg = parseConnectionConfig(env);
  if (!cfg) throw new Error("No connection config set");
  if (env.type !== "kubernetes") throw new Error("Not a Kubernetes environment");
  return { env, cfg };
}

async function assertNoPVCConflict(
  cfg: K8sConnectionConfig,
  namespace: string,
  pvcName: string,
) {
  const accessModes = await KubernetesClient.getPVCAccessModes(cfg, namespace, pvcName);
  if (accessModes.includes("ReadWriteOnce")) {
    const conflicting = await KubernetesClient.getPodsUsingPVC(cfg, namespace, pvcName);
    if (conflicting.length > 0) throw new PVCConflictError(conflicting[0]);
  }
}

export async function listPVCFiles(
  id: string,
  namespace: string,
  pvcName: string,
  dirPath: string,
): Promise<K8sPVCFileEntry[]> {
  const { cfg } = await resolveK8sEnv(id);
  const k8sCfg = asCfg<K8sConnectionConfig>(cfg);
  await assertNoPVCConflict(k8sCfg, namespace, pvcName);
  return KubernetesClient.listPVCFiles(k8sCfg, namespace, pvcName, dirPath);
}

export async function getPVCFileContent(
  id: string,
  namespace: string,
  pvcName: string,
  filePath: string,
): Promise<{ content: string; encoding: "text" | "binary"; size: number }> {
  const { cfg } = await resolveK8sEnv(id);
  const k8sCfg = asCfg<K8sConnectionConfig>(cfg);
  await assertNoPVCConflict(k8sCfg, namespace, pvcName);
  return KubernetesClient.getPVCFileContent(k8sCfg, namespace, pvcName, filePath);
}

export async function updatePVCFileContent(
  id: string,
  namespace: string,
  pvcName: string,
  filePath: string,
  content: string,
): Promise<void> {
  const { cfg } = await resolveK8sEnv(id);
  const k8sCfg = asCfg<K8sConnectionConfig>(cfg);
  await assertNoPVCConflict(k8sCfg, namespace, pvcName);
  return KubernetesClient.updatePVCFileContent(k8sCfg, namespace, pvcName, filePath, content);
}

export async function downloadPVCFile(
  id: string,
  namespace: string,
  pvcName: string,
  filePath: string,
) {
  const { cfg } = await resolveK8sEnv(id);
  const k8sCfg = asCfg<K8sConnectionConfig>(cfg);
  await assertNoPVCConflict(k8sCfg, namespace, pvcName);
  return KubernetesClient.downloadPVCFile(k8sCfg, namespace, pvcName, filePath);
}
