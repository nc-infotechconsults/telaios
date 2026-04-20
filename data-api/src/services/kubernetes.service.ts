/**
 * Kubernetes client module.
 *
 * Loads kubeconfig from an encrypted environment connection_config, then
 * wraps common resource operations used by the environment routes.
 *
 * The @kubernetes/client-node package must be installed in data-api.
 */
import fs from "node:fs";
import { PassThrough } from "node:stream";
import { randomUUID } from "node:crypto";
import * as k8s from "@kubernetes/client-node";

/** Max file size for PVC content read (1 MB). */
const MAX_FILE_CONTENT_SIZE = 1024 * 1024;

export interface K8sPVCFileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  path: string;
}

export type K8sResourceKind =
  | "pods"
  | "services"
  | "deployments"
  | "configmaps"
  | "secrets"
  | "ingresses"
  | "persistentvolumeclaims"
  | "namespaces"
  | "replicasets"
  | "statefulsets"
  | "daemonsets"
  | "jobs"
  | "cronjobs";

export interface K8sResourceSummary {
  name: string;
  namespace: string;
  kind: string;
  status: string;
  age: string;
  labels: Record<string, string>;
}

export interface K8sConnectionConfig {
  type: "kubernetes";
  kubeconfig?: string;
  cluster_url?: string;
  token?: string;
  ca_cert?: string;
  context_name?: string;
}

function buildKubeConfig(cfg: K8sConnectionConfig): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();

  if (cfg.kubeconfig) {
    kc.loadFromString(cfg.kubeconfig);
    if (cfg.context_name) kc.setCurrentContext(cfg.context_name);
  } else if (cfg.cluster_url && cfg.token) {
    kc.loadFromOptions({
      clusters: [{ name: "cluster", server: cfg.cluster_url, caData: cfg.ca_cert ?? "" }],
      users: [{ name: "user", token: cfg.token }],
      contexts: [{ name: "ctx", cluster: "cluster", user: "user" }],
      currentContext: "ctx",
    });
  } else {
    kc.loadFromDefault();
  }
  return kc;
}

/**
 * Resolves TLS settings from the currently active cluster and user in the
 * kubeconfig, reading file-based certs if necessary.
 */
function resolveTLSOpts(kc: k8s.KubeConfig): {
  rejectUnauthorized?: boolean;
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
} {
  const cluster = kc.getCurrentCluster();
  const user = kc.getCurrentUser();
  const opts: { rejectUnauthorized?: boolean; ca?: Buffer; cert?: Buffer; key?: Buffer } = {};

  if (cluster?.skipTLSVerify) opts.rejectUnauthorized = false;

  if (cluster?.caData) {
    opts.ca = Buffer.from(cluster.caData, "base64");
  } else if (cluster?.caFile) {
    try { opts.ca = fs.readFileSync(cluster.caFile); } catch { /* file unreadable */ }
  }

  if (user?.certData) {
    opts.cert = Buffer.from(user.certData, "base64");
  } else if (user?.certFile) {
    try { opts.cert = fs.readFileSync(user.certFile); } catch { /* file unreadable */ }
  }

  if (user?.keyData) {
    opts.key = Buffer.from(user.keyData, "base64");
  } else if (user?.keyFile) {
    try { opts.key = fs.readFileSync(user.keyFile); } catch { /* file unreadable */ }
  }

  return opts;
}

/**
 * @kubernetes/client-node uses `node-fetch` internally, passing TLS settings
 * via an `https.Agent`. Bun intercepts the `node-fetch` import and replaces it
 * with its own built-in fetch, which ignores the `agent` option entirely.
 *
 * This library uses bun's native fetch with its `tls` option instead, so TLS
 * configuration (custom CA certs, insecure-skip-tls-verify, client certs) is
 * correctly applied.
 */
class BunFetchHttpLibrary implements k8s.PromiseHttpLibrary {
  constructor(private readonly tls: { rejectUnauthorized?: boolean; ca?: Buffer; cert?: Buffer; key?: Buffer }) {}

