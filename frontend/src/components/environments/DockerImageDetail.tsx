import { useEffect, useState } from "react";
import { Button, Spinner } from "@heroui/react";
import { inspectDockerImage } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerImage } from "../../types";

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  environmentId: string;
  image: DockerImage;
  onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InspectData = Record<string, any>;

export default function DockerImageDetail({ environmentId, image, onClose }: Props) {
  const [data, setData] = useState<InspectData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    inspectDockerImage(environmentId, image.id)
      .then((d) => { if (!cancelled) setData(d as InspectData); })
      .catch(() => { if (!cancelled) toast.error("Failed to load image details"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [environmentId, image.id]);

  const config: InspectData = data?.Config ?? {};
  const rootFs: InspectData = data?.RootFS ?? {};

  const envVars: string[] = config.Env ?? [];
  const exposedPorts: string[] = Object.keys(config.ExposedPorts ?? {});
  const labels: Record<string, string> = config.Labels ?? {};
  const layers: string[] = rootFs.Layers ?? [];

  return (
    <div className="flex flex-col gap-1">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {image.tags.length > 0 ? image.tags[0] : "<none>"}
          </p>
          <p className="text-xs font-mono text-default-400">{image.id.slice(7, 19)}</p>
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
            <KVRow label="ID" value={image.id.slice(7, 19)} />
            <KVRow label="Size" value={formatSize(image.size)} />
            <KVRow label="Created" value={new Date(image.created).toLocaleString()} />
            {data?.Os && <KVRow label="OS" value={data.Os} />}
            {data?.Architecture && <KVRow label="Architecture" value={data.Architecture} />}
            {image.tags.length > 1 && (
              <div className="flex gap-2 py-0.5">
                <span className="text-xs text-default-400 min-w-[110px] flex-shrink-0">All Tags</span>
                <div className="flex flex-col gap-0.5">
                  {image.tags.map((t) => (
                    <span key={t} className="text-xs font-mono text-default-700">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Entrypoint & Cmd */}
          {(config.Entrypoint || config.Cmd) && (
            <Section title="Entrypoint &amp; Cmd">
              {config.Entrypoint && (
                <KVRow label="Entrypoint" value={(config.Entrypoint as string[]).join(" ")} />
              )}
              {config.Cmd && (
                <KVRow label="Cmd" value={(config.Cmd as string[]).join(" ")} />
              )}
              {config.WorkingDir && <KVRow label="Working Dir" value={config.WorkingDir} />}
              {config.User && <KVRow label="User" value={config.User} />}
            </Section>
          )}

          {/* Env Vars */}
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

          {/* Exposed Ports */}
          {exposedPorts.length > 0 && (
            <Section title="Exposed Ports">
              <div className="flex flex-wrap gap-1">
                {exposedPorts.map((p) => (
                  <span key={p} className="text-xs font-mono bg-default-100 rounded px-1.5 py-0.5">
                    {p}
                  </span>
                ))}
              </div>
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

          {/* Layers */}
          {layers.length > 0 && (
            <Section title={`Layers (${layers.length})`} defaultOpen={false}>
              <div className="flex flex-col gap-0.5">
                {layers.map((l, i) => (
                  <span key={i} className="text-xs font-mono text-default-500 truncate">
                    {l.slice(7, 19)}
                  </span>
                ))}
              </div>
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
