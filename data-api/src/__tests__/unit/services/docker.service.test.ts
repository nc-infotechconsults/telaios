/**
 * Unit tests for DockerClient (docker.service.ts).
 *
 * Dockerode is mocked entirely so no real Docker daemon is needed.
 */
import { EventEmitter } from "events";
import { DockerClient, DockerConnectionConfig } from "../../../services/docker.service";

// ---------------------------------------------------------------------------
// Dockerode mock
// ---------------------------------------------------------------------------

const mockStart = jest.fn().mockResolvedValue(undefined);
const mockStop = jest.fn().mockResolvedValue(undefined);
const mockRestart = jest.fn().mockResolvedValue(undefined);
const mockRemoveContainer = jest.fn().mockResolvedValue(undefined);
const mockInspect = jest.fn().mockResolvedValue({ Id: "abc123" });
const mockLogs = jest.fn().mockResolvedValue(Buffer.from("log line\n"));
const mockExecStart = jest.fn();
const mockExec = jest.fn();
const mockGetArchive = jest.fn();
const mockStats = jest.fn().mockResolvedValue({});
const mockExecInspect = jest.fn().mockResolvedValue({ ExitCode: 0, Running: false });
const mockExecObj = { start: mockExecStart, inspect: mockExecInspect };

const mockContainer = {
  start: mockStart,
  stop: mockStop,
  restart: mockRestart,
  remove: mockRemoveContainer,
  inspect: mockInspect,
  logs: mockLogs,
  exec: mockExec,
  getArchive: mockGetArchive,
  stats: mockStats,
};

const mockImageInspect = jest.fn().mockResolvedValue({ Id: "sha256:img" });
const mockRemoveImage = jest.fn().mockResolvedValue(undefined);
const mockImageTag = jest.fn().mockResolvedValue(undefined);
const mockImage = { remove: mockRemoveImage, inspect: mockImageInspect, tag: mockImageTag };

const mockVolumeInspect = jest.fn().mockResolvedValue({ Name: "my-volume" });
const mockRemoveVolume = jest.fn().mockResolvedValue(undefined);
const mockVolume = { remove: mockRemoveVolume, inspect: mockVolumeInspect };

const mockNetworkInspect = jest.fn().mockResolvedValue({ Id: "net-1" });
const mockNetworkRemove = jest.fn().mockResolvedValue(undefined);
const mockNetwork = { inspect: mockNetworkInspect, remove: mockNetworkRemove };

const mockCreateContainer = jest.fn().mockResolvedValue(mockContainer);
const mockListContainers = jest.fn().mockResolvedValue([]);
const mockListImages = jest.fn().mockResolvedValue([]);
const mockListNetworks = jest.fn().mockResolvedValue([]);
const mockListVolumes = jest.fn().mockResolvedValue({ Volumes: [] });
const mockVersion = jest.fn().mockResolvedValue({ Version: "24.0.0" });
const mockGetContainer = jest.fn().mockReturnValue(mockContainer);
const mockGetImage = jest.fn().mockReturnValue(mockImage);
const mockGetVolume = jest.fn().mockReturnValue(mockVolume);
const mockGetNetwork = jest.fn().mockReturnValue(mockNetwork);
const mockPull = jest.fn();
const mockPruneImages = jest.fn().mockResolvedValue({ ImagesDeleted: [], SpaceReclaimed: 0 });
const mockCreateVolume = jest.fn().mockResolvedValue({ Name: "new-volume" });
const mockPruneVolumes = jest.fn().mockResolvedValue({ VolumesDeleted: [], SpaceReclaimed: 0 });
const mockCreateNetwork = jest.fn().mockResolvedValue({ id: "net-new" });
const mockPruneNetworks = jest.fn().mockResolvedValue({ NetworksDeleted: [] });
const mockFollowProgress = jest.fn();

const mockDockerInstance = {
  listContainers: mockListContainers,
  listImages: mockListImages,
  listNetworks: mockListNetworks,
  listVolumes: mockListVolumes,
  version: mockVersion,
  getContainer: mockGetContainer,
  getImage: mockGetImage,
  getVolume: mockGetVolume,
  getNetwork: mockGetNetwork,
  createContainer: mockCreateContainer,
  pull: mockPull,
  pruneImages: mockPruneImages,
  createVolume: mockCreateVolume,
  pruneVolumes: mockPruneVolumes,
  createNetwork: mockCreateNetwork,
  pruneNetworks: mockPruneNetworks,
  modem: { followProgress: mockFollowProgress },
};

jest.mock("dockerode", () => {
  return jest.fn().mockImplementation(() => mockDockerInstance);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dockerCfg: DockerConnectionConfig = { type: "docker", host: "tcp://docker-host:2376" };
const socketCfg: DockerConnectionConfig = { type: "docker", host: "unix:///var/run/docker.sock" };
const localCfg: DockerConnectionConfig = { type: "docker" };

beforeEach(() => {
  jest.clearAllMocks();
  // Reset to default resolved values
  mockStart.mockResolvedValue(undefined);
  mockStop.mockResolvedValue(undefined);
  mockRestart.mockResolvedValue(undefined);
  mockRemoveContainer.mockResolvedValue(undefined);
  mockRemoveImage.mockResolvedValue(undefined);
  mockRemoveVolume.mockResolvedValue(undefined);
  mockNetworkRemove.mockResolvedValue(undefined);
  mockImageInspect.mockResolvedValue({ Id: "sha256:img" });
  mockVolumeInspect.mockResolvedValue({ Name: "my-volume" });
  mockNetworkInspect.mockResolvedValue({ Id: "net-1" });
  mockCreateContainer.mockResolvedValue(mockContainer);
  mockStats.mockResolvedValue({});
  mockExecInspect.mockResolvedValue({ ExitCode: 0, Running: false });
  mockImageTag.mockResolvedValue(undefined);
  mockPruneImages.mockResolvedValue({ ImagesDeleted: [], SpaceReclaimed: 0 });
  mockCreateVolume.mockResolvedValue({ Name: "new-volume" });
  mockPruneVolumes.mockResolvedValue({ VolumesDeleted: [], SpaceReclaimed: 0 });
  mockCreateNetwork.mockResolvedValue({ id: "net-new" });
  mockPruneNetworks.mockResolvedValue({ NetworksDeleted: [] });
  mockGetContainer.mockReturnValue(mockContainer);
  mockGetImage.mockReturnValue(mockImage);
  mockGetVolume.mockReturnValue(mockVolume);
  mockGetNetwork.mockReturnValue(mockNetwork);
});

// ---------------------------------------------------------------------------
// startContainer
// ---------------------------------------------------------------------------

describe("DockerClient.startContainer", () => {
  it("calls container.start() for the given container id", async () => {
    await DockerClient.startContainer(dockerCfg, "abc123");

    expect(mockGetContainer).toHaveBeenCalledWith("abc123");
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("propagates errors thrown by dockerode", async () => {
    mockStart.mockRejectedValue(new Error("container already started"));

    await expect(DockerClient.startContainer(dockerCfg, "abc123")).rejects.toThrow("container already started");
  });
});

// ---------------------------------------------------------------------------
// stopContainer
// ---------------------------------------------------------------------------

describe("DockerClient.stopContainer", () => {
  it("calls container.stop() for the given container id", async () => {
    await DockerClient.stopContainer(dockerCfg, "abc123");

    expect(mockGetContainer).toHaveBeenCalledWith("abc123");
    expect(mockStop).toHaveBeenCalledTimes(1);
  });

  it("propagates errors thrown by dockerode", async () => {
    mockStop.mockRejectedValue(new Error("container not running"));

    await expect(DockerClient.stopContainer(dockerCfg, "abc123")).rejects.toThrow("container not running");
  });
});

// ---------------------------------------------------------------------------
// restartContainer
// ---------------------------------------------------------------------------

describe("DockerClient.restartContainer", () => {
  it("calls container.restart() for the given container id", async () => {
    await DockerClient.restartContainer(dockerCfg, "def456");

    expect(mockGetContainer).toHaveBeenCalledWith("def456");
    expect(mockRestart).toHaveBeenCalledTimes(1);
  });

  it("propagates errors thrown by dockerode", async () => {
    mockRestart.mockRejectedValue(new Error("no such container"));

    await expect(DockerClient.restartContainer(dockerCfg, "def456")).rejects.toThrow("no such container");
  });
});

// ---------------------------------------------------------------------------
// removeContainer
// ---------------------------------------------------------------------------

describe("DockerClient.removeContainer", () => {
  it("calls container.remove() with force=false by default", async () => {
    await DockerClient.removeContainer(dockerCfg, "abc123");

    expect(mockGetContainer).toHaveBeenCalledWith("abc123");
    expect(mockRemoveContainer).toHaveBeenCalledWith({ force: false });
  });

  it("calls container.remove() with force=true when specified", async () => {
    await DockerClient.removeContainer(dockerCfg, "abc123", true);

    expect(mockRemoveContainer).toHaveBeenCalledWith({ force: true });
  });

  it("propagates errors thrown by dockerode", async () => {
    mockRemoveContainer.mockRejectedValue(new Error("container is running"));

    await expect(DockerClient.removeContainer(dockerCfg, "abc123")).rejects.toThrow("container is running");
  });
});

// ---------------------------------------------------------------------------
// removeImage
// ---------------------------------------------------------------------------

describe("DockerClient.removeImage", () => {
  it("calls image.remove() with force=false by default", async () => {
    await DockerClient.removeImage(dockerCfg, "sha256:abc");

    expect(mockGetImage).toHaveBeenCalledWith("sha256:abc");
    expect(mockRemoveImage).toHaveBeenCalledWith({ force: false });
  });

  it("calls image.remove() with force=true when specified", async () => {
    await DockerClient.removeImage(dockerCfg, "sha256:abc", true);

    expect(mockRemoveImage).toHaveBeenCalledWith({ force: true });
  });

  it("propagates errors thrown by dockerode", async () => {
    mockRemoveImage.mockRejectedValue(new Error("image is in use"));

    await expect(DockerClient.removeImage(dockerCfg, "sha256:abc")).rejects.toThrow("image is in use");
  });
});

// ---------------------------------------------------------------------------
// removeVolume
// ---------------------------------------------------------------------------

describe("DockerClient.removeVolume", () => {
  it("calls volume.remove() for the given volume name", async () => {
    await DockerClient.removeVolume(dockerCfg, "my-volume");

    expect(mockGetVolume).toHaveBeenCalledWith("my-volume");
    expect(mockRemoveVolume).toHaveBeenCalledTimes(1);
  });

  it("propagates errors thrown by dockerode", async () => {
    mockRemoveVolume.mockRejectedValue(new Error("volume in use"));

    await expect(DockerClient.removeVolume(dockerCfg, "my-volume")).rejects.toThrow("volume in use");
  });
});

// ---------------------------------------------------------------------------
// listContainers
// ---------------------------------------------------------------------------

describe("DockerClient.listContainers", () => {
  it("maps raw dockerode container list to DockerContainerSummary[]", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockListContainers.mockResolvedValue([
      {
        Id: "abc123fullid",
        Names: ["/my-container"],
        Image: "nginx:latest",
        Status: "Up 2 hours",
        State: "running",
        Created: now,
        Ports: [{ PublicPort: 8080, PrivatePort: 80, Type: "tcp" }],
      },
    ]);

    const result = await DockerClient.listContainers(dockerCfg);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "abc123fullid",
      name: "my-container",
      image: "nginx:latest",
      status: "Up 2 hours",
      state: "running",
      ports: [{ host: 8080, container: 80, protocol: "tcp" }],
    });
    expect(result[0].created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("handles containers with no public port", async () => {
    mockListContainers.mockResolvedValue([
      {
        Id: "xyz",
        Names: ["/svc"],
        Image: "redis",
        Status: "Up",
        State: "running",
        Created: 0,
        Ports: [{ PrivatePort: 6379, Type: "tcp" }],
      },
    ]);

    const result = await DockerClient.listContainers(socketCfg);
    expect(result[0].ports).toEqual([{ host: null, container: 6379, protocol: "tcp" }]);
  });

  it("requests all containers (including stopped)", async () => {
    mockListContainers.mockResolvedValue([]);
    await DockerClient.listContainers(localCfg);
    expect(mockListContainers).toHaveBeenCalledWith({ all: true });
  });
});

// ---------------------------------------------------------------------------
// getContainer
// ---------------------------------------------------------------------------

describe("DockerClient.getContainer", () => {
  it("returns the result of container.inspect()", async () => {
    mockInspect.mockResolvedValue({ Id: "full-id", State: { Status: "running" } });

    const result = await DockerClient.getContainer(dockerCfg, "full-id");

    expect(mockGetContainer).toHaveBeenCalledWith("full-id");
    expect(result).toMatchObject({ Id: "full-id" });
  });
});

// ---------------------------------------------------------------------------
// getContainerLogs
// ---------------------------------------------------------------------------

describe("DockerClient.getContainerLogs", () => {
  it("returns logs as a utf8 string", async () => {
    mockLogs.mockResolvedValue(Buffer.from("INFO server started\nDEBUG ok\n"));

    const result = await DockerClient.getContainerLogs(dockerCfg, "abc123");

    expect(result).toBe("INFO server started\nDEBUG ok\n");
  });

  it("defaults tail to 200", async () => {
    mockLogs.mockResolvedValue(Buffer.from(""));
    await DockerClient.getContainerLogs(dockerCfg, "abc123");
    expect(mockLogs).toHaveBeenCalledWith({ stdout: true, stderr: true, tail: 200 });
  });

  it("passes custom tail value", async () => {
    mockLogs.mockResolvedValue(Buffer.from(""));
    await DockerClient.getContainerLogs(dockerCfg, "abc123", 50);
    expect(mockLogs).toHaveBeenCalledWith({ stdout: true, stderr: true, tail: 50 });
  });
});

// ---------------------------------------------------------------------------
// listImages
// ---------------------------------------------------------------------------

describe("DockerClient.listImages", () => {
  it("maps raw dockerode image list to DockerImageSummary[]", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockListImages.mockResolvedValue([
      { Id: "sha256:abc123", RepoTags: ["nginx:latest", "nginx:1.25"], Size: 12345, Created: now },
    ]);

    const result = await DockerClient.listImages(dockerCfg);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "sha256:abc123",
      tags: ["nginx:latest", "nginx:1.25"],
      size: 12345,
      repository: "nginx",
    });
    expect(result[0].created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mockListImages).toHaveBeenCalledWith({ all: false });
  });

  it("filters out <none>:<none> tags", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockListImages.mockResolvedValue([
      { Id: "sha256:untagged", RepoTags: ["<none>:<none>"], Size: 1000, Created: now },
    ]);

    const result = await DockerClient.listImages(dockerCfg);
    expect(result[0].tags).toEqual([]);
    expect(result[0].repository).toBeUndefined();
  });

  it("handles null RepoTags", async () => {
    const now = Math.floor(Date.now() / 1000);
    mockListImages.mockResolvedValue([
      { Id: "sha256:notags", RepoTags: null, Size: 500, Created: now },
    ]);

    const result = await DockerClient.listImages(dockerCfg);
    expect(result[0].tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listNetworks
// ---------------------------------------------------------------------------

describe("DockerClient.listNetworks", () => {
  it("maps raw dockerode network list to DockerNetworkSummary[]", async () => {
    mockListNetworks.mockResolvedValue([
      {
        Id: "net-1",
        Name: "bridge",
        Driver: "bridge",
        Scope: "local",
        Created: "2026-01-01T00:00:00Z",
        Containers: { "c1": {}, "c2": {} },
        IPAM: { Config: [{ Subnet: "172.17.0.0/16", Gateway: "172.17.0.1" }] },
      },
    ]);

    const result = await DockerClient.listNetworks(dockerCfg);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "net-1",
      name: "bridge",
      driver: "bridge",
      scope: "local",
      containers: 2,
      created: "2026-01-01T00:00:00Z",
      ipam: { subnet: "172.17.0.0/16", gateway: "172.17.0.1" },
    });
  });

  it("sets ipam to undefined when no IPAM config present", async () => {
    mockListNetworks.mockResolvedValue([
      { Id: "net-2", Name: "none", Driver: "null", Scope: "local", Created: "", Containers: {}, IPAM: { Config: [] } },
    ]);

    const result = await DockerClient.listNetworks(dockerCfg);
    expect(result[0].ipam).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// listVolumes
// ---------------------------------------------------------------------------

describe("DockerClient.listVolumes", () => {
  it("maps raw dockerode volume list to DockerVolumeSummary[]", async () => {
    mockListVolumes.mockResolvedValue({
      Volumes: [{ Name: "my-volume", Driver: "local", Mountpoint: "/var/lib/docker/volumes/my-volume", Scope: "local", Labels: { "com.example": "true" } }],
      Warnings: [],
    });

    const result = await DockerClient.listVolumes(dockerCfg);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: "my-volume",
      driver: "local",
      mountpoint: "/var/lib/docker/volumes/my-volume",
      scope: "local",
      labels: { "com.example": "true" },
    });
  });

  it("returns empty array when Volumes is null/undefined", async () => {
    mockListVolumes.mockResolvedValue({ Volumes: null });

    const result = await DockerClient.listVolumes(dockerCfg);

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// testConnection
// ---------------------------------------------------------------------------

describe("DockerClient.testConnection", () => {
  it("returns ok=true with version on success", async () => {
    mockVersion.mockResolvedValue({ Version: "24.0.7" });

    const result = await DockerClient.testConnection(dockerCfg);

    expect(result).toEqual({ ok: true, version: "24.0.7" });
  });

  it("returns ok=false without throwing when dockerode throws", async () => {
    mockVersion.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await DockerClient.testConnection(dockerCfg);

    expect(result).toEqual({ ok: false });
  });
});

// ---------------------------------------------------------------------------
// inspectImage
// ---------------------------------------------------------------------------

describe("DockerClient.inspectImage", () => {
  it("returns the result of image.inspect()", async () => {
    mockImageInspect.mockResolvedValue({ Id: "sha256:abc", Os: "linux" });

    const result = await DockerClient.inspectImage(dockerCfg, "sha256:abc");

    expect(mockGetImage).toHaveBeenCalledWith("sha256:abc");
    expect(mockImageInspect).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ Id: "sha256:abc", Os: "linux" });
  });

  it("propagates errors thrown by dockerode", async () => {
    mockImageInspect.mockRejectedValue(new Error("no such image"));

    await expect(DockerClient.inspectImage(dockerCfg, "sha256:missing")).rejects.toThrow("no such image");
  });
});

// ---------------------------------------------------------------------------
// inspectNetwork
// ---------------------------------------------------------------------------

describe("DockerClient.inspectNetwork", () => {
  it("returns the result of network.inspect()", async () => {
    mockNetworkInspect.mockResolvedValue({ Id: "net-abc", Name: "bridge" });

    const result = await DockerClient.inspectNetwork(dockerCfg, "net-abc");

    expect(mockGetNetwork).toHaveBeenCalledWith("net-abc");
    expect(mockNetworkInspect).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ Id: "net-abc", Name: "bridge" });
  });

  it("propagates errors thrown by dockerode", async () => {
    mockNetworkInspect.mockRejectedValue(new Error("no such network"));

    await expect(DockerClient.inspectNetwork(dockerCfg, "missing")).rejects.toThrow("no such network");
  });
});

// ---------------------------------------------------------------------------
// inspectVolume
// ---------------------------------------------------------------------------

describe("DockerClient.inspectVolume", () => {
  it("returns the result of volume.inspect()", async () => {
    mockVolumeInspect.mockResolvedValue({ Name: "my-vol", Driver: "local" });

    const result = await DockerClient.inspectVolume(dockerCfg, "my-vol");

    expect(mockGetVolume).toHaveBeenCalledWith("my-vol");
    expect(mockVolumeInspect).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ Name: "my-vol", Driver: "local" });
  });

  it("propagates errors thrown by dockerode", async () => {
    mockVolumeInspect.mockRejectedValue(new Error("no such volume"));

    await expect(DockerClient.inspectVolume(dockerCfg, "missing")).rejects.toThrow("no such volume");
  });
});

// ---------------------------------------------------------------------------
// listVolumeFiles
// ---------------------------------------------------------------------------

/** Build a valid Docker-multiplexed buffer from stdout text. */
function buildMuxedBuffer(text: string): Buffer {
  const body = Buffer.from(text, "utf8");
  const header = Buffer.alloc(8);
  header.writeUInt8(1, 0); // stdout
  header.writeUInt32BE(body.length, 4);
  return Buffer.concat([header, body]);
}

describe("DockerClient.listVolumeFiles", () => {
  function makeMockExecStream(output: string): EventEmitter {
    const emitter = new EventEmitter();
    setImmediate(() => {
      emitter.emit("data", buildMuxedBuffer(output));
      emitter.emit("end");
    });
    return emitter;
  }

  beforeEach(() => {
    const execObj = { start: mockExecStart, inspect: mockExecInspect };
    mockExec.mockResolvedValue(execObj);
  });

  it("creates a temp busybox container and lists files", async () => {
    const lsOutput = [
      "total 8",
      "drwxr-xr-x 2 root root 4096 Jan 12 10:00 .",
      "drwxr-xr-x 1 root root 4096 Jan 12 10:00 ..",
      "-rw-r--r-- 1 root root  100 Jan 12 10:00 file.txt",
      "drwxr-xr-x 2 root root 4096 Jan 12 10:00 subdir",
    ].join("\n");

    mockExecStart.mockResolvedValue(makeMockExecStream(lsOutput));

    const result = await DockerClient.listVolumeFiles(dockerCfg, "my-volume", "/");

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Image: "busybox",
        HostConfig: expect.objectContaining({ Binds: ["my-volume:/vol:ro"] }),
        Labels: { "swe-temp": "true" },
      }),
    );
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockExec).toHaveBeenCalledWith(
      expect.objectContaining({ Cmd: ["ls", "-la", "/vol/"], AttachStdout: true }),
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: "file.txt", type: "file", size: 100, path: "/file.txt" });
    expect(result[1]).toMatchObject({ name: "subdir", type: "directory", path: "/subdir" });
  });

  it("always removes the temp container even if exec fails", async () => {
    mockExecStart.mockRejectedValue(new Error("exec failed"));

    await expect(DockerClient.listVolumeFiles(dockerCfg, "my-volume", "/")).rejects.toThrow("exec failed");

    expect(mockStop).toHaveBeenCalled();
    expect(mockRemoveContainer).toHaveBeenCalledWith({ force: true });
  });

  it("caps result at 500 entries", async () => {
    const lines = ["total 0"];
    for (let i = 0; i < 600; i++) {
      lines.push(`-rw-r--r-- 1 root root 0 Jan 12 10:00 file${i}.txt`);
    }
    mockExecStart.mockResolvedValue(makeMockExecStream(lines.join("\n")));

    const result = await DockerClient.listVolumeFiles(dockerCfg, "my-volume", "/");

    expect(result).toHaveLength(500);
  });

  it("navigates into subdirectory path", async () => {
    const lsOutput = "-rw-r--r-- 1 root root 42 Jan 12 10:00 data.json";
    mockExecStart.mockResolvedValue(makeMockExecStream(lsOutput));

    const result = await DockerClient.listVolumeFiles(dockerCfg, "my-volume", "/subdir");

    expect(mockExec).toHaveBeenCalledWith(
      expect.objectContaining({ Cmd: ["ls", "-la", "/vol/subdir"] }),
    );
    expect(result[0]).toMatchObject({ name: "data.json", path: "/subdir/data.json" });
  });
});

// ---------------------------------------------------------------------------
// downloadVolumeFile
// ---------------------------------------------------------------------------

describe("DockerClient.downloadVolumeFile", () => {
  it("creates a temp container and returns a stream with a cleanup fn", async () => {
    const fakeStream = new EventEmitter();
    mockGetArchive.mockResolvedValue(fakeStream);

    const { stream, cleanup } = await DockerClient.downloadVolumeFile(dockerCfg, "my-volume", "/file.txt");

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({ Image: "busybox" }),
    );
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(mockGetArchive).toHaveBeenCalledWith({ path: "/vol/file.txt" });
    expect(stream).toBe(fakeStream);

    await cleanup();
    expect(mockStop).toHaveBeenCalled();
    expect(mockRemoveContainer).toHaveBeenCalledWith({ force: true });
  });

  it("cleans up the container if getArchive fails", async () => {
    mockGetArchive.mockRejectedValue(new Error("path not found"));

    await expect(
      DockerClient.downloadVolumeFile(dockerCfg, "my-volume", "/missing.txt"),
    ).rejects.toThrow("path not found");

    expect(mockStop).toHaveBeenCalled();
    expect(mockRemoveContainer).toHaveBeenCalledWith({ force: true });
  });
});

// ---------------------------------------------------------------------------
// createContainer
// ---------------------------------------------------------------------------

