/**
 * Docker client module.
 *
 * Wraps Dockerode to list containers, images, networks, and volumes
 * for a remote Docker host described by an environment connection_config.
 */
import Docker from "dockerode";
import logger from "../utils/logger";

export interface DockerConnectionConfig {
  type: "docker";
  host?: string;
  tls_cert?: string;
  tls_key?: string;
  tls_ca?: string;
}

export interface DockerPortBinding {
  /** Host (public) port — null when the container port is not bound to the host. */
  host: number | null;
  container: number;
  protocol: string;
}

export interface DockerContainerSummary {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  ports: DockerPortBinding[];
}

export interface DockerImageSummary {
  id: string;
  tags: string[];
  size: number;
  created: string;
  repository?: string;
}

export interface DockerVolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  created: string;
  scope: string;
  labels: Record<string, string>;
}

export interface DockerNetworkSummary {
  id: string;
  name: string;
  driver: string;
  scope: string;
  ipam?: { subnet: string; gateway: string };
  containers: number;
  created: string;
}

export interface DockerVolumeFileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  path: string;
}

export interface DockerPortMapping {
  host: number;
  container: number;
  protocol?: string;
}

export interface DockerVolumeMount {
  source?: string;
  container_path: string;
  read_only?: boolean;
}

export interface DockerCreateContainerOptions {
  image: string;
  name?: string;
  cmd?: string[];
  env?: Record<string, string>;
  ports?: DockerPortMapping[];
  volumes?: DockerVolumeMount[];
  network?: string;
  auto_remove?: boolean;
  start?: boolean;
}

export interface DockerExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface DockerContainerStats {
  container_id: string;
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  block_read: number;
  block_write: number;
  pids: number;
}

export interface DockerPruneResult {
  removed: string[];
  reclaimed_bytes: number;
}

function buildDockerClient(cfg: DockerConnectionConfig): Docker {
  logger.debug({ cfg }, "Building Docker client with config");

  if (!cfg.host) {
    return new Docker();
  }

  if (cfg.host.startsWith("unix://")) {
    const socketPath = cfg.host.replace("unix://", "");
    // docker-cli.sock is a Docker Desktop management socket, not the Engine API.
    // Fall back to the standard Engine API socket to avoid 404 errors.
    const engineSocket = socketPath.endsWith("docker-cli.sock")
      ? "/var/run/docker.sock"
      : socketPath;
    return new Docker({ socketPath: engineSocket });
  }

  // Parse tcp:// host
  const url = new URL(cfg.host);
  const opts: ConstructorParameters<typeof Docker>[0] = {
    host: url.hostname,
    port: parseInt(url.port || "2376", 10),
    protocol: url.protocol.replace(":", "") as "http" | "https" | "ssh",
  };

  if (cfg.tls_cert && cfg.tls_key && cfg.tls_ca) {
    opts.cert = cfg.tls_cert;
    opts.key = cfg.tls_key;
    opts.ca = cfg.tls_ca;
  }

  return new Docker(opts);
}

function formatPorts(
  ports: Array<{ PublicPort?: number; PrivatePort?: number; Type?: string }>,
): DockerPortBinding[] {
  return (ports ?? [])
    .filter((p) => p.PrivatePort !== undefined)
    .map((p) => ({
      host: p.PublicPort ?? null,
      container: p.PrivatePort!,
      protocol: p.Type ?? "tcp",
    }));
}

/**
 * Parse a Docker multiplexed exec stream buffer.
 * Each frame: [stream_type(1), padding(3), size(4), data(size)]
 */
function parseMuxedBuffer(buf: Buffer): string {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const size = buf.readUInt32BE(offset + 4);
    offset += 8;
    if (offset + size > buf.length) break;
    chunks.push(buf.subarray(offset, offset + size));
    offset += size;
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Parse a Docker multiplexed exec stream buffer into separate stdout/stderr.
 * Stream type 1 = stdout, 2 = stderr.
 */
function parseMuxedBufferSplit(buf: Buffer): { stdout: string; stderr: string } {
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const streamType = buf.readUInt8(offset);
    const size = buf.readUInt32BE(offset + 4);
    offset += 8;
    if (offset + size > buf.length) break;
    const chunk = buf.subarray(offset, offset + size);
    if (streamType === 1) stdoutChunks.push(chunk);
    else if (streamType === 2) stderrChunks.push(chunk);
    offset += size;
  }
  return {
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
  };
}

