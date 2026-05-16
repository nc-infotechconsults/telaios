import { useEffect, useState, useCallback } from "react";
import {
  Button,
  Chip,
  Spinner,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
} from "../ui";
import { listEnvironmentResources } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { K8sResource } from "../../types";
import PodLogViewer from "./PodLogViewer";

// ── Constants ─────────────────────────────────────────────────────────────────

export const STATUS_COLOR: Record<string, "success" | "warning" | "danger" | "default"> = {
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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  environmentId: string;
  namespace: string;
  kind: string;
  refreshSignal?: number;
  onSelectResource?: (resource: K8sResource) => void;
  selectedResourceName?: string;
  onClickFiles?: (resource: K8sResource) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function K8sResourceList({
  environmentId,
  namespace,
  kind,
  refreshSignal,
  onSelectResource,
  selectedResourceName,
  onClickFiles,
}: Props) {
  const [resources, setResources] = useState<K8sResource[]>([]);
  const [loading, setLoading] = useState(false);
  const [logPod, setLogPod] = useState<string | null>(null);

  const loadResources = useCallback(async () => {
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
  }, [environmentId, kind, namespace]);

  useEffect(() => {
    loadResources();
  }, [loadResources, refreshSignal]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" label="Loading resources…" />
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
        <p className="text-sm">
          No {kind} found in namespace &quot;{namespace}&quot;
        </p>
      </div>
    );
  }

  return (
    <>
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
                <div className="flex items-center gap-1">
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
                  {kind === "persistentvolumeclaims" && onClickFiles && (
                    <Tooltip content="Browse files">
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => onClickFiles(res)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        Files
                      </Button>
                    </Tooltip>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {logPod && (
        <PodLogViewer
          isOpen={!!logPod}
          onOpenChange={() => setLogPod(null)}
          environmentId={environmentId}
          podName={logPod}
          namespace={namespace}
        />
      )}
    </>
  );
}
