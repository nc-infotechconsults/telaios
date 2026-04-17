import {
  listEnvironmentsByProject,
  createEnvironment,
  getEnvironment,
  patchEnvironment,
  deleteEnvironment,
  testEnvironmentConnection,
  listResources,
  installHelmChart,
  listHelmReleases,
  uninstallHelmRelease,
} from "../../../services/environment.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { Environment } from "../../../entities/Environment.entity";
import { HelmRelease } from "../../../entities/HelmRelease.entity";
import { KubernetesClient } from "../../../services/kubernetes.service";
import { DockerClient } from "../../../services/docker.service";
import { HelmService } from "../../../services/helm.service";
import * as crypto from "../../../utils/crypto.util";

jest.mock("../../../configs/data-source.config", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

jest.mock("../../../services/kubernetes.service", () => ({
  KubernetesClient: {
    listNamespaces: jest.fn(),
    listResources: jest.fn(),
    getResource: jest.fn(),
    getPodLogs: jest.fn(),
  },
}));

jest.mock("../../../services/docker.service", () => ({
  DockerClient: {
    testConnection: jest.fn(),
    listContainers: jest.fn(),
    getContainer: jest.fn(),
    getContainerLogs: jest.fn(),
  },
}));

jest.mock("../../../services/helm.service", () => ({
  HelmService: {
    install: jest.fn(),
    uninstall: jest.fn(),
    scanProjectForCharts: jest.fn(),
  },
}));

jest.mock("../../../utils/crypto.util", () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string) => {
    if (!v || !v.startsWith("enc:")) return v ?? "";
    return v.slice(4);
  }),
}));

const mockEnvRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
};

const mockReleaseRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (AppDataSource.getRepository as jest.Mock).mockImplementation((entity) => {
    if (entity === Environment) return mockEnvRepo;
    if (entity === HelmRelease) return mockReleaseRepo;
    return mockEnvRepo;
  });
});

// ---------------------------------------------------------------------------
// listEnvironmentsByProject
// ---------------------------------------------------------------------------

describe("listEnvironmentsByProject", () => {
  it("queries by project_id ordered by created_at DESC", async () => {
    const envs = [{ id: "e-1" }, { id: "e-2" }] as Environment[];
    mockEnvRepo.find.mockResolvedValue(envs);

    const result = await listEnvironmentsByProject("proj-1");

    expect(result).toBe(envs);
    expect(mockEnvRepo.find).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      order: { created_at: "DESC" },
    });
  });
});

// ---------------------------------------------------------------------------
// createEnvironment
// ---------------------------------------------------------------------------