/**
 * Parse `ls -la` output into DockerVolumeFileEntry[].
 * Skips "." and ".." entries. Caps result at 500 items.
 */
function parseLsLaOutput(raw: string, dirPath: string): DockerVolumeFileEntry[] {
  const entries: DockerVolumeFileEntry[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("total ")) continue;

    // <permissions> <links> <owner> <group> <size> <month> <day> <time|year> <name>
    const match = trimmed.match(
      /^([d\-lcrwxst]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\S+\s+\S+\s+\S+)\s+(.+)$/,
    );
    if (!match) continue;

    const [, perms, sizeStr, dateStr, namePart] = match;
    // Handle symlinks: "name -> target"
    const name = namePart.split(" -> ")[0].trim();
    if (name === "." || name === "..") continue;

    const isDir = perms.startsWith("d");
    const entryPath = dirPath === "/" ? `/${name}` : `${dirPath}/${name}`;

    entries.push({
      name,
      type: isDir ? "directory" : "file",
      size: parseInt(sizeStr, 10),
      modified: dateStr.trim(),
      path: entryPath,
    });
  }

  return entries.slice(0, 500);
}

export const DockerClient = {
  async listContainers(cfg: DockerConnectionConfig): Promise<DockerContainerSummary[]> {
    const docker = buildDockerClient(cfg);
    const containers = await docker.listContainers({ all: true });
    return containers.map((c) => ({
      id: c.Id.slice(0, 12),
      name: (c.Names?.[0] ?? "").replace(/^\//, ""),
      image: c.Image,
      status: c.Status,
      state: c.State,
      created: new Date(c.Created * 1000).toISOString(),
      ports: formatPorts(c.Ports as Parameters<typeof formatPorts>[0]),
    }));
  },

  async getContainer(cfg: DockerConnectionConfig, id: string): Promise<unknown> {
    const docker = buildDockerClient(cfg);
    const container = docker.getContainer(id);
    return container.inspect();
  },

  async getContainerLogs(cfg: DockerConnectionConfig, id: string, tail = 200): Promise<string> {
    const docker = buildDockerClient(cfg);
    const container = docker.getContainer(id);
    const stream = await container.logs({ stdout: true, stderr: true, tail });
    // dockerode returns a Buffer for non-multiplexed streams
    return (stream as unknown as Buffer).toString("utf8");
  },

  async listImages(cfg: DockerConnectionConfig): Promise<DockerImageSummary[]> {
    const docker = buildDockerClient(cfg);
    const images = await docker.listImages({ all: false });
    return images.map((img) => {
      const tags: string[] = img.RepoTags ?? [];
      const firstTag = tags.find((t) => t !== "<none>:<none>");
      const repository = firstTag ? firstTag.split(":")[0] : undefined;
      return {
        id: img.Id,
        tags: tags.filter((t) => t !== "<none>:<none>"),
        size: img.Size,
        created: new Date(img.Created * 1000).toISOString(),
        repository,
      };
    });
  },

  async listNetworks(cfg: DockerConnectionConfig): Promise<DockerNetworkSummary[]> {
    const docker = buildDockerClient(cfg);
    const networks = await docker.listNetworks();
    return networks.map((n) => {
      const config = n.IPAM?.Config?.[0];
      return {
        id: n.Id,
        name: n.Name,
        driver: n.Driver,
        scope: n.Scope,
        ipam: config?.Subnet ? { subnet: config.Subnet, gateway: config.Gateway ?? "" } : undefined,
        containers: Object.keys(n.Containers ?? {}).length,
        created: n.Created,
      };
    });
  },

  async listVolumes(cfg: DockerConnectionConfig): Promise<DockerVolumeSummary[]> {
    const docker = buildDockerClient(cfg);
    const r = await docker.listVolumes();
    return (r.Volumes ?? []).map((v) => ({
      name: v.Name,
      driver: v.Driver,
      mountpoint: v.Mountpoint,
      created: (v as unknown as { CreatedAt?: string }).CreatedAt ?? "",
      scope: v.Scope,
      labels: (v.Labels as Record<string, string>) ?? {},
    }));
  },

  async startContainer(cfg: DockerConnectionConfig, id: string): Promise<void> {
    const docker = buildDockerClient(cfg);
    await docker.getContainer(id).start();
  },

  async stopContainer(cfg: DockerConnectionConfig, id: string): Promise<void> {
    const docker = buildDockerClient(cfg);
    await docker.getContainer(id).stop();
  },

  async restartContainer(cfg: DockerConnectionConfig, id: string): Promise<void> {
    const docker = buildDockerClient(cfg);
    await docker.getContainer(id).restart();
  },

  async removeContainer(cfg: DockerConnectionConfig, id: string, force = false): Promise<void> {
    const docker = buildDockerClient(cfg);
    await docker.getContainer(id).remove({ force });
  },

  async removeImage(cfg: DockerConnectionConfig, id: string, force = false): Promise<void> {
    const docker = buildDockerClient(cfg);
    await docker.getImage(id).remove({ force });
  },

  async removeVolume(cfg: DockerConnectionConfig, name: string): Promise<void> {
    const docker = buildDockerClient(cfg);
    await docker.getVolume(name).remove();
  },

  async testConnection(cfg: DockerConnectionConfig): Promise<{ ok: boolean; version?: string }> {
    try {
      const docker = buildDockerClient(cfg);
      const info = await docker.version();
      return { ok: true, version: (info as { Version?: string }).Version };
    } catch (e){
      logger.error({ err: e }, "Docker connection test failed");
      return { ok: false };
    }
  },

  // ─── Inspect ──────────────────────────────────────────────────────────────

  async inspectImage(cfg: DockerConnectionConfig, imageId: string): Promise<unknown> {
    const docker = buildDockerClient(cfg);
    return docker.getImage(imageId).inspect();
  },

  async inspectNetwork(cfg: DockerConnectionConfig, networkId: string): Promise<unknown> {
    const docker = buildDockerClient(cfg);
    return docker.getNetwork(networkId).inspect();
  },

  async inspectVolume(cfg: DockerConnectionConfig, volumeName: string): Promise<unknown> {
    const docker = buildDockerClient(cfg);
    return docker.getVolume(volumeName).inspect();
  },

  // ─── Volume file browser ──────────────────────────────────────────────────

  async listVolumeFiles(
    cfg: DockerConnectionConfig,
    volumeName: string,
    dirPath: string,
  ): Promise<DockerVolumeFileEntry[]> {
    const docker = buildDockerClient(cfg);
    const container = await docker.createContainer({
      Image: "busybox",
      Cmd: ["sleep", "infinity"],
      HostConfig: { Binds: [`${volumeName}:/vol:ro`] },
      Labels: { "swe-temp": "true" },
    });

    try {
      await container.start();

      const exec = await container.exec({
        Cmd: ["ls", "-la", `/vol${dirPath}`],
        AttachStdout: true,
        AttachStderr: false,
      });

      const stream = await exec.start({ hijack: true, stdin: false });

      const rawOutput = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        (stream as NodeJS.ReadableStream).on("data", (chunk: Buffer) => chunks.push(chunk));
        (stream as NodeJS.ReadableStream).on("end", () => {
          resolve(parseMuxedBuffer(Buffer.concat(chunks)));
        });
        (stream as NodeJS.ReadableStream).on("error", reject);
      });

      return parseLsLaOutput(rawOutput, dirPath);
    } finally {
      try { await container.stop({ t: 0 }); } catch { /* ignore */ }
      try { await container.remove({ force: true }); } catch { /* ignore */ }
    }
  },

  async downloadVolumeFile(
    cfg: DockerConnectionConfig,
    volumeName: string,
    filePath: string,
  ): Promise<{ stream: NodeJS.ReadableStream; cleanup: () => Promise<void> }> {
    const docker = buildDockerClient(cfg);
    const container = await docker.createContainer({
      Image: "busybox",
      Cmd: ["sleep", "infinity"],
      HostConfig: { Binds: [`${volumeName}:/vol:ro`] },
      Labels: { "swe-temp": "true" },
    });

    const cleanup = async () => {
      try { await container.stop({ t: 0 }); } catch { /* ignore */ }
      try { await container.remove({ force: true }); } catch { /* ignore */ }
    };

    try {
      await container.start();
      const stream = await container.getArchive({ path: `/vol${filePath}` });
      return { stream: stream as unknown as NodeJS.ReadableStream, cleanup };
    } catch (err) {
      await cleanup();
      throw err;
    }
  },

  // ─── Container actions ────────────────────────────────────────────────────

  async createContainer(
    cfg: DockerConnectionConfig,
    opts: DockerCreateContainerOptions,
  ): Promise<{ id: string }> {
    const docker = buildDockerClient(cfg);

    const exposedPorts: Record<string, object> = {};
    const portBindings: Record<string, Array<{ HostPort: string }>> = {};
    for (const p of (opts.ports ?? [])) {
      const proto = p.protocol ?? "tcp";
      const key = `${p.container}/${proto}`;
      exposedPorts[key] = {};
      portBindings[key] = [{ HostPort: String(p.host) }];
    }

    const binds: string[] = (opts.volumes ?? []).map((v) => {
      const src = v.source ?? "";
      const ro = v.read_only ? ":ro" : "";
      return `${src}:${v.container_path}${ro}`;
    });

    const envArray: string[] = Object.entries(opts.env ?? {}).map(([k, v]) => `${k}=${v}`);

    const container = await docker.createContainer({
      name: opts.name,
      Image: opts.image,
      Cmd: opts.cmd,
      Env: envArray.length ? envArray : undefined,
      ExposedPorts: Object.keys(exposedPorts).length ? exposedPorts : undefined,
      HostConfig: {
        PortBindings: Object.keys(portBindings).length ? portBindings : undefined,
        Binds: binds.length ? binds : undefined,
        NetworkMode: opts.network,
        AutoRemove: opts.auto_remove ?? false,
      },
    });

    if (opts.start) {
      await container.start();
    }

    const inspect = await container.inspect();
    return { id: (inspect.Id as string).slice(0, 12) };
  },

  async execContainer(
    cfg: DockerConnectionConfig,
    containerId: string,
    cmd: string[],
    workingDir?: string,
    user?: string,
    timeoutMs = 30_000,
  ): Promise<DockerExecResult> {
    const docker = buildDockerClient(cfg);
    const container = docker.getContainer(containerId);

    const execOpts: Record<string, unknown> = {
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    };
    if (workingDir) execOpts.WorkingDir = workingDir;
    if (user) execOpts.User = user;

    const execObj = await container.exec(execOpts as Parameters<typeof container.exec>[0]);
    // hijack: false for non-interactive (non-TTY) exec; hijack: true causes dockerode
    // to treat HTTP 101 as an error when there is no TTY.
    const stream = await execObj.start({ hijack: false, stdin: false });

    const output = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const timer = setTimeout(
        () => reject(new Error(`Exec timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
      (stream as NodeJS.ReadableStream).on("data", (chunk: Buffer) => chunks.push(chunk));
      (stream as NodeJS.ReadableStream).on("end", () => {
        clearTimeout(timer);
        resolve(parseMuxedBufferSplit(Buffer.concat(chunks)));
      });
      (stream as NodeJS.ReadableStream).on("error", (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const info = await execObj.inspect();
    return {
      stdout: output.stdout,
      stderr: output.stderr,
      exit_code: (info as { ExitCode?: number }).ExitCode ?? 0,
    };
  },

  async containerStats(cfg: DockerConnectionConfig, id: string): Promise<DockerContainerStats> {
    const docker = buildDockerClient(cfg);
    const raw = (await docker.getContainer(id).stats({ stream: false }) as unknown) as Record<string, unknown>;

    type CpuUsage = { total_usage: number; percpu_usage?: number[] };
    type CpuStats = { cpu_usage: CpuUsage; system_cpu_usage: number; online_cpus?: number };
    const cpuStats = raw.cpu_stats as CpuStats | undefined;
    const preCpuStats = raw.precpu_stats as { cpu_usage: { total_usage: number }; system_cpu_usage: number } | undefined;

    let cpu_percent = 0;
    if (cpuStats && preCpuStats) {
      const cpuDelta = cpuStats.cpu_usage.total_usage - preCpuStats.cpu_usage.total_usage;
      const sysDelta = cpuStats.system_cpu_usage - preCpuStats.system_cpu_usage;
      const cpuCount = cpuStats.online_cpus ?? cpuStats.cpu_usage.percpu_usage?.length ?? 1;
      if (sysDelta > 0 && cpuDelta > 0) {
        cpu_percent = (cpuDelta / sysDelta) * cpuCount * 100.0;
      }
    }

    const memStats = raw.memory_stats as { usage?: number; limit?: number } | undefined;
    const memory_usage = memStats?.usage ?? 0;
    const memory_limit = memStats?.limit ?? 0;
    const memory_percent = memory_limit > 0 ? (memory_usage / memory_limit) * 100.0 : 0;

    const networks = raw.networks as Record<string, { rx_bytes: number; tx_bytes: number }> | undefined;
    let network_rx = 0;
    let network_tx = 0;
    for (const iface of Object.values(networks ?? {})) {
      network_rx += iface.rx_bytes ?? 0;
      network_tx += iface.tx_bytes ?? 0;
    }

    type BlkioEntry = { op: string; value: number };
    const blkio = raw.blkio_stats as { io_service_bytes_recursive?: BlkioEntry[] } | undefined;
    let block_read = 0;
    let block_write = 0;
    for (const entry of blkio?.io_service_bytes_recursive ?? []) {
      if (entry.op === "Read") block_read += entry.value;
      else if (entry.op === "Write") block_write += entry.value;
    }

    const pids = (raw.pids_stats as { current?: number } | undefined)?.current ?? 0;

    return {
      container_id: id,
      cpu_percent: Math.round(cpu_percent * 100) / 100,
      memory_usage,
      memory_limit,
      memory_percent: Math.round(memory_percent * 100) / 100,
      network_rx,
      network_tx,
      block_read,
      block_write,
      pids,
    };
  },

  // ─── Image actions ────────────────────────────────────────────────────────

  async pullImage(
    cfg: DockerConnectionConfig,
    image: string,
    tag = "latest",
    username?: string,
    password?: string,
  ): Promise<void> {
    const docker = buildDockerClient(cfg);
    const ref = tag ? `${image}:${tag}` : image;
    const authconfig = username ? { username, password: password ?? "" } : undefined;

    await new Promise<void>((resolve, reject) => {
      const opts = authconfig ? { authconfig } : {};
      (docker.pull as Function)(ref, opts, (err: Error | null, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err2: Error | null) => {
          if (err2) return reject(err2);
          resolve();
        });
      });
    });
  },

  async tagImage(
    cfg: DockerConnectionConfig,
    imageId: string,
    repo: string,
    tag: string,
  ): Promise<void> {
    const docker = buildDockerClient(cfg);
    await docker.getImage(imageId).tag({ repo, tag });
  },

  async pruneImages(cfg: DockerConnectionConfig): Promise<DockerPruneResult> {
    const docker = buildDockerClient(cfg);
    const result = await (docker.pruneImages as Function)({}) as {
      ImagesDeleted?: Array<{ Deleted?: string; Untagged?: string }>;
      SpaceReclaimed?: number;
    };
    const removed = (result.ImagesDeleted ?? [])
      .map((d) => d.Deleted ?? d.Untagged ?? "")
      .filter(Boolean);
    return { removed, reclaimed_bytes: result.SpaceReclaimed ?? 0 };
  },

  // ─── Volume actions ───────────────────────────────────────────────────────

  async createVolume(
    cfg: DockerConnectionConfig,
    name: string,
    driver = "local",
    driverOpts: Record<string, string> = {},
  ): Promise<{ name: string }> {
    const docker = buildDockerClient(cfg);
    const vol = await docker.createVolume({
      Name: name,
      Driver: driver,
      DriverOpts: driverOpts,
    }) as unknown as { Name: string };
    return { name: vol.Name };
  },

  async pruneVolumes(cfg: DockerConnectionConfig): Promise<DockerPruneResult> {
    const docker = buildDockerClient(cfg);
    const result = await (docker.pruneVolumes as Function)({}) as {
      VolumesDeleted?: string[];
      SpaceReclaimed?: number;
    };
    return {
      removed: result.VolumesDeleted ?? [],
      reclaimed_bytes: result.SpaceReclaimed ?? 0,
    };
  },

  // ─── Network actions ──────────────────────────────────────────────────────

  async createNetwork(
    cfg: DockerConnectionConfig,
    name: string,
    driver = "bridge",
    subnet?: string,
    gateway?: string,
    internal = false,
  ): Promise<{ id: string }> {
    const docker = buildDockerClient(cfg);
    const ipam = subnet
      ? { Config: [{ Subnet: subnet, ...(gateway ? { Gateway: gateway } : {}) }] }
      : undefined;
    const net = await docker.createNetwork({
      Name: name,
      Driver: driver,
      Internal: internal,
      ...(ipam ? { IPAM: ipam } : {}),
    });
    return { id: net.id };
  },

  async removeNetwork(cfg: DockerConnectionConfig, networkId: string): Promise<void> {
    const docker = buildDockerClient(cfg);
    await docker.getNetwork(networkId).remove();
  },

  async pruneNetworks(cfg: DockerConnectionConfig): Promise<DockerPruneResult> {
    const docker = buildDockerClient(cfg);
    const result = await (docker.pruneNetworks as Function)({}) as {
      NetworksDeleted?: string[];
    };
    return {
      removed: result.NetworksDeleted ?? [],
      reclaimed_bytes: 0,
    };
  },
};
