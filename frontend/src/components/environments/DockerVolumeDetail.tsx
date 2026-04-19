import { useEffect, useState, useCallback } from "react";
import { Button, Spinner } from "@heroui/react";
import { inspectDockerVolume, listDockerVolumeFiles, downloadDockerVolumeFile } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerVolume, DockerVolumeFileEntry } from "../../types";

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
  if (bytes === 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── File Browser ──────────────────────────────────────────────────────────────

interface FileBrowserProps {
  environmentId: string;
  volumeName: string;
}

function FileBrowser({ environmentId, volumeName }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState("/");
  const [entries, setEntries] = useState<DockerVolumeFileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPath = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const files = await listDockerVolumeFiles(environmentId, volumeName, path);
        setEntries(files);
        setCurrentPath(path);
      } catch {
        setError("Failed to list files. The volume may be empty or inaccessible.");
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [environmentId, volumeName],
  );

  useEffect(() => {
    loadPath("/");
  }, [loadPath]);

  // Build breadcrumb segments from currentPath
  const segments = currentPath.split("/").filter(Boolean);
  const breadcrumbs = [
    { label: "/", path: "/" },
    ...segments.map((seg, i) => ({
      label: seg,
      path: "/" + segments.slice(0, i + 1).join("/"),
    })),
  ];

  const handleNavigate = (path: string) => {
    loadPath(path);
  };

  const handleDownload = async (entry: DockerVolumeFileEntry) => {
    setDownloading(entry.path);
    try {
      await downloadDockerVolumeFile(environmentId, volumeName, entry.path);
    } catch {
      toast.error("Failed to download file");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Breadcrumb */}
      <div className="flex items-center flex-wrap gap-0.5 text-xs font-mono">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-0.5">
            {i > 0 && <span className="text-default-300">/</span>}
            <button
              className={`hover:text-primary transition-colors ${
                i === breadcrumbs.length - 1
                  ? "text-default-700 font-semibold"
                  : "text-default-400"
              }`}
              onClick={() => handleNavigate(crumb.path)}
            >
              {crumb.label}
            </button>
          </span>
        ))}
      </div>

      {/* Go up button */}
      {currentPath !== "/" && (
        <button
          className="flex items-center gap-1 text-xs text-default-400 hover:text-default-700 transition-colors w-fit"
          onClick={() => {
            const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
            handleNavigate(parent);
          }}
        >
          <span>↑</span>
          <span>..</span>
        </button>
      )}

      {/* File listing */}
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Spinner size="sm" label="Loading files…" />
        </div>
      ) : error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-default-400">Empty directory</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {entries.map((entry) => (
            <div
              key={entry.path}
              className="flex items-center justify-between gap-2 py-1 px-1.5 rounded hover:bg-default-50 group"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-default-400 text-xs flex-shrink-0">
                  {entry.type === "directory" ? "📁" : "📄"}
                </span>
                {entry.type === "directory" ? (
                  <button
                    className="text-xs font-mono text-primary truncate"
                    onClick={() => handleNavigate(entry.path)}
                  >
                    {entry.name}
                  </button>
                ) : (
                  <span className="text-xs font-mono text-default-700 truncate">{entry.name}</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-default-400">{formatSize(entry.size)}</span>
                <Button
                  size="sm"
                  variant="flat"
                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 min-w-0 px-2 text-xs"
                  isLoading={downloading === entry.path}
                  onPress={() => handleDownload(entry)}
                >
                  ↓
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
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

          {/* File Browser */}
          <Section title="File Browser">
            <FileBrowser environmentId={environmentId} volumeName={volume.name} />
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
  );
}
