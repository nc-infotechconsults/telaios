/**
 * Docker client module.
 *
 * Wraps Dockerode to list containers, images, networks, and volumes
 * for a remote Docker host described by an environment connection_config.
 */

export interface DockerConnectionConfig {
  type: "docker";
  host?: string;
  tls_cert?: string;
  tls_key?: string;
  tls_ca?: string;
}

export interface DockerContainerSummary {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  ports: string[];
}

function buildDockerClient(cfg: DockerConnectionConfig): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Docker = require("dockerode") as typeof import("dockerode");

  if (!cfg.host) {
    return new Docker();
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

function formatPorts(ports: Array<{ PublicPort?: number; PrivatePort?: number; Type?: string }>): string[] {
  return (ports ?? []).map((p) =>
    p.PublicPort ? `${p.PublicPort}:${p.PrivatePort}/${p.Type}` : `${p.PrivatePort}/${p.Type}`,
  );
}

export const DockerClient = {
  async listContainers(cfg: DockerConnectionConfig): Promise<DockerContainerSummary[]> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const docker = buildDockerClient(cfg) as import("dockerode");
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const docker = buildDockerClient(cfg) as import("dockerode");
    const container = docker.getContainer(id);
    return container.inspect();
  },

  async getContainerLogs(cfg: DockerConnectionConfig, id: string, tail = 200): Promise<string> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const docker = buildDockerClient(cfg) as import("dockerode");
    const container = docker.getContainer(id);
    const stream = await container.logs({ stdout: true, stderr: true, tail });
    // dockerode returns a Buffer for non-multiplexed streams
    return (stream as unknown as Buffer).toString("utf8");
  },

  async listImages(cfg: DockerConnectionConfig): Promise<unknown[]> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const docker = buildDockerClient(cfg) as import("dockerode");
    return docker.listImages({ all: false });
  },

  async listNetworks(cfg: DockerConnectionConfig): Promise<unknown[]> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const docker = buildDockerClient(cfg) as import("dockerode");
    return docker.listNetworks();
  },

  async listVolumes(cfg: DockerConnectionConfig): Promise<unknown[]> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const docker = buildDockerClient(cfg) as import("dockerode");
    const r = await docker.listVolumes();
    return r.Volumes ?? [];
  },

  async testConnection(cfg: DockerConnectionConfig): Promise<{ ok: boolean; version?: string }> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const docker = buildDockerClient(cfg) as import("dockerode");
      const info = await docker.version();
      return { ok: true, version: (info as { Version?: string }).Version };
    } catch {
      return { ok: false };
    }
  },
};