  async send(request: k8s.RequestContext): Promise<k8s.ResponseContext> {
    const init: RequestInit & { tls?: typeof this.tls } = {
      method: request.getHttpMethod().toString(),
      body: request.getBody() as BodyInit,
      headers: request.getHeaders() as HeadersInit,
      signal: request.getSignal(),
    };

    if (Object.values(this.tls).some((v) => v !== undefined)) {
      init.tls = this.tls;
    }

    const resp = await fetch(request.getUrl(), init);
    const headers: Record<string, string> = {};
    resp.headers.forEach((value, name) => { headers[name] = value; });

    return new k8s.ResponseContext(resp.status, headers, {
      text: () => resp.text(),
      binary: () => resp.arrayBuffer().then((b) => Buffer.from(b)),
    });
  }
}

/**
 * Creates an API client and replaces its internal http library with
 * `BunFetchHttpLibrary` so that TLS settings from the kubeconfig are honoured
 * when the service runs under bun.
 */
function makeApiClient<T extends k8s.ApiType>(kc: k8s.KubeConfig, ApiClass: k8s.ApiConstructor<T>): T {
  const client = kc.makeApiClient(ApiClass);
  const tlsOpts = resolveTLSOpts(kc);

  if (Object.values(tlsOpts).some((v) => v !== undefined)) {
    const lib = k8s.wrapHttpLibrary(new BunFetchHttpLibrary(tlsOpts));
    // ObjectXxxApi wraps ObservableXxxApi (.api) which holds .configuration
    const inner = (client as unknown as { api?: { configuration?: { httpApi?: unknown } } }).api;
    if (inner?.configuration) inner.configuration.httpApi = lib;
  }

  return client;
}


function statusFromPod(pod: Record<string, unknown>): string {
  const status = (pod as { status?: { phase?: string } }).status;
  return status?.phase ?? "Unknown";
}

