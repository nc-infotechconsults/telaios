/**
 * Kubernetes client module.
 *
 * Loads kubeconfig from an encrypted environment connection_config, then
 * wraps common resource operations used by the environment routes.
 *
 * The @kubernetes/client-node package must be installed in data-api.
 * We import it lazily so that the service still boots without it (useful in
 * local dev without a cluster).
 */

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

function buildKubeConfig(cfg: K8sConnectionConfig): unknown {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const k8s = require("@kubernetes/client-node") as typeof import("@kubernetes/client-node");
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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const k8s = require("@kubernetes/client-node") as typeof import("@kubernetes/client-node");
    const kc = buildKubeConfig(cfg) as InstanceType<typeof k8s.KubeConfig>;
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);
    const networkApi = kc.makeApiClient(k8s.NetworkingV1Api);
    const batchApi = kc.makeApiClient(k8s.BatchV1Api);

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const k8s = require("@kubernetes/client-node") as typeof import("@kubernetes/client-node");
    const kc = buildKubeConfig(cfg) as InstanceType<typeof k8s.KubeConfig>;
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const appsApi = kc.makeApiClient(k8s.AppsV1Api);

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const k8s = require("@kubernetes/client-node") as typeof import("@kubernetes/client-node");
    const kc = buildKubeConfig(cfg) as InstanceType<typeof k8s.KubeConfig>;
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const result = await coreApi.readNamespacedPodLog({
      name: podName,
      namespace,
      container,
      tailLines,
    });
    return result as unknown as string;
  },

  async listNamespaces(cfg: K8sConnectionConfig): Promise<string[]> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const k8s = require("@kubernetes/client-node") as typeof import("@kubernetes/client-node");
    const kc = buildKubeConfig(cfg) as InstanceType<typeof k8s.KubeConfig>;
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const result = await coreApi.listNamespace();
    return (result.items ?? []).map((n) => n.metadata?.name ?? "").filter(Boolean);
  },
};