describe("DockerClient.createContainer", () => {
  beforeEach(() => {
    mockInspect.mockResolvedValue({ Id: "abc123fullid" });
  });

  it("creates a container with image and name, returns short id", async () => {
    const result = await DockerClient.createContainer(dockerCfg, { image: "nginx:latest", name: "my-nginx" });

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({ Image: "nginx:latest", name: "my-nginx" }),
    );
    expect(result).toEqual({ id: "abc123fullid" });
  });

  it("starts the container when start=true", async () => {
    await DockerClient.createContainer(dockerCfg, { image: "nginx:latest", start: true });

    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it("does not start the container when start=false", async () => {
    await DockerClient.createContainer(dockerCfg, { image: "nginx:latest", start: false });

    expect(mockStart).not.toHaveBeenCalled();
  });

  it("maps env vars to Env array", async () => {
    await DockerClient.createContainer(dockerCfg, {
      image: "nginx:latest",
      env: { FOO: "bar", BAZ: "qux" },
    });

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({ Env: expect.arrayContaining(["FOO=bar", "BAZ=qux"]) }),
    );
  });

  it("maps port mappings to ExposedPorts and PortBindings", async () => {
    await DockerClient.createContainer(dockerCfg, {
      image: "nginx:latest",
      ports: [{ host: 8080, container: 80, protocol: "tcp" }],
    });

    expect(mockCreateContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        ExposedPorts: { "80/tcp": {} },
        HostConfig: expect.objectContaining({
          PortBindings: { "80/tcp": [{ HostPort: "8080" }] },
        }),
      }),
    );
  });

  it("propagates errors thrown by dockerode", async () => {
    mockCreateContainer.mockRejectedValue(new Error("no such image"));

    await expect(DockerClient.createContainer(dockerCfg, { image: "missing:latest" })).rejects.toThrow("no such image");
  });
});

