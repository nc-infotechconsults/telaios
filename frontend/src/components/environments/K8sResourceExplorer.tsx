import { useState } from "react";
import { Button, Select, SelectItem } from "@heroui/react";
import type { K8sResource } from "../../types";
import K8sResourceList from "./K8sResourceList";
import K8sPVCFileBrowserModal from "./K8sPVCFileBrowserModal";

// ── Menu structure ────────────────────────────────────────────────────────────

interface MenuGroup {
  label: string;
  items: { kind: string; label: string }[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    label: "Compute",
    items: [{ kind: "pods", label: "Pods" }],
  },
  {
    label: "Workloads",
    items: [
      { kind: "deployments", label: "Deployments" },
      { kind: "statefulsets", label: "StatefulSets" },
      { kind: "daemonsets", label: "DaemonSets" },
      { kind: "jobs", label: "Jobs" },
      { kind: "cronjobs", label: "CronJobs" },
    ],
  },
  {
    label: "Networking",
    items: [
      { kind: "services", label: "Services" },
      { kind: "ingresses", label: "Ingresses" },
    ],
  },
  {
    label: "Storage",
    items: [{ kind: "persistentvolumeclaims", label: "PVCs" }],
  },
  {
    label: "Config",
    items: [
      { kind: "configmaps", label: "ConfigMaps" },
      { kind: "secrets", label: "Secrets" },
    ],
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  environmentId: string;
  defaultNamespace?: string;
  onSelectResource?: (resource: K8sResource) => void;
  selectedResourceName?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function K8sResourceExplorer({
  environmentId,
  defaultNamespace,
  onSelectResource,
  selectedResourceName,
}: Props) {
  // Deduplicated namespace list
  const namespaces = [...new Set(
    [defaultNamespace, "default", "kube-system", "kube-public"].filter(Boolean) as string[],
  )];

  const [namespace, setNamespace] = useState(namespaces[0]);
  const [selectedKind, setSelectedKind] = useState("pods");
  const [refreshSignal, setRefreshSignal] = useState(0);

  // PVC file browser modal state
  const [pvcBrowserOpen, setPvcBrowserOpen] = useState(false);
  const [pvcBrowserResource, setPvcBrowserResource] = useState<K8sResource | null>(null);

  const handleClickFiles = (resource: K8sResource) => {
    setPvcBrowserResource(resource);
    setPvcBrowserOpen(true);
  };

  return (
    <div className="flex h-full">
      {/* ── Left nav ──────────────────────────────────────────────────────── */}
      <div className="w-[220px] flex-shrink-0 border-r border-divider flex flex-col overflow-y-auto">
        {/* Namespace + refresh controls */}
        <div className="px-3 py-3 border-b border-divider flex flex-col gap-2">
          <Select
            aria-label="Namespace"
            size="sm"
            selectedKeys={[namespace]}
            disallowEmptySelection
            onSelectionChange={(keys) => {
              const next = [...keys][0] as string | undefined;
              if (next) setNamespace(next);
            }}
          >
            {namespaces.map((ns) => (
              <SelectItem key={ns}>{ns}</SelectItem>
            ))}
          </Select>
          <Button
            size="sm"
            variant="flat"
            className="w-full"
            onPress={() => setRefreshSignal((n) => n + 1)}
          >
            Refresh
          </Button>
        </div>

        {/* Menu groups */}
        <nav className="flex flex-col py-2">
          {MENU_GROUPS.map((group) => (
            <div key={group.label}>
              {/* Group header */}
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-default-400 select-none">
                {group.label}
              </p>
              {group.items.map((item) => (
                <button
                  key={item.kind}
                  className={`w-full text-left px-4 py-1.5 text-sm transition-colors rounded-none ${
                    selectedKind === item.kind
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-default-600 hover:bg-default-100 hover:text-default-900"
                  }`}
                  onClick={() => setSelectedKind(item.kind)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>

      {/* ── Right list ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <K8sResourceList
          environmentId={environmentId}
          namespace={namespace}
          kind={selectedKind}
          refreshSignal={refreshSignal}
          onSelectResource={onSelectResource}
          selectedResourceName={selectedResourceName}
          onClickFiles={
            selectedKind === "persistentvolumeclaims" ? handleClickFiles : undefined
          }
        />
      </div>

      {/* PVC file browser modal */}
      {pvcBrowserResource && (
        <K8sPVCFileBrowserModal
          environmentId={environmentId}
          namespace={namespace}
          pvcName={pvcBrowserResource.name}
          isOpen={pvcBrowserOpen}
          onOpenChange={(open) => {
            setPvcBrowserOpen(open);
            if (!open) setPvcBrowserResource(null);
          }}
        />
      )}
    </div>
  );
}
