import { useState, useRef, useEffect } from "react";
import { FilePlus, FolderPlus, X } from "lucide-react";

interface Props {
  type: "file" | "folder";
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}

export function NewEntryInput({ type, onSubmit, onCancel }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    // Validate name
    if (trimmedName.includes("/") || trimmedName.includes("\\")) {
      setError("Name cannot contain / or \\");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await onSubmit(trimmedName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-2 py-1">
      <div className="flex items-center gap-1.5 bg-white/[0.04] rounded border border-white/[0.08] px-2 py-1">
        {type === "file" ? (
          <FilePlus size={14} className="text-zinc-400 shrink-0" />
        ) : (
          <FolderPlus size={14} className="text-zinc-400 shrink-0" />
        )}
        
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          onKeyDown={handleKeyDown}
          placeholder={`New ${type} name...`}
          disabled={loading}
          className="flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-500 outline-none"
        />

        {error && (
          <span className="text-red-400 text-[10px]">{error}</span>
        )}

        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="p-0.5 hover:text-zinc-200 text-zinc-500 transition-colors"
        >
          <X size={12} />
        </button>
      </div>
    </form>
  );
}