import { useEffect, useState } from "react";
import {
  Button,
  Chip,
  Select,
  SelectItem,
  Spinner,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
} from "@heroui/react";
import { listEnvironmentResources } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { K8sResource } from "../../types";
import PodLogViewer from "./PodLogViewer";

interface Props {
  environmentId: string;
  defaultNamespace?: string;
  environmentType: "kubernetes" | "docker";
  onSelectResource?: (resource: K8sResource) => void;
  selectedResourceName?: string;
}

const K8S_KINDS = ["pods", "services", "deployments", "configmaps", "secrets", "ingresses", "statefulsets", "daemonsets", "jobs", "cronjobs"];

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

export default function ResourceBrowser({
  environmentId,
  defaultNamespace,
  environmentType,
  onSelectResource,
  selectedResourceName,
}: Props) {
  const [kind, setKind] = useState("pods");
  const [namespace, setNamespace] = useState(defaultNamespace ?? "default");
  const [resources, setResources] = useState<K8sResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [logPod, setLogPod] = useState<string | null>(null);

  async function loadResources() {
    setLoading(true);
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

      {/* Resource table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" label="Loading resources…" />
        </div>
      ) : resources.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
          <p className="text-sm">No {kind} found{environmentType === "kubernetes" ? ` in namespace "${namespace}"` : ""}</p>
        </div>
      ) : (
        <Table aria-label={`${kind} resources`} removeWrapper>
          <TableHeader>
            <TableColumn>NAME</TableColumn>
            <TableColumn>NAMESPACE</TableColumn>
            <TableColumn>STATUS</TableColumn>
            <TableColumn>AGE</TableColumn>
            <TableColumn>{""}</TableColumn>
          </TableHeader>
          <TableBody>
            {resources.map((res) => (
              <TableRow
                key={`${res.kind}-${res.namespace}-${res.name}`}
                className={`cursor-pointer transition-colors ${
                  selectedResourceName === res.name
                    ? "bg-primary/5"
                    : "hover:bg-default-50"
                }`}
                onClick={() => onSelectResource?.(res)}
              >
                <TableCell>
                  <p className="font-medium text-sm truncate max-w-xs">{res.name}</p>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-default-400">{res.namespace ?? "-"}</span>
                </TableCell>
                <TableCell>
                  <Chip size="sm" variant="flat" color={STATUS_COLOR[res.status] ?? "default"}>
                    {res.status}
                  </Chip>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-default-400">{res.age}</span>
                </TableCell>
                <TableCell>
                  {kind === "pods" && (
                    <Tooltip content="View logs">
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => setLogPod(res.name)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Logs
                      </Button>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
