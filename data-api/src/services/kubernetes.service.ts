/**
 * Kubernetes client module.
 *
 * Loads kubeconfig from an encrypted environment connection_config, then
 * wraps common resource operations used by the environment routes.
 *
 * The @kubernetes/client-node package must be installed in data-api.
 */
import fs from "node:fs";
import * as k8s from "@kubernetes/client-node";

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
};