// ---------------------------------------------------------------------------
// execContainer
// ---------------------------------------------------------------------------

describe("DockerClient.execContainer", () => {
  function makeMuxedBuffer(stdout: string, stderr = ""): Buffer {
    const parts: Buffer[] = [];

    if (stdout) {
      const body = Buffer.from(stdout, "utf8");
      const hdr = Buffer.alloc(8);
      hdr.writeUInt8(1, 0);
      hdr.writeUInt32BE(body.length, 4);
      parts.push(hdr, body);
    }
    if (stderr) {
      const body = Buffer.from(stderr, "utf8");
      const hdr = Buffer.alloc(8);
      hdr.writeUInt8(2, 0);
      hdr.writeUInt32BE(body.length, 4);
      parts.push(hdr, body);
    }
    return Buffer.concat(parts);
  }

  function makeExecStream(stdout: string, stderr = ""): EventEmitter {
    const emitter = new EventEmitter();
    setImmediate(() => {
      emitter.emit("data", makeMuxedBuffer(stdout, stderr));
      emitter.emit("end");
    });
    return emitter;
  }

  beforeEach(() => {
    mockExec.mockResolvedValue(mockExecObj);
  });

  it("runs the command and returns stdout/stderr/exit_code", async () => {
    mockExecStart.mockResolvedValue(makeExecStream("hello\n", "err\n"));
    mockExecInspect.mockResolvedValue({ ExitCode: 0, Running: false });

    const result = await DockerClient.execContainer(dockerCfg, "abc123", ["echo", "hello"]);

    expect(mockGetContainer).toHaveBeenCalledWith("abc123");
    expect(mockExec).toHaveBeenCalledWith(
      expect.objectContaining({ Cmd: ["echo", "hello"], AttachStdout: true, AttachStderr: true }),
    );
    expect(result.stdout).toBe("hello\n");
    expect(result.stderr).toBe("err\n");
    expect(result.exit_code).toBe(0);
  });

  it("passes working_dir and user to exec options", async () => {
    mockExecStart.mockResolvedValue(makeExecStream(""));
    mockExecInspect.mockResolvedValue({ ExitCode: 0 });

    await DockerClient.execContainer(dockerCfg, "abc123", ["ls"], "/app", "root");

    expect(mockExec).toHaveBeenCalledWith(
      expect.objectContaining({ WorkingDir: "/app", User: "root" }),
    );
  });

  it("returns non-zero exit code from inspect", async () => {
    mockExecStart.mockResolvedValue(makeExecStream("", "command not found\n"));
    mockExecInspect.mockResolvedValue({ ExitCode: 127 });

    const result = await DockerClient.execContainer(dockerCfg, "abc123", ["badcmd"]);

    expect(result.exit_code).toBe(127);
    expect(result.stderr).toBe("command not found\n");
  });

  it("propagates errors from exec.start", async () => {
    mockExecStart.mockRejectedValue(new Error("exec failed"));

    await expect(DockerClient.execContainer(dockerCfg, "abc123", ["ls"])).rejects.toThrow("exec failed");
  });
});

