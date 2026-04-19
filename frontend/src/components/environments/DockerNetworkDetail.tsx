import { useEffect, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { inspectDockerNetwork } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerNetwork } from "../../types";

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
  network: DockerNetwork;
  onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InspectData = Record<string, any>;

export default function DockerNetworkDetail({ environmentId, network, onClose }: Props) {
  const [data, setData] = useState<InspectData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    inspectDockerNetwork(environmentId, network.id)
      .then((d) => { if (!cancelled) setData(d as InspectData); })
      .catch(() => { if (!cancelled) toast.error("Failed to load network details"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [environmentId, network.id]);

  const ipam: InspectData = data?.IPAM ?? {};
  const ipamConfig: InspectData[] = ipam.Config ?? [];
  const connectedContainers: InspectData = data?.Containers ?? {};
  const options: Record<string, string> = data?.Options ?? {};
  const labels: Record<string, string> = data?.Labels ?? {};

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{network.name}</p>
          <p className="text-xs font-mono text-default-400">{network.id.slice(0, 12)}</p>
        </div>
        <Button size="sm" variant="light" onPress={onClose} className="ml-2 flex-shrink-0">
          ✕
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
            <KVRow label="ID" value={network.id.slice(0, 12)} />
            <KVRow label="Name" value={network.name} />
            <KVRow label="Driver" value={network.driver} />
            <KVRow label="Scope" value={network.scope} />
            <KVRow label="Created" value={new Date(network.created).toLocaleString()} />
            {data?.EnableIPv6 !== undefined && (
              <KVRow label="IPv6" value={data.EnableIPv6 ? "enabled" : "disabled"} />
            )}
            {data?.Internal !== undefined && (
              <KVRow label="Internal" value={data.Internal ? "yes" : "no"} />
            )}
            {data?.Attachable !== undefined && (
              <KVRow label="Attachable" value={data.Attachable ? "yes" : "no"} />
            )}
          </Section>

          {/* IPAM Config */}
          {ipamConfig.length > 0 && (
            <Section title="IPAM Config">
              {ipamConfig.map((cfg, i) => (
                <div key={i} className="mb-2 last:mb-0">
                  {cfg.Subnet && <KVRow label="Subnet" value={cfg.Subnet} />}
                  {cfg.Gateway && <KVRow label="Gateway" value={cfg.Gateway} />}
                  {cfg.IPRange && <KVRow label="IP Range" value={cfg.IPRange} />}
                </div>
              ))}
            </Section>
          )}

          {/* Connected Containers */}
          {Object.keys(connectedContainers).length > 0 && (
            <Section title={`Connected Containers (${Object.keys(connectedContainers).length})`}>
              {Object.entries(connectedContainers).map(([id, info]: [string, InspectData]) => (
                <div key={id} className="mb-2 last:mb-0">
                  <p className="text-xs font-semibold text-default-600 mb-0.5 truncate">
                    {info.Name ?? id.slice(0, 12)}
                  </p>
                  {info.IPv4Address && <KVRow label="IPv4" value={info.IPv4Address} />}
                  {info.IPv6Address && <KVRow label="IPv6" value={info.IPv6Address} />}
                  {info.MacAddress && <KVRow label="MAC" value={info.MacAddress} />}
                </div>
              ))}
            </Section>
          )}

          {/* Options */}
          {Object.keys(options).length > 0 && (
            <Section title="Options" defaultOpen={false}>
              {Object.entries(options).map(([k, v]) => (
                <KVRow key={k} label={k} value={v} />
              ))}
            </Section>
          )}

          {/* Labels */}
          {Object.keys(labels).length > 0 && (
            <Section title={`Labels (${Object.keys(labels).length})`} defaultOpen={false}>
              {Object.entries(labels).map(([k, v]) => (
                <KVRow key={k} label={k} value={v} />
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
    </div>
  );
}
