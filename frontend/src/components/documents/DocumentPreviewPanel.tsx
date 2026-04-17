import { useEffect, useState } from "react";
import { Button, Chip, Spinner, Tabs, Tab, Tooltip } from "@heroui/react";
import type { Document, DocumentVersion, DocumentTag, DocumentActivityItem } from "../../types";
import {
  listVersions,
  listDocumentActivities,
  getDocumentTags,
  listTags,
  assignDocumentTag,
  unassignDocumentTag,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import FileTypeIcon from "./FileTypeIcon";

interface Props {
  projectId: string;
  document: Document | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onOpen: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_COLOR: Record<string, "warning" | "success" | "danger" | "default"> = {
  uploading: "warning",
  processing: "warning",
  ready: "success",
  error: "danger",
};

export default function DocumentPreviewPanel({
  projectId,
  document: doc,
  isFavorite,
  onToggleFavorite,
  onDownload,
  onDelete,
  onOpen,
}: Props) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [activities, setActivities] = useState<DocumentActivityItem[]>([]);
  const [docTags, setDocTags] = useState<DocumentTag[]>([]);
  const [allTags, setAllTags] = useState<DocumentTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  useEffect(() => {
    if (!doc) return;
    listVersions(projectId, doc.id).then(setVersions).catch(() => {});
    listDocumentActivities(projectId, doc.id).then(setActivities).catch(() => {});
    setLoadingTags(true);
    Promise.all([
      getDocumentTags(projectId, doc.id),
      listTags(projectId),
    ])
      .then(([dt, at]) => {
        setDocTags(dt);
        setAllTags(at);
      })
      .catch(() => {})
      .finally(() => setLoadingTags(false));
  }, [projectId, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-default-400 px-6">
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        <p className="text-sm font-medium">No document selected</p>
        <p className="text-xs text-center">Select a document to view its details</p>
      </div>
    );
  }

  const assignableTagIds = new Set(docTags.map((t) => t.id));
  const unassignedTags = allTags.filter((t) => !assignableTagIds.has(t.id));

  const handleAssignTag = async (tagId: string) => {
    try {
      await assignDocumentTag(projectId, doc.id, tagId);
      const tag = allTags.find((t) => t.id === tagId);
      if (tag) setDocTags((prev) => [...prev, tag]);
    } catch {
      toast.error("Failed to assign tag");
    }
  };

  const handleUnassignTag = async (tagId: string) => {
    try {
      await unassignDocumentTag(projectId, doc.id, tagId);
      setDocTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch {
      toast.error("Failed to remove tag");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-col gap-3 p-4 border-b border-divider">
        <div className="flex items-start gap-3">
          <FileTypeIcon fileType={doc.file_type} size="lg" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{doc.name}</h3>
            <p className="text-xs text-default-400 mt-0.5">{doc.file_type.toUpperCase()} · {formatBytes(doc.size_bytes)}</p>
          </div>
          <Tooltip content={isFavorite ? "Remove from favorites" : "Add to favorites"}>
            <button onClick={onToggleFavorite} className="p-1 rounded-md hover:bg-default-100 transition-colors" aria-label="Toggle favorite">
              <svg
                className={`w-5 h-5 ${isFavorite ? "text-warning fill-warning" : "text-default-300"}`}
                fill={isFavorite ? "currentColor" : "none"}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          </Tooltip>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button size="sm" variant="flat" color="primary" onPress={onOpen} className="flex-1">
            Open
          </Button>
          <Button size="sm" variant="flat" onPress={onDownload} className="flex-1">
            Download
          </Button>
          <Button size="sm" variant="flat" color="danger" onPress={onDelete} isIconOnly aria-label="Delete document">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        aria-label="Document details"
        size="sm"
        variant="underlined"
        classNames={{ tabList: "px-4 pt-2", panel: "flex-1 overflow-y-auto" }}
      >
        <Tab key="details" title="Details">
          <div className="flex flex-col gap-4 p-4">
            {/* Status */}
            <DetailRow label="Status">
              <Chip size="sm" variant="flat" color={STATUS_COLOR[doc.status] ?? "default"}>
                {doc.status}
              </Chip>
            </DetailRow>

            <DetailRow label="Created">{formatDate(doc.created_at)}</DetailRow>
            <DetailRow label="Modified">{formatDate(doc.updated_at)}</DetailRow>
            <DetailRow label="MIME Type">{doc.mime_type}</DetailRow>

            {doc.error_message && (
              <DetailRow label="Error">
                <span className="text-danger text-xs">{doc.error_message}</span>
              </DetailRow>
            )}

            {/* Tags */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold text-default-400 uppercase tracking-wider">Tags</span>
              {loadingTags ? (
                <Spinner size="sm" />
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {docTags.map((tag) => (
                      <Chip
                        key={tag.id}
                        size="sm"
                        variant="flat"
                        onClose={() => handleUnassignTag(tag.id)}
                        style={{ borderColor: tag.color, color: tag.color }}
                        className="border"
                      >
                        {tag.name}
                      </Chip>
                    ))}
                    {docTags.length === 0 && (
                      <span className="text-xs text-default-400">No tags</span>
                    )}
                  </div>
                  {unassignedTags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {unassignedTags.slice(0, 5).map((tag) => (
                        <button
                          key={tag.id}
                          onClick={() => handleAssignTag(tag.id)}
                          className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-default-300 text-default-400 hover:border-primary hover:text-primary transition-colors"
                        >
                          + {tag.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </Tab>

        <Tab key="versions" title="Versions">
          <div className="flex flex-col gap-1 p-4">
            {versions.length === 0 ? (
              <p className="text-xs text-default-400 py-4 text-center">No versions yet</p>
            ) : (
              versions.map((v) => (
                <div key={v.id} className="flex items-center gap-3 py-2 border-b border-divider last:border-0">
                  <div className="w-7 h-7 rounded-full bg-default-100 flex items-center justify-center text-xs font-bold text-default-600">
                    v{v.version_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {v.change_description || "No description"}
                    </p>
                    <p className="text-[10px] text-default-400">
                      {formatDate(v.created_at)} · {formatBytes(v.size_bytes)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Tab>

        <Tab key="activity" title="Activity">
          <div className="flex flex-col gap-1 p-4">
            {activities.length === 0 ? (
              <p className="text-xs text-default-400 py-4 text-center">No activity yet</p>
            ) : (
              activities.map((a) => (
                <div key={a.id} className="flex items-start gap-3 py-2 border-b border-divider last:border-0">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground">
                      <span className="font-medium">{a.user_name || "System"}</span>{" "}
                      <span className="text-default-500">{a.action.replace(/_/g, " ")}</span>
                    </p>
                    <p className="text-[10px] text-default-400">{formatDate(a.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Tab>
      </Tabs>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-default-400 flex-shrink-0">{label}</span>
      <div className="text-xs text-foreground text-right">{children}</div>
    </div>
  );
}