// ---------------------------------------------------------------------------
// containerStats
// ---------------------------------------------------------------------------

describe("DockerClient.containerStats", () => {
  it("returns zeroed stats when raw data is empty", async () => {
    mockStats.mockResolvedValue({});

    const result = await DockerClient.containerStats(dockerCfg, "abc123");

    expect(result.container_id).toBe("abc123");
    expect(result.cpu_percent).toBe(0);
    expect(result.memory_usage).toBe(0);
    expect(result.pids).toBe(0);
  });

  it("calculates CPU percentage from cpu_stats and precpu_stats", async () => {
    mockStats.mockResolvedValue({
      cpu_stats: {
        cpu_usage: { total_usage: 20_000_000, percpu_usage: [5_000_000, 15_000_000] },
        system_cpu_usage: 1_000_000_000,
        online_cpus: 2,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 10_000_000 },
        system_cpu_usage: 900_000_000,
      },
    });

    const result = await DockerClient.containerStats(dockerCfg, "abc123");

    // cpuDelta=10M, sysDelta=100M, count=2 → 10M/100M * 2 * 100 = 20%
    expect(result.cpu_percent).toBe(20);
  });

  it("sums network rx/tx across all interfaces", async () => {
    mockStats.mockResolvedValue({
      networks: {
        eth0: { rx_bytes: 1000, tx_bytes: 2000 },
        eth1: { rx_bytes: 500, tx_bytes: 300 },
      },
    });

    const result = await DockerClient.containerStats(dockerCfg, "abc123");

    expect(result.network_rx).toBe(1500);
    expect(result.network_tx).toBe(2300);
  });

  it("sums block read/write from blkio_stats", async () => {
    mockStats.mockResolvedValue({
      blkio_stats: {
        io_service_bytes_recursive: [
          { op: "Read", value: 4096 },
          { op: "Write", value: 8192 },
          { op: "Read", value: 1024 },
        ],
      },
    });

    const result = await DockerClient.containerStats(dockerCfg, "abc123");

    expect(result.block_read).toBe(5120);
    expect(result.block_write).toBe(8192);
  });
});

