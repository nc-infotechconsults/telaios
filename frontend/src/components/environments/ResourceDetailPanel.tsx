import { useState } from "react";
import { Button, Chip } from "@heroui/react";

interface Props {
  resourceKind: string;
  resourceName: string;
  detail: unknown;
  onClose: () => void;
}

export default function ResourceDetailPanel({ resourceKind, resourceName, detail, onClose }: Props) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const obj = detail as Record<string, unknown> | null;
  if (!obj) return null;

  const metadata = obj.metadata as Record<string, unknown> | undefined;
  const spec = obj.spec as Record<string, unknown> | undefined;
  const status = obj.status as Record<string, unknown> | undefined;

  const labels = (metadata?.labels ?? {}) as Record<string, string>;
  const annotations = (metadata?.annotations ?? {}) as Record<string, string>;
  const conditions = (status?.conditions ?? []) as Array<Record<string, unknown>>;
  const containers = (spec?.containers ?? status?.containerStatuses ?? []) as Array<Record<string, unknown>>;
  const containerStatuses = (status?.containerStatuses ?? []) as Array<Record<string, unknown>>;
  const volumes = (spec?.volumes ?? []) as Array<Record<string, unknown>>;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(detail, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full border-l border-divider">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-divider">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{resourceName}</p>
          <p className="text-xs text-default-400">{resourceKind}</p>
        </div>
        <Button size="sm" variant="light" onPress={onClose}>
          Close
        </Button>
      </div>

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Metadata */}
        {metadata && (
          <DetailSection title="Metadata">
            <KeyValueRow label="Name" value={String(metadata.name ?? "")} />
            {metadata.namespace ? <KeyValueRow label="Namespace" value={String(metadata.namespace)} /> : null}
            {metadata.uid ? <KeyValueRow label="UID" value={String(metadata.uid)} mono /> : null}
            {metadata.creationTimestamp ? (
              <KeyValueRow label="Created" value={formatTimestamp(String(metadata.creationTimestamp))} />
            ) : null}
            {metadata.resourceVersion ? (
              <KeyValueRow label="Resource Version" value={String(metadata.resourceVersion)} mono />
            ) : null}
          </DetailSection>
        )}

        {/* Labels */}
        {Object.keys(labels).length > 0 && (
          <DetailSection title="Labels">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(labels).map(([k, v]) => (
                <Chip key={k} size="sm" variant="flat" className="text-xs">
                  {k}: {v}
                </Chip>
              ))}
            </div>
          </DetailSection>
        )}

        {/* Annotations */}
        {Object.keys(annotations).length > 0 && (
          <DetailSection title="Annotations" defaultCollapsed>
            <div className="flex flex-col gap-1">
              {Object.entries(annotations).map(([k, v]) => (
                <KeyValueRow key={k} label={k} value={truncate(v, 80)} />
              ))}
            </div>
          </DetailSection>
        )}

        {/* Spec summary (Deployments, Services) */}
        {spec && resourceKind === "deployments" ? (
          <DetailSection title="Spec">
            {spec.replicas !== undefined ? <KeyValueRow label="Replicas" value={String(spec.replicas)} /> : null}
            {spec.strategy ? <KeyValueRow label="Strategy" value={String((spec.strategy as Record<string, unknown>).type ?? "")} /> : null}
          </DetailSection>
        ) : null}
        {spec && resourceKind === "services" ? (
          <DetailSection title="Spec">
            {spec.type ? <KeyValueRow label="Type" value={String(spec.type)} /> : null}
            {spec.clusterIP ? <KeyValueRow label="Cluster IP" value={String(spec.clusterIP)} mono /> : null}
            {Array.isArray(spec.ports) ? (
              <div className="mt-2">
                <p className="text-xs text-default-400 mb-1">Ports</p>
                <div className="flex flex-col gap-1">
                  {(spec.ports as Array<Record<string, unknown>>).map((port, i) => (
                    <span key={i} className="text-xs font-mono">
                      {port.name ? `${String(port.name)}: ` : ""}{String(port.port)}{port.targetPort ? `:${String(port.targetPort)}` : ""}/{String(port.protocol ?? "TCP")}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </DetailSection>
        ) : null}

        {/* Containers */}
        {containers.length > 0 && (
          <DetailSection title="Containers">
            <div className="flex flex-col gap-3">
              {containers.map((c, i) => {
                const name = String(c.name ?? `container-${i}`);
                const image = String(c.image ?? "");
                const statusInfo = containerStatuses.find((s) => s.name === name);
                const ready = statusInfo?.ready as boolean | undefined;
                const restartCount = statusInfo?.restartCount as number | undefined;
                const containerState = statusInfo?.state as Record<string, unknown> | undefined;
                const stateKey = containerState ? Object.keys(containerState)[0] : undefined;

                return (
                  <div key={i} className="border border-divider rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium">{name}</p>
                      {stateKey && (
                        <Chip
                          size="sm"
                          variant="flat"
                          color={stateKey === "running" ? "success" : stateKey === "waiting" ? "warning" : "danger"}
                        >
                          {stateKey}
                        </Chip>
                      )}
                    </div>
                    <p className="text-xs text-default-400 font-mono truncate">{image}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-default-400">
                      {ready !== undefined && <span>Ready: {ready ? "Yes" : "No"}</span>}
                      {restartCount !== undefined && <span>Restarts: {restartCount}</span>}
                    </div>
                    {Array.isArray(c.ports) && (c.ports as Array<Record<string, unknown>>).length > 0 && (
                      <div className="mt-1 text-xs text-default-400">
                        Ports: {(c.ports as Array<Record<string, unknown>>).map((p) => `${p.containerPort}/${p.protocol ?? "TCP"}`).join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </DetailSection>
        )}

        {/* Conditions */}
        {conditions.length > 0 && (
          <DetailSection title="Conditions">
            <div className="flex flex-col gap-1">
              {conditions.map((cond, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Chip
                    size="sm"
                    variant="flat"
                    color={cond.status === "True" ? "success" : cond.status === "False" ? "danger" : "default"}
                    className="min-w-[48px] text-center"
                  >
                    {String(cond.status)}
                  </Chip>
                  <span className="font-medium">{String(cond.type)}</span>
                  {cond.reason ? <span className="text-default-400">({String(cond.reason)})</span> : null}
                </div>
              ))}
            </div>
          </DetailSection>
        )}

        {/* Volumes */}
        {volumes.length > 0 && (
          <DetailSection title="Volumes" defaultCollapsed>
            <div className="flex flex-col gap-1">
              {volumes.map((vol, i) => {
                const name = String(vol.name ?? `vol-${i}`);
                const sourceType = Object.keys(vol).find((k) => k !== "name") ?? "unknown";
                return (
                  <KeyValueRow key={i} label={name} value={sourceType} />
                );
              })}
            </div>
          </DetailSection>
        )}

        {/* Raw JSON */}
        <DetailSection title="Raw" defaultCollapsed>
          <div className="flex items-center justify-end mb-2 gap-2">
            <Button size="sm" variant="flat" onPress={handleCopy}>
              {copied ? "Copied!" : "Copy JSON"}
            </Button>
            <Button size="sm" variant="flat" onPress={() => setShowRaw(!showRaw)}>
              {showRaw ? "Hide" : "Show"}
            </Button>
          </div>
          {showRaw && (
            <pre className="text-xs bg-default-50 rounded-lg p-3 overflow-auto max-h-80 whitespace-pre-wrap break-all">
              {JSON.stringify(detail, null, 2)}
            </pre>
          )}
        </DetailSection>
      </div>
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────────────── */

function DetailSection({
  title,
  children,
  defaultCollapsed = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="border-b border-divider">
      <button
        className="flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-default-50 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-default-500">{title}</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`w-3.5 h-3.5 text-default-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {!collapsed && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function KeyValueRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5">
      <span className="text-xs text-default-500 shrink-0">{label}</span>
      <span className={`text-xs text-right truncate ${mono ? "font-mono text-default-400" : ""}`}>{value}</span>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "…" : str;
}
