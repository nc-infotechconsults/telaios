import { useState, useRef, useEffect } from "react";
import { FilePlus, FolderPlus, Edit3, X } from "lucide-react";

interface Props {
  type: "file" | "folder";
  /** Pre-fills the input — used for inline rename. */
  initialValue?: string;
  /** Left indent in pixels (depth * 12 + 8). Defaults to 8. */
  indent?: number;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function NewEntryInput({ type, initialValue, indent = 8, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initialValue ?? "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isRenameMode = initialValue !== undefined;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    // In rename mode, select only the stem (before the last dot)
    if (isRenameMode && initialValue) {
      const dotIdx = initialValue.lastIndexOf(".");
      const selEnd = dotIdx > 0 ? dotIdx : initialValue.length;
      input.setSelectionRange(0, selEnd);
    }
  }, [isRenameMode, initialValue]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    if (trimmed.includes("/") || trimmed.includes("\\")) {
      setError("Name cannot contain / or \\");
      return;
    }
    // No-op if rename submitted with the same name
    if (isRenameMode && trimmed === initialValue) {
      onCancel();
      return;
    }

    setLoading(true);
    setError("");
    try {
      await onSubmit(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  }

  const Icon = isRenameMode ? Edit3 : type === "file" ? FilePlus : FolderPlus;

  return (
    <form
      onSubmit={handleSubmit}
      style={{ paddingLeft: `${indent}px` }}
      className="py-0.5 pr-2"
    >
      <div
        className={[
          "flex items-center gap-1.5 rounded border px-2 py-0.5",
          error
            ? "bg-red-500/10 border-red-500/40"
            : "bg-white/[0.06] border-white/[0.12]",
        ].join(" ")}
      >
        <Icon size={13} className="text-zinc-400 shrink-0" />

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={isRenameMode ? "New name…" : `New ${type} name…`}
          disabled={loading}
          className="flex-1 min-w-0 bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 outline-none"
        />

        {error && (
          <span className="text-red-400 text-[10px] shrink-0 max-w-[120px] truncate" title={error}>
            {error}
          </span>
        )}

        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="p-0.5 hover:text-zinc-200 text-zinc-500 transition-colors shrink-0"
        >
          <X size={12} />
        </button>
      </div>
    </form>
  );
}