// ---------------------------------------------------------------------------
// pullImage
// ---------------------------------------------------------------------------

describe("DockerClient.pullImage", () => {
  it("calls docker.pull with image:tag and follows the stream", async () => {
    mockPull.mockImplementation((_ref: string, _opts: object, cb: Function) => {
      cb(null, new EventEmitter());
    });
    mockFollowProgress.mockImplementation((_stream: unknown, cb: Function) => cb(null, []));

    await DockerClient.pullImage(dockerCfg, "nginx", "latest");

    expect(mockPull).toHaveBeenCalledWith("nginx:latest", {}, expect.any(Function));
    expect(mockFollowProgress).toHaveBeenCalledTimes(1);
  });

  it("passes authconfig when username is provided", async () => {
    mockPull.mockImplementation((_ref: string, opts: { authconfig?: object }, cb: Function) => {
      cb(null, new EventEmitter());
    });
    mockFollowProgress.mockImplementation((_stream: unknown, cb: Function) => cb(null, []));

    await DockerClient.pullImage(dockerCfg, "private/image", "v1", "user", "pass");

    expect(mockPull).toHaveBeenCalledWith(
      "private/image:v1",
      { authconfig: { username: "user", password: "pass" } },
      expect.any(Function),
    );
  });

  it("rejects when docker.pull callback provides an error", async () => {
    mockPull.mockImplementation((_ref: string, _opts: object, cb: Function) => {
      cb(new Error("pull failed"), null);
    });

    await expect(DockerClient.pullImage(dockerCfg, "nginx", "latest")).rejects.toThrow("pull failed");
  });
});

// ---------------------------------------------------------------------------
// tagImage
// ---------------------------------------------------------------------------

describe("DockerClient.tagImage", () => {
  it("calls image.tag() with repo and tag", async () => {
    await DockerClient.tagImage(dockerCfg, "sha256:abc", "myrepo/nginx", "v2");

    expect(mockGetImage).toHaveBeenCalledWith("sha256:abc");
    expect(mockImageTag).toHaveBeenCalledWith({ repo: "myrepo/nginx", tag: "v2" });
  });

  it("propagates errors from image.tag()", async () => {
    mockImageTag.mockRejectedValue(new Error("no such image"));

    await expect(DockerClient.tagImage(dockerCfg, "sha256:missing", "repo", "tag")).rejects.toThrow("no such image");
  });
});

// ---------------------------------------------------------------------------
// pruneImages
// ---------------------------------------------------------------------------

