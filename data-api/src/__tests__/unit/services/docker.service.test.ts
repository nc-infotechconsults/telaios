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

const mockContainer = {
  start: mockStart,
  stop: mockStop,
  restart: mockRestart,
  remove: mockRemoveContainer,
  inspect: mockInspect,
  logs: mockLogs,
  exec: mockExec,
  getArchive: mockGetArchive,
};

const mockImageInspect = jest.fn().mockResolvedValue({ Id: "sha256:img" });
const mockRemoveImage = jest.fn().mockResolvedValue(undefined);
const mockImage = { remove: mockRemoveImage, inspect: mockImageInspect };

const mockVolumeInspect = jest.fn().mockResolvedValue({ Name: "my-volume" });
const mockRemoveVolume = jest.fn().mockResolvedValue(undefined);
const mockVolume = { remove: mockRemoveVolume, inspect: mockVolumeInspect };

const mockNetworkInspect = jest.fn().mockResolvedValue({ Id: "net-1" });
const mockNetwork = { inspect: mockNetworkInspect };

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
  mockImageInspect.mockResolvedValue({ Id: "sha256:img" });
  mockVolumeInspect.mockResolvedValue({ Name: "my-volume" });
  mockNetworkInspect.mockResolvedValue({ Id: "net-1" });
  mockCreateContainer.mockResolvedValue(mockContainer);
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
    const execObj = { start: mockExecStart };
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
