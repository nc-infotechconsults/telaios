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
};