describe("DockerClient.pruneImages", () => {
  it("returns removed ids and reclaimed bytes", async () => {
    mockPruneImages.mockResolvedValue({
      ImagesDeleted: [{ Deleted: "sha256:aaa" }, { Untagged: "nginx:old" }],
      SpaceReclaimed: 10240,
    });

    const result = await DockerClient.pruneImages(dockerCfg);

    expect(result.removed).toEqual(["sha256:aaa", "nginx:old"]);
    expect(result.reclaimed_bytes).toBe(10240);
  });

  it("returns empty arrays when nothing is pruned", async () => {
    mockPruneImages.mockResolvedValue({ ImagesDeleted: null, SpaceReclaimed: 0 });

    const result = await DockerClient.pruneImages(dockerCfg);

    expect(result.removed).toEqual([]);
    expect(result.reclaimed_bytes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createVolume
// ---------------------------------------------------------------------------

describe("DockerClient.createVolume", () => {
  it("calls docker.createVolume() and returns the volume name", async () => {
    mockCreateVolume.mockResolvedValue({ Name: "my-new-vol" });

    const result = await DockerClient.createVolume(dockerCfg, "my-new-vol");

    expect(mockCreateVolume).toHaveBeenCalledWith(
      expect.objectContaining({ Name: "my-new-vol", Driver: "local" }),
    );
    expect(result).toEqual({ name: "my-new-vol" });
  });

  it("passes custom driver and driver_opts", async () => {
    mockCreateVolume.mockResolvedValue({ Name: "nfs-vol" });

    await DockerClient.createVolume(dockerCfg, "nfs-vol", "nfs", { "addr": "192.168.1.1" });

    expect(mockCreateVolume).toHaveBeenCalledWith(
      expect.objectContaining({ Driver: "nfs", DriverOpts: { addr: "192.168.1.1" } }),
    );
  });
});

// ---------------------------------------------------------------------------
// pruneVolumes
// ---------------------------------------------------------------------------

describe("DockerClient.pruneVolumes", () => {
  it("returns removed volume names and reclaimed bytes", async () => {
    mockPruneVolumes.mockResolvedValue({
      VolumesDeleted: ["vol-a", "vol-b"],
      SpaceReclaimed: 512,
    });

    const result = await DockerClient.pruneVolumes(dockerCfg);

    expect(result.removed).toEqual(["vol-a", "vol-b"]);
    expect(result.reclaimed_bytes).toBe(512);
  });
});

// ---------------------------------------------------------------------------
// createNetwork
// ---------------------------------------------------------------------------

describe("DockerClient.createNetwork", () => {
  it("calls docker.createNetwork() and returns the network id", async () => {
    mockCreateNetwork.mockResolvedValue({ id: "net-new-id" });

    const result = await DockerClient.createNetwork(dockerCfg, "my-net");

    expect(mockCreateNetwork).toHaveBeenCalledWith(
      expect.objectContaining({ Name: "my-net", Driver: "bridge" }),
    );
    expect(result).toEqual({ id: "net-new-id" });
  });

  it("includes IPAM config when subnet is provided", async () => {
    mockCreateNetwork.mockResolvedValue({ id: "net-new" });

    await DockerClient.createNetwork(dockerCfg, "custom-net", "bridge", "10.0.0.0/24", "10.0.0.1");

    expect(mockCreateNetwork).toHaveBeenCalledWith(
      expect.objectContaining({
        IPAM: { Config: [{ Subnet: "10.0.0.0/24", Gateway: "10.0.0.1" }] },
      }),
    );
  });

  it("sets Internal=true when internal flag is passed", async () => {
    mockCreateNetwork.mockResolvedValue({ id: "net-internal" });

    await DockerClient.createNetwork(dockerCfg, "internal-net", "bridge", undefined, undefined, true);

    expect(mockCreateNetwork).toHaveBeenCalledWith(
      expect.objectContaining({ Internal: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// removeNetwork
// ---------------------------------------------------------------------------

describe("DockerClient.removeNetwork", () => {
  it("calls network.remove() for the given network id", async () => {
    await DockerClient.removeNetwork(dockerCfg, "net-abc");

    expect(mockGetNetwork).toHaveBeenCalledWith("net-abc");
    expect(mockNetworkRemove).toHaveBeenCalledTimes(1);
  });

  it("propagates errors thrown by dockerode", async () => {
    mockNetworkRemove.mockRejectedValue(new Error("active endpoints"));

    await expect(DockerClient.removeNetwork(dockerCfg, "net-abc")).rejects.toThrow("active endpoints");
  });
});

// ---------------------------------------------------------------------------
// pruneNetworks
// ---------------------------------------------------------------------------

describe("DockerClient.pruneNetworks", () => {
  it("returns removed network ids with reclaimed_bytes=0", async () => {
    mockPruneNetworks.mockResolvedValue({ NetworksDeleted: ["net-x", "net-y"] });

    const result = await DockerClient.pruneNetworks(dockerCfg);

    expect(result.removed).toEqual(["net-x", "net-y"]);
    expect(result.reclaimed_bytes).toBe(0);
  });

  it("returns empty array when nothing pruned", async () => {
    mockPruneNetworks.mockResolvedValue({ NetworksDeleted: null });

    const result = await DockerClient.pruneNetworks(dockerCfg);

    expect(result.removed).toEqual([]);
  });
});
