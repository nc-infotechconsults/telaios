import { useEffect, useState } from "react";
import { Button, Spinner, useDisclosure } from "../ui";
import { createDockerShellTicket, getDockerContainer } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerContainer } from "../../types";
import DockerExecModal from "./DockerExecModal";
import DockerStatsModal from "./DockerStatsModal";

// ── Shared helpers ────────────────────────────────────────────────────────────

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-divider pb-3 mb-3 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full text-left py-1"
      >
        <span className="text-xs font-semibold text-default-600 uppercase tracking-wide">
          {title}
        </span>
        <span className="text-default-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-xs text-default-400 min-w-[110px] flex-shrink-0">{label}</span>
      <span className="text-xs text-default-700 font-mono break-all">{value}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  environmentId: string;
  container: DockerContainer;
  onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InspectData = Record<string, any>;

export default function DockerContainerDetail({ environmentId, container, onClose }: Props) {
  const [data, setData] = useState<InspectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingShell, setOpeningShell] = useState(false);
  const { isOpen: isExecOpen, onOpen: onExecOpen, onOpenChange: onExecOpenChange } = useDisclosure();
  const { isOpen: isStatsOpen, onOpen: onStatsOpen, onOpenChange: onStatsOpenChange } = useDisclosure();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    getDockerContainer(environmentId, container.id.slice(0, 12))
      .then((d) => { if (!cancelled) setData(d as InspectData); })
      .catch(() => { if (!cancelled) toast.error("Failed to load container details"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [environmentId, container.id]);

  const config = data?.Config ?? {};
  const hostConfig = data?.HostConfig ?? {};
  const networkSettings = data?.NetworkSettings ?? {};
  const mounts: InspectData[] = data?.Mounts ?? [];

  const envVars: string[] = config.Env ?? [];
  const portBindings: InspectData = hostConfig.PortBindings ?? {};
  const networks: InspectData = networkSettings.Networks ?? {};

  const openShell = async () => {
    setOpeningShell(true);
    try {
      const { ticket } = await createDockerShellTicket(environmentId, container.id);
      window.open(
        `/environments/${environmentId}/docker/shell/${container.id}?ticket=${encodeURIComponent(ticket)}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch {
      toast.error("Failed to open shell");
    } finally {
      setOpeningShell(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{container.name}</p>
          <p className="text-xs font-mono text-default-400">{container.id.slice(0, 12)}</p>
        </div>
        <Button size="sm" variant="light" onPress={onClose} className="ml-2 flex-shrink-0">
          ✕
        </Button>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1 mb-3">
        <Button
          size="sm"
          variant="flat"
          onPress={onExecOpen}
          isDisabled={container.state !== "running"}
        >
          Exec
        </Button>
        <Button
          size="sm"
          variant="flat"
          onPress={onStatsOpen}
          isDisabled={container.state !== "running"}
        >
          Stats
        </Button>
        <Button
          size="sm"
          variant="flat"
          onPress={openShell}
          isDisabled={container.state !== "running"}
          isLoading={openingShell}
        >
          Shell
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner size="sm" label="Loading…" />
        </div>
      ) : (
        <>
          {/* Summary */}
          <Section title="Summary">
            <KVRow label="Image" value={container.image} />
            <KVRow label="State" value={container.state} />
            <KVRow label="Status" value={container.status} />
            <KVRow label="Created" value={new Date(container.created).toLocaleString()} />
            {config.WorkingDir && <KVRow label="Working Dir" value={config.WorkingDir} />}
            {config.User && <KVRow label="User" value={config.User} />}
            {data?.Platform && <KVRow label="Platform" value={data.Platform} />}
          </Section>

          {/* Command / Entrypoint */}
          {(config.Entrypoint || config.Cmd) && (
            <Section title="Command &amp; Entrypoint">
              {config.Entrypoint && (
                <KVRow label="Entrypoint" value={(config.Entrypoint as string[]).join(" ")} />
              )}
              {config.Cmd && (
                <KVRow label="Cmd" value={(config.Cmd as string[]).join(" ")} />
              )}
            </Section>
          )}

          {/* Environment variables */}
          {envVars.length > 0 && (
            <Section title={`Env Vars (${envVars.length})`} defaultOpen={false}>
              <div className="flex flex-col gap-0.5">
                {[...envVars].sort().map((e) => {
                  const idx = e.indexOf("=");
                  const k = idx !== -1 ? e.slice(0, idx) : e;
                  const v = idx !== -1 ? e.slice(idx + 1) : "";
                  return (
                    <div key={k} className="flex gap-2 py-0.5">
                      <span className="text-xs text-default-500 font-mono min-w-[110px] flex-shrink-0 truncate">
                        {k}
                      </span>
                      <span className="text-xs font-mono text-default-700 break-all">{v}</span>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* Port bindings */}
          {Object.keys(portBindings).length > 0 && (
            <Section title="Port Bindings">
              {Object.entries(portBindings).map(([containerPort, bindings]) => {
                const bs = bindings as Array<{ HostIp: string; HostPort: string }> | null;
                return (
                  <KVRow
                    key={containerPort}
                    label={containerPort}
                    value={
                      bs && bs.length > 0
                        ? bs.map((b) => `${b.HostIp || "0.0.0.0"}:${b.HostPort}`).join(", ")
                        : "unbound"
                    }
                  />
                );
              })}
            </Section>
          )}

          {/* Mounts */}
          {mounts.length > 0 && (
            <Section title={`Mounts (${mounts.length})`}>
              {mounts.map((m, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  <KVRow label="Type" value={m.Type} />
                  {m.Name && <KVRow label="Name" value={m.Name} />}
                  <KVRow label="Source" value={m.Source ?? "-"} />
                  <KVRow label="Destination" value={m.Destination} />
                  <KVRow label="Mode" value={m.Mode || "rw"} />
                </div>
              ))}
            </Section>
          )}

          {/* Network settings */}
          {Object.keys(networks).length > 0 && (
            <Section title="Networks">
              {Object.entries(networks).map(([netName, info]: [string, InspectData]) => (
                <div key={netName} className="mb-2 last:mb-0">
                  <p className="text-xs font-semibold text-default-600 mb-0.5">{netName}</p>
                  {info.IPAddress && <KVRow label="IP Address" value={info.IPAddress} />}
                  {info.Gateway && <KVRow label="Gateway" value={info.Gateway} />}
                  {info.MacAddress && <KVRow label="MAC" value={info.MacAddress} />}
                </div>
              ))}
            </Section>
          )}

          {/* Raw JSON */}
          <Section title="Raw JSON" defaultOpen={false}>
            <pre className="text-xs bg-default-50 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap break-all">
              {JSON.stringify(data, null, 2)}
            </pre>
          </Section>
        </>
      )}

      <DockerExecModal
        environmentId={environmentId}
        container={container}
        isOpen={isExecOpen}
        onOpenChange={onExecOpenChange}
      />
      <DockerStatsModal
        environmentId={environmentId}
        container={container}
        isOpen={isStatsOpen}
        onOpenChange={onStatsOpenChange}
      />
    </div>
  );
}
