import { useEffect, useState } from "react";
import { Button, Spinner, useDisclosure } from "../ui";
import { inspectDockerVolume } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerVolume } from "../../types";
import DockerVolumeFileBrowserModal from "./DockerVolumeFileBrowserModal";

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

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  environmentId: string;
  volume: DockerVolume;
  onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InspectData = Record<string, any>;

export default function DockerVolumeDetail({ environmentId, volume, onClose }: Props) {
  const [data, setData] = useState<InspectData | null>(null);
  const [loading, setLoading] = useState(true);
  const { isOpen: isBrowserOpen, onOpen: openBrowser, onOpenChange: onBrowserOpenChange } = useDisclosure();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    inspectDockerVolume(environmentId, volume.name)
      .then((d) => { if (!cancelled) setData(d as InspectData); })
      .catch(() => { if (!cancelled) toast.error("Failed to load volume details"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [environmentId, volume.name]);

  const labels: Record<string, string> = volume.labels ?? {};

  return (
    <>
      <div className="flex flex-col gap-1">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold font-mono truncate">{volume.name}</p>
            <p className="text-xs text-default-400">{volume.driver}</p>
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
              <KVRow label="Name" value={volume.name} />
              <KVRow label="Driver" value={volume.driver} />
              <KVRow label="Scope" value={volume.scope} />
              <KVRow label="Created" value={new Date(volume.created).toLocaleString()} />
              <KVRow label="Mountpoint" value={volume.mountpoint} />
            </Section>

            {/* Labels */}
            {Object.keys(labels).length > 0 && (
              <Section title={`Labels (${Object.keys(labels).length})`} defaultOpen={false}>
                {Object.entries(labels).map(([k, v]) => (
                  <KVRow key={k} label={k} value={v} />
                ))}
              </Section>
            )}

            {/* File Browser trigger */}
            <Section title="File Browser">
              <Button
                size="sm"
                variant="flat"
                onPress={openBrowser}
                className="w-full"
              >
                Browse Files
              </Button>
            </Section>

            {/* Raw JSON */}
            <Section title="Raw JSON" defaultOpen={false}>
              <pre className="text-xs bg-default-50 rounded p-2 overflow-auto max-h-64 whitespace-pre-wrap break-all">
                {JSON.stringify(data, null, 2)}
              </pre>
            </Section>
          </>
        )}
      </div>

      {/* File Browser Modal */}
      <DockerVolumeFileBrowserModal
        environmentId={environmentId}
        volumeName={volume.name}
        isOpen={isBrowserOpen}
        onOpenChange={onBrowserOpenChange}
      />
    </>
  );
}