function ageFromTimestamp(ts?: string): string {
  if (!ts) return "—";
  const diff = Date.now() - new Date(ts).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/**
 * Parse `ls -la` output into K8sPVCFileEntry[].
 * Skips "." and ".." entries. Caps result at 500 items.
 */
function parseLsLaK8sOutput(raw: string, dirPath: string): K8sPVCFileEntry[] {
  const entries: K8sPVCFileEntry[] = [];

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("total ")) continue;

    const match = trimmed.match(
      /^([d\-lcrwxst]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\S+\s+\S+\s+\S+)\s+(.+)$/,
    );
    if (!match) continue;

    const [, perms, sizeStr, dateStr, namePart] = match;
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

export const KubernetesClient = {
  async listResources(
    cfg: K8sConnectionConfig,
    namespace: string,
    kind: K8sResourceKind,
  ): Promise<K8sResourceSummary[]> {
    const kc = buildKubeConfig(cfg);
    const coreApi = makeApiClient(kc, k8s.CoreV1Api);
    const appsApi = makeApiClient(kc, k8s.AppsV1Api);
    const networkApi = makeApiClient(kc, k8s.NetworkingV1Api);
    const batchApi = makeApiClient(kc, k8s.BatchV1Api);

    type AnyObj = { metadata?: { name?: string; namespace?: string; creationTimestamp?: string; labels?: Record<string, string> }; status?: unknown };
    let items: AnyObj[] = [];

    try {
      switch (kind) {
        case "pods": {
          const r = await (namespace === "all"
            ? coreApi.listPodForAllNamespaces()
            : coreApi.listNamespacedPod({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "services": {
          const r = await (namespace === "all"
            ? coreApi.listServiceForAllNamespaces()
            : coreApi.listNamespacedService({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "configmaps": {
          const r = await (namespace === "all"
            ? coreApi.listConfigMapForAllNamespaces()
            : coreApi.listNamespacedConfigMap({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "secrets": {
          const r = await (namespace === "all"
            ? coreApi.listSecretForAllNamespaces()
            : coreApi.listNamespacedSecret({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "persistentvolumeclaims": {
          const r = await (namespace === "all"
            ? coreApi.listPersistentVolumeClaimForAllNamespaces()
            : coreApi.listNamespacedPersistentVolumeClaim({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "namespaces": {
          const r = await coreApi.listNamespace();
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "deployments": {
          const r = await (namespace === "all"
            ? appsApi.listDeploymentForAllNamespaces()
            : appsApi.listNamespacedDeployment({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "replicasets": {
          const r = await (namespace === "all"
            ? appsApi.listReplicaSetForAllNamespaces()
            : appsApi.listNamespacedReplicaSet({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "statefulsets": {
          const r = await (namespace === "all"
            ? appsApi.listStatefulSetForAllNamespaces()
            : appsApi.listNamespacedStatefulSet({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "daemonsets": {
          const r = await (namespace === "all"
            ? appsApi.listDaemonSetForAllNamespaces()
            : appsApi.listNamespacedDaemonSet({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "ingresses": {
          const r = await (namespace === "all"
            ? networkApi.listIngressForAllNamespaces()
            : networkApi.listNamespacedIngress({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "jobs": {
          const r = await (namespace === "all"
            ? batchApi.listJobForAllNamespaces()
            : batchApi.listNamespacedJob({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
        case "cronjobs": {
          const r = await (namespace === "all"
            ? batchApi.listCronJobForAllNamespaces()
            : batchApi.listNamespacedCronJob({ namespace }));
          items = (r.items as AnyObj[]) ?? [];
          break;
        }
      }
    } catch {
      return [];
    }

    return items.map((item) => {
      const meta = item.metadata ?? {};
      return {
        name: meta.name ?? "unknown",
        namespace: meta.namespace ?? namespace,
        kind,
        status: kind === "pods" ? statusFromPod(item as Record<string, unknown>) : "—",
        age: ageFromTimestamp(meta.creationTimestamp ?? undefined),
        labels: meta.labels ?? {},
      };
    });
  },

  async getResource(
    cfg: K8sConnectionConfig,
    namespace: string,
    kind: K8sResourceKind,
    name: string,
  ): Promise<unknown> {
    const kc = buildKubeConfig(cfg);
    const coreApi = makeApiClient(kc, k8s.CoreV1Api);
    const appsApi = makeApiClient(kc, k8s.AppsV1Api);

    switch (kind) {
      case "pods": return (await coreApi.readNamespacedPod({ name, namespace }));
      case "services": return (await coreApi.readNamespacedService({ name, namespace }));
      case "configmaps": return (await coreApi.readNamespacedConfigMap({ name, namespace }));
      case "secrets": return (await coreApi.readNamespacedSecret({ name, namespace }));
      case "deployments": return (await appsApi.readNamespacedDeployment({ name, namespace }));
      default: return null;
    }
  },

  async getPodLogs(
    cfg: K8sConnectionConfig,
    namespace: string,
    podName: string,
    container?: string,
    tailLines = 200,
  ): Promise<string> {
    const kc = buildKubeConfig(cfg);
    const coreApi = makeApiClient(kc, k8s.CoreV1Api);
    const result = await coreApi.readNamespacedPodLog({
      name: podName,
      namespace,
      container,
      tailLines,
    });
    return result as unknown as string;
  },

  async listNamespaces(cfg: K8sConnectionConfig): Promise<string[]> {
    const kc = buildKubeConfig(cfg);
    const coreApi = makeApiClient(kc, k8s.CoreV1Api);
    const result = await coreApi.listNamespace();
    return (result.items ?? []).map((n) => n.metadata?.name ?? "").filter(Boolean);
  },

  // ─── PVC file browser ────────────────────────────────────────────────────────

  async getPVCAccessModes(
    cfg: K8sConnectionConfig,
    namespace: string,
    pvcName: string,
  ): Promise<string[]> {
    const kc = buildKubeConfig(cfg);
    const coreApi = makeApiClient(kc, k8s.CoreV1Api);
    const pvc = await coreApi.readNamespacedPersistentVolumeClaim({ name: pvcName, namespace });
    return (pvc.spec?.accessModes ?? []) as string[];
  },

  async getPodsUsingPVC(
    cfg: K8sConnectionConfig,
    namespace: string,
    pvcName: string,
  ): Promise<string[]> {
    const kc = buildKubeConfig(cfg);
    const coreApi = makeApiClient(kc, k8s.CoreV1Api);
    const result = await coreApi.listNamespacedPod({ namespace });
    const pods = result.items ?? [];
    return pods
      .filter((pod) => {
        const phase = (pod.status as { phase?: string } | undefined)?.phase;
        if (phase !== "Running") return false;
        const volumes = (pod.spec?.volumes ?? []) as Array<{ persistentVolumeClaim?: { claimName?: string } }>;
        return volumes.some((v) => v.persistentVolumeClaim?.claimName === pvcName);
      })
      .map((pod) => pod.metadata?.name ?? "")
      .filter(Boolean);
  },

  async execInTempPod(
    cfg: K8sConnectionConfig,
    namespace: string,
    pvcName: string,
    command: string[],
  ): Promise<string> {
    const kc = buildKubeConfig(cfg);
    const coreApi = makeApiClient(kc, k8s.CoreV1Api);
    const podName = `pvc-browser-${randomUUID()}`;

    await coreApi.createNamespacedPod({
      namespace,
      body: {
        metadata: { name: podName, namespace },
        spec: {
          restartPolicy: "Never",
          containers: [{
            name: "browser",
            image: "busybox:latest",
            command: ["sh", "-c", "sleep 60"],
            volumeMounts: [{ name: "data", mountPath: "/data" }],
          }],
          volumes: [{ name: "data", persistentVolumeClaim: { claimName: pvcName } }],
        },
      },
    });

    try {
      // Poll until Running (30 s timeout)
      const deadline = Date.now() + 30_000;
      for (;;) {
        const pod = await coreApi.readNamespacedPod({ name: podName, namespace });
        const phase = (pod.status as { phase?: string } | undefined)?.phase;
        if (phase === "Running") break;
        if (phase === "Failed" || phase === "Succeeded") {
          throw new Error(`Pod ${podName} entered phase ${phase} before Running`);
        }
        if (Date.now() > deadline) {
          throw new Error(`Timed out waiting for pod ${podName} to be Running`);
        }
        await new Promise<void>((r) => setTimeout(r, 500));
      }

      // Execute command and collect stdout
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      stdout.on("data", (c: Buffer) => stdoutChunks.push(c));
      stderr.on("data", (c: Buffer) => stderrChunks.push(c));

      const output = await new Promise<string>((resolve, reject) => {
        const exec = new k8s.Exec(kc);
        exec
          .exec(namespace, podName, "browser", command, stdout, stderr, null, false, (status: k8s.V1Status) => {
            if (status.status === "Success") {
              resolve(Buffer.concat(stdoutChunks).toString("utf8"));
            } else {
              const errMsg = Buffer.concat(stderrChunks).toString("utf8");
              reject(new Error(`Command failed: ${status.message ?? errMsg}`));
            }
          })
          .catch(reject);
      });

      return output;
    } finally {
      try {
        await coreApi.deleteNamespacedPod({ name: podName, namespace, gracePeriodSeconds: 0 });
      } catch { /* ignore */ }
    }
  },

  async listPVCFiles(
    cfg: K8sConnectionConfig,
    namespace: string,
    pvcName: string,
    dirPath: string,
  ): Promise<K8sPVCFileEntry[]> {
    const raw = await this.execInTempPod(cfg, namespace, pvcName, ["sh", "-c", `ls -la /data${dirPath}`]);
    return parseLsLaK8sOutput(raw, dirPath);
  },

  async getPVCFileContent(
    cfg: K8sConnectionConfig,
    namespace: string,
    pvcName: string,
    filePath: string,
  ): Promise<{ content: string; encoding: "text" | "binary"; size: number }> {
    // Step 1: check file size
    const sizeOut = await this.execInTempPod(cfg, namespace, pvcName, ["sh", "-c", `wc -c < /data${filePath}`]);
    const size = parseInt(sizeOut.trim(), 10) || 0;

    if (size > MAX_FILE_CONTENT_SIZE) {
      const err = new Error(`File too large to read (${size} bytes); max is ${MAX_FILE_CONTENT_SIZE}`) as Error & { code: string };
      err.code = "FILE_TOO_LARGE";
      throw err;
    }

    // Step 2: read content via base64
    const b64Out = await this.execInTempPod(cfg, namespace, pvcName, ["base64", `/data${filePath}`]);
    const contentBuf = Buffer.from(b64Out.replace(/\s/g, ""), "base64");

    // Detect binary by scanning for null bytes in the first 8 KB
    let encoding: "text" | "binary" = "text";
    for (let i = 0; i < Math.min(contentBuf.length, 8192); i++) {
      if (contentBuf[i] === 0) { encoding = "binary"; break; }
    }

    const content = encoding === "binary"
      ? contentBuf.toString("base64")
      : contentBuf.toString("utf8");

    return { content, encoding, size: contentBuf.length };
  },

  async updatePVCFileContent(
    cfg: K8sConnectionConfig,
    namespace: string,
    pvcName: string,
    filePath: string,
    content: string,
  ): Promise<void> {
    const b64 = Buffer.from(content, "utf8").toString("base64");
    await this.execInTempPod(cfg, namespace, pvcName, ["sh", "-c", `echo '${b64}' | base64 -d > /data${filePath}`]);
  },

  async downloadPVCFile(
    cfg: K8sConnectionConfig,
    namespace: string,
    pvcName: string,
    filePath: string,
  ): Promise<{ stream: PassThrough; fileName: string }> {
    const kc = buildKubeConfig(cfg);
    const coreApi = makeApiClient(kc, k8s.CoreV1Api);
    const podName = `pvc-browser-${randomUUID()}`;
    const fileName = filePath.split("/").filter(Boolean).pop() ?? "download";

    await coreApi.createNamespacedPod({
      namespace,
      body: {
        metadata: { name: podName, namespace },
        spec: {
          restartPolicy: "Never",
          containers: [{
            name: "browser",
            image: "busybox:latest",
            command: ["sh", "-c", "sleep 60"],
            volumeMounts: [{ name: "data", mountPath: "/data" }],
          }],
          volumes: [{ name: "data", persistentVolumeClaim: { claimName: pvcName } }],
        },
      },
    });

    const cleanup = async () => {
      try {
        await coreApi.deleteNamespacedPod({ name: podName, namespace, gracePeriodSeconds: 0 });
      } catch { /* ignore */ }
    };

    try {
      // Poll until Running (30 s timeout)
      const deadline = Date.now() + 30_000;
      for (;;) {
        const pod = await coreApi.readNamespacedPod({ name: podName, namespace });
        const phase = (pod.status as { phase?: string } | undefined)?.phase;
        if (phase === "Running") break;
        if (phase === "Failed" || phase === "Succeeded") {
          await cleanup();
          throw new Error(`Pod ${podName} entered phase ${phase} before Running`);
        }
        if (Date.now() > deadline) {
          await cleanup();
          throw new Error(`Timed out waiting for pod ${podName} to be Running`);
        }
        await new Promise<void>((r) => setTimeout(r, 500));
      }

      const outStream = new PassThrough();

      // Cleanup pod when the stream finishes or errors
      outStream.once("end", cleanup);
      outStream.once("error", cleanup);

      const exec = new k8s.Exec(kc);
      exec
        .exec(namespace, podName, "browser", ["cat", `/data${filePath}`], outStream, null, null, false, () => {
          outStream.end();
        })
        .catch((err) => outStream.destroy(err instanceof Error ? err : new Error(String(err))));

      return { stream: outStream, fileName };
    } catch (err) {
      await cleanup();
      throw err;
    }
  },
};