describe("createEnvironment", () => {
  it("encrypts connection_config when provided", async () => {
    const env = { id: "e-1" } as Environment;
    mockEnvRepo.create.mockReturnValue(env);
    mockEnvRepo.save.mockResolvedValue(env);

    await createEnvironment(
      "proj-1",
      { name: "staging", type: "kubernetes", connection_config: { type: "kubernetes", kubeconfig: "yaml" } },
      "user-1",
    );

    expect(crypto.encrypt).toHaveBeenCalledWith(
      expect.stringContaining("kubeconfig"),
    );
    expect(mockEnvRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj-1",
        name: "staging",
        type: "kubernetes",
        created_by: "user-1",
      }),
    );
  });

  it("does not set connection_config when dto omits it", async () => {
    const env = { id: "e-2" } as Environment;
    mockEnvRepo.create.mockReturnValue(env);
    mockEnvRepo.save.mockResolvedValue(env);

    await createEnvironment("proj-1", { name: "env", type: "docker" });

    const createArg = mockEnvRepo.create.mock.calls[0][0] as Record<string, unknown>;
    expect(createArg.connection_config).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getEnvironment
// ---------------------------------------------------------------------------

describe("getEnvironment", () => {
  it("loads environment with helm_releases relation", async () => {
    const env = { id: "e-1", helm_releases: [] } as unknown as Environment;
    mockEnvRepo.findOne.mockResolvedValue(env);

    const result = await getEnvironment("e-1");

    expect(result).toBe(env);
    expect(mockEnvRepo.findOne).toHaveBeenCalledWith({
      where: { id: "e-1" },
      relations: ["helm_releases"],
    });
  });

  it("returns null when not found", async () => {
    mockEnvRepo.findOne.mockResolvedValue(null);
    expect(await getEnvironment("x")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// patchEnvironment
// ---------------------------------------------------------------------------

describe("patchEnvironment", () => {
  it("updates and returns the environment", async () => {
    const env = { id: "e-1", name: "updated" } as Environment;
    mockEnvRepo.update.mockResolvedValue({ affected: 1 });
    mockEnvRepo.findOneBy.mockResolvedValue(env);

    const result = await patchEnvironment("e-1", { name: "updated" });

    expect(mockEnvRepo.update).toHaveBeenCalledWith("e-1", expect.objectContaining({ name: "updated" }));
    expect(result).toBe(env);
  });

  it("encrypts connection_config when patching", async () => {
    const env = { id: "e-1" } as Environment;
    mockEnvRepo.update.mockResolvedValue({ affected: 1 });
    mockEnvRepo.findOneBy.mockResolvedValue(env);

    await patchEnvironment("e-1", {
      connection_config: { type: "docker", host: "tcp://host:2376" },
    });

    expect(crypto.encrypt).toHaveBeenCalledWith(expect.stringContaining("docker"));
  });
});

// ---------------------------------------------------------------------------
// deleteEnvironment
// ---------------------------------------------------------------------------

describe("deleteEnvironment", () => {
  it("calls softDelete", async () => {
    mockEnvRepo.softDelete.mockResolvedValue({ affected: 1 });
    await deleteEnvironment("e-1");
    expect(mockEnvRepo.softDelete).toHaveBeenCalledWith("e-1");
  });
});

// ---------------------------------------------------------------------------
// testEnvironmentConnection
// ---------------------------------------------------------------------------

describe("testEnvironmentConnection", () => {
  it("returns not found error when environment missing", async () => {
    mockEnvRepo.findOneBy.mockResolvedValue(null);
    const result = await testEnvironmentConnection("missing");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not found/i);
  });

  it("returns error when no connection config set", async () => {
    mockEnvRepo.findOneBy.mockResolvedValue({
      id: "e-1",
      type: "kubernetes",
      connection_config: "",
    });
    const result = await testEnvironmentConnection("e-1");
    expect(result.ok).toBe(false);
  });

  it("calls KubernetesClient.listNamespaces for kubernetes env and marks connected", async () => {
    const cfgStr = JSON.stringify({ type: "kubernetes", kubeconfig: "yaml" });
    mockEnvRepo.findOneBy.mockResolvedValue({
      id: "e-1",
      type: "kubernetes",
      connection_config: `enc:${cfgStr}`,
    });
    (KubernetesClient.listNamespaces as jest.Mock).mockResolvedValue(["default"]);
    mockEnvRepo.update.mockResolvedValue({ affected: 1 });

    const result = await testEnvironmentConnection("e-1");

    expect(KubernetesClient.listNamespaces).toHaveBeenCalled();
    expect(mockEnvRepo.update).toHaveBeenCalledWith("e-1", { status: "connected" });
    expect(result.ok).toBe(true);
  });

  it("calls DockerClient.testConnection for docker env", async () => {
    const cfgStr = JSON.stringify({ type: "docker", host: "tcp://host" });
    mockEnvRepo.findOneBy.mockResolvedValue({
      id: "e-2",
      type: "docker",
      connection_config: `enc:${cfgStr}`,
    });
    (DockerClient.testConnection as jest.Mock).mockResolvedValue({ ok: true, version: "24.0.0" });
    mockEnvRepo.update.mockResolvedValue({ affected: 1 });

    const result = await testEnvironmentConnection("e-2");

    expect(DockerClient.testConnection).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it("marks environment as error and returns message when connection throws", async () => {
    const cfgStr = JSON.stringify({ type: "kubernetes", kubeconfig: "yaml" });
    mockEnvRepo.findOneBy.mockResolvedValue({
      id: "e-3",
      type: "kubernetes",
      connection_config: `enc:${cfgStr}`,
    });
    (KubernetesClient.listNamespaces as jest.Mock).mockRejectedValue(new Error("connection refused"));
    mockEnvRepo.update.mockResolvedValue({ affected: 1 });

    const result = await testEnvironmentConnection("e-3");

    expect(mockEnvRepo.update).toHaveBeenCalledWith("e-3", { status: "error" });
    expect(result.ok).toBe(false);
    expect(result.message).toBe("connection refused");
  });
});

// ---------------------------------------------------------------------------
// listResources
// ---------------------------------------------------------------------------

describe("listResources", () => {
  it("returns empty array when environment not found", async () => {
    mockEnvRepo.findOneBy.mockResolvedValue(null);
    const result = await listResources("missing", "default", "pods");
    expect(result).toEqual([]);
  });

  it("delegates to KubernetesClient for kubernetes environments", async () => {
    const cfgStr = JSON.stringify({ type: "kubernetes" });
    mockEnvRepo.findOneBy.mockResolvedValue({
      id: "e-1",
      type: "kubernetes",
      namespace: "default",
      connection_config: `enc:${cfgStr}`,
    });
    (KubernetesClient.listResources as jest.Mock).mockResolvedValue([{ name: "pod-1" }]);

    const result = await listResources("e-1", "default", "pods");
    expect(KubernetesClient.listResources).toHaveBeenCalled();
    expect(result).toEqual([{ name: "pod-1" }]);
  });

  it("delegates to DockerClient for docker environments", async () => {
    const cfgStr = JSON.stringify({ type: "docker" });
    mockEnvRepo.findOneBy.mockResolvedValue({
      id: "e-2",
      type: "docker",
      connection_config: `enc:${cfgStr}`,
    });
    (DockerClient.listContainers as jest.Mock).mockResolvedValue([{ id: "c-1" }]);

    const result = await listResources("e-2", "", "containers");
    expect(DockerClient.listContainers).toHaveBeenCalled();
    expect(result).toEqual([{ id: "c-1" }]);
  });
});

// ---------------------------------------------------------------------------
// installHelmChart
// ---------------------------------------------------------------------------

describe("installHelmChart", () => {
  it("calls HelmService.install and saves a HelmRelease record", async () => {
    (HelmService.install as jest.Mock).mockResolvedValue('{"status":"deployed"}');
    const releaseEntity = { id: "hr-1" } as HelmRelease;
    mockReleaseRepo.create.mockReturnValue(releaseEntity);
    mockReleaseRepo.save.mockResolvedValue(releaseEntity);

    const result = await installHelmChart(
      "env-1",
      "proj-1",
      { release_name: "my-release", chart_name: "nginx", namespace: "production" },
      "user-1",
    );

    expect(HelmService.install).toHaveBeenCalledWith(
      "my-release",
      "nginx",
      "production",
      undefined,
      undefined,
      undefined,
    );
    expect(mockReleaseRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        environment_id: "env-1",
        project_id: "proj-1",
        name: "my-release",
        chart_name: "nginx",
        status: "deployed",
        deployed_by: "user-1",
      }),
    );
    expect(result).toBe(releaseEntity);
  });
});

// ---------------------------------------------------------------------------
// listHelmReleases
// ---------------------------------------------------------------------------

describe("listHelmReleases", () => {
  it("finds releases for the given environment ordered by created_at DESC", async () => {
    const releases = [{ id: "hr-1" }, { id: "hr-2" }] as HelmRelease[];
    mockReleaseRepo.find.mockResolvedValue(releases);

    const result = await listHelmReleases("env-1");

    expect(result).toBe(releases);
    expect(mockReleaseRepo.find).toHaveBeenCalledWith({
      where: { environment_id: "env-1" },
      order: { created_at: "DESC" },
    });
  });
});

// ---------------------------------------------------------------------------
// uninstallHelmRelease
// ---------------------------------------------------------------------------

describe("uninstallHelmRelease", () => {
  it("calls HelmService.uninstall and marks release as uninstalled", async () => {
    const release = { id: "hr-1", name: "my-release", namespace: "production" } as HelmRelease;
    mockReleaseRepo.findOneBy.mockResolvedValue(release);
    (HelmService.uninstall as jest.Mock).mockResolvedValue("uninstalled");
    mockReleaseRepo.update.mockResolvedValue({ affected: 1 });

    await uninstallHelmRelease("env-1", "my-release");

    expect(HelmService.uninstall).toHaveBeenCalledWith("my-release", "production");
    expect(mockReleaseRepo.update).toHaveBeenCalledWith("hr-1", { status: "uninstalled" });
  });

  it("does nothing when release record not found", async () => {
    mockReleaseRepo.findOneBy.mockResolvedValue(null);

    await uninstallHelmRelease("env-1", "nonexistent");

    expect(HelmService.uninstall).not.toHaveBeenCalled();
    expect(mockReleaseRepo.update).not.toHaveBeenCalled();
  });

  it("still marks release as uninstalled even if helm CLI fails", async () => {
    const release = { id: "hr-2", name: "failing-release", namespace: "default" } as HelmRelease;
    mockReleaseRepo.findOneBy.mockResolvedValue(release);
    (HelmService.uninstall as jest.Mock).mockRejectedValue(new Error("helm: release not found"));
    mockReleaseRepo.update.mockResolvedValue({ affected: 1 });

    await uninstallHelmRelease("env-1", "failing-release");

    expect(mockReleaseRepo.update).toHaveBeenCalledWith("hr-2", { status: "uninstalled" });
  });
});
