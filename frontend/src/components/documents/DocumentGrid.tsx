import { Chip } from "@heroui/react";
import type { Document } from "../../types";
import FileTypeIcon from "./FileTypeIcon";

interface Props {
  documents: Document[];
  viewMode: "grid" | "list";
  selectedId: string | null;
  favoriteIds: string[];
  onSelect: (doc: Document) => void;
  onOpen: (doc: Document) => void;
  onToggleFavorite: (doc: Document) => void;
}

const STATUS_COLOR: Record<string, "warning" | "success" | "danger" | "default"> = {
  uploading: "warning",
  processing: "warning",
  ready: "success",
  error: "danger",
};

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
  });
}

export default function DocumentGrid({
  documents,
  viewMode,
  selectedId,
  favoriteIds,
  onSelect,
  onOpen,
  onToggleFavorite,
}: Props) {
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-default-400">
        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium">No documents here</p>
        <p className="text-xs">Upload files or create a new document to get started</p>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
        {documents.map((doc) => (
          <GridCard
            key={doc.id}
            doc={doc}
            isSelected={selectedId === doc.id}
            isFavorite={favoriteIds.includes(doc.id)}
            onSelect={() => onSelect(doc)}
            onOpen={() => onOpen(doc)}
            onToggleFavorite={() => onToggleFavorite(doc)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* List header */}
      <div className="grid grid-cols-[1fr_80px_100px_100px_80px_40px] gap-2 px-4 py-2 border-b border-divider text-xs font-semibold text-default-400 uppercase tracking-wider">
        <span>Name</span>
        <span>Type</span>
        <span>Size</span>
        <span>Modified</span>
        <span>Status</span>
        <span />
      </div>
      {documents.map((doc) => (
        <ListRow
          key={doc.id}
          doc={doc}
          isSelected={selectedId === doc.id}
          isFavorite={favoriteIds.includes(doc.id)}
          onSelect={() => onSelect(doc)}
          onOpen={() => onOpen(doc)}
          onToggleFavorite={() => onToggleFavorite(doc)}
        />
      ))}
    </div>
  );
}

/* ---------- Grid Card ---------- */

function GridCard({
  doc,
  isSelected,
  isFavorite,
  onSelect,
  onOpen,
  onToggleFavorite,
}: {
  doc: Document;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border cursor-pointer transition-all select-none ${
        isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-divider hover:border-default-300 hover:bg-default-50"
      }`}
    >
      {/* Favorite star */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="absolute top-2 right-2 p-1 rounded-md hover:bg-default-100 transition-colors"
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <svg
          className={`w-4 h-4 ${isFavorite ? "text-warning fill-warning" : "text-default-300"}`}
          fill={isFavorite ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      </button>

      <FileTypeIcon fileType={doc.file_type} size="lg" />

      <span className="text-sm font-medium text-foreground text-center truncate w-full">
        {doc.name}
      </span>

      <div className="flex items-center gap-2 text-xs text-default-400">
        <span>{formatBytes(doc.size_bytes)}</span>
        <span>·</span>
        <Chip size="sm" variant="flat" color={STATUS_COLOR[doc.status] ?? "default"} className="h-5 text-[10px]">
          {doc.status}
        </Chip>
      </div>

      {doc.status === "error" && doc.error_message && (
        <p className="text-[10px] text-danger text-center line-clamp-2 leading-tight" title={doc.error_message}>
          {doc.error_message}
        </p>
      )}
    </div>
  );
}

/* ---------- List Row ---------- */

function ListRow({
  doc,
  isSelected,
  isFavorite,
  onSelect,
  onOpen,
  onToggleFavorite,
}: {
  doc: Document;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      className={`grid grid-cols-[1fr_80px_100px_100px_80px_40px] gap-2 items-center px-4 py-2.5 border-b border-divider cursor-pointer transition-colors select-none ${
        isSelected
          ? "bg-primary/5"
          : "hover:bg-default-50"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <FileTypeIcon fileType={doc.file_type} size="sm" />
        <div className="min-w-0">
          <span className="text-sm font-medium text-foreground truncate block">{doc.name}</span>
          {doc.status === "error" && doc.error_message && (
            <span className="text-[10px] text-danger truncate block" title={doc.error_message}>
              {doc.error_message}
            </span>
          )}
        </div>
      </div>
      <span className="text-xs text-default-400 uppercase">{doc.file_type}</span>
      <span className="text-xs text-default-400">{formatBytes(doc.size_bytes)}</span>
      <span className="text-xs text-default-400">{formatDate(doc.updated_at)}</span>
      <Chip size="sm" variant="flat" color={STATUS_COLOR[doc.status] ?? "default"} className="h-5 text-[10px]">
        {doc.status}
      </Chip>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className="p-1 rounded-md hover:bg-default-100 transition-colors"
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <svg
          className={`w-4 h-4 ${isFavorite ? "text-warning fill-warning" : "text-default-300"}`}
          fill={isFavorite ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      </button>
    </div>
  );
}
