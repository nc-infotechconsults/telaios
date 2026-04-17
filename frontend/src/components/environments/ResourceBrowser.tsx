import { useEffect, useState } from "react";
import {
  Button,
  Chip,
  Select,
  SelectItem,
  Spinner,
  Tooltip,
} from "@heroui/react";
import { listEnvironmentResources, getEnvironmentResource } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { K8sResource } from "../../types";
import PodLogViewer from "./PodLogViewer";

interface Props {
  environmentId: string;
  defaultNamespace?: string;
  environmentType: "kubernetes" | "docker";
}

const K8S_KINDS = ["pods", "services", "deployments", "configmaps", "secrets", "ingresses", "statefulsets", "daemonsets", "jobs", "cronjobs"];

export default function ResourceBrowser({ environmentId, defaultNamespace, environmentType }: Props) {
  const [kind, setKind] = useState("pods");
  const [namespace, setNamespace] = useState(defaultNamespace ?? "default");
  const [resources, setResources] = useState<K8sResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedResource, setSelectedResource] = useState<K8sResource | null>(null);
  const [detail, setDetail] = useState<unknown>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [logPod, setLogPod] = useState<string | null>(null);

  async function loadResources() {
    setLoading(true);
    setSelectedResource(null);
    setDetail(null);
    try {
      const data = await listEnvironmentResources(environmentId, kind, namespace);
      setResources(data);
    } catch {
      toast.error("Failed to load resources");
      setResources([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [environmentId, kind, namespace]);

  async function handleResourceClick(res: K8sResource) {
    setSelectedResource(res);
    setDetailLoading(true);
    try {
      const data = await getEnvironmentResource(environmentId, res.kind, res.name, res.namespace);
      setDetail(data);
    } catch {
      toast.error("Failed to load resource detail");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const STATUS_COLOR: Record<string, "success" | "warning" | "danger" | "default"> = {
    Running: "success",
    Active: "success",
    Succeeded: "success",
    Ready: "success",
    Bound: "success",
    Pending: "warning",
    ContainerCreating: "warning",
    Failed: "danger",
    CrashLoopBackOff: "danger",
    Error: "danger",
    Unknown: "default",
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        {environmentType === "kubernetes" && (
          <>
            <Select
              label="Resource kind"
              size="sm"
              selectedKeys={[kind]}
              disallowEmptySelection
              onSelectionChange={(keys) => {
                const next = [...keys][0] as string | undefined;
                if (next) setKind(next);
              }}
              className="w-44"
            >
              {K8S_KINDS.map((k) => (
                <SelectItem key={k}>{k}</SelectItem>
              ))}
            </Select>
            <Select
              label="Namespace"
              size="sm"
              selectedKeys={[namespace]}
              disallowEmptySelection
              onSelectionChange={(keys) => {
                const next = [...keys][0] as string | undefined;
                if (next) setNamespace(next);
              }}
              className="w-36"
              allowsCustomValue
            >
              {[defaultNamespace ?? "default", "kube-system", "kube-public"].filter(Boolean).map((ns) => (
                <SelectItem key={ns!}>{ns}</SelectItem>
              ))}
            </Select>
          </>
        )}
        <Button size="sm" variant="flat" onPress={loadResources} isLoading={loading}>
          Refresh
        </Button>
      </div>

      {/* Resource list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" label="Loading resources…" />
        </div>
      ) : resources.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
          <p className="text-sm">No {kind} found in namespace "{namespace}"</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {resources.map((res) => (
            <div
              key={`${res.kind}-${res.namespace}-${res.name}`}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                selectedResource?.name === res.name && selectedResource?.kind === res.kind
                  ? "border-primary/50 bg-primary/5"
                  : "border-divider hover:border-default-300"
              }`}
              onClick={() => handleResourceClick(res)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{res.name}</p>
                <p className="text-xs text-default-400">
                  {res.kind} · {res.namespace} · {res.age}
                </p>
              </div>
              <Chip
                size="sm"
                variant="flat"
                color={STATUS_COLOR[res.status] ?? "default"}
              >
                {res.status}
              </Chip>
              {kind === "pods" && (
                <Tooltip content="View logs">
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={(e) => {
                      setLogPod(res.name);
                    }}
                  >
                    Logs
                  </Button>
                </Tooltip>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Resource detail panel */}
      {selectedResource && (
        <div className="border border-divider rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium">
              {selectedResource.kind}/{selectedResource.name}
            </p>
            <Button size="sm" variant="light" onPress={() => { setSelectedResource(null); setDetail(null); }}>
              Close
            </Button>
          </div>
          {detailLoading ? (
            <Spinner size="sm" label="Loading…" />
          ) : detail ? (
            <pre className="text-xs bg-default-50 rounded-lg p-3 overflow-auto max-h-80 whitespace-pre-wrap break-all">
              {JSON.stringify(detail, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-default-400">No details available</p>
          )}
        </div>
      )}

      {/* Pod log viewer */}
      {logPod && (
        <PodLogViewer
          isOpen={!!logPod}
          onOpenChange={() => setLogPod(null)}
          environmentId={environmentId}
          podName={logPod}
          namespace={namespace}
        />
      )}
    </div>
  );
}
