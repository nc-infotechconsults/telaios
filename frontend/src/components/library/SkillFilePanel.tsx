import { useState } from "react";
import { Input } from "../ui";
import SkillFileEditor from "./SkillFileEditor";

export interface FileEntry {
  path: string;
  content: string;
}

interface Props {
  value: FileEntry[];
  onChange: (files: FileEntry[]) => void;
  disabled?: boolean;
}

function validatePath(path: string): string | null {
  if (!path.trim()) return "Path is required";
  if (path.includes("..")) return 'Path cannot contain ".."';
  if (path.trim().toLowerCase() === "skill.md") return '"SKILL.md" is reserved — use a different file name';
  if (path.length > 255) return "Path must be 255 characters or fewer";
  return null;
}

/**
 * Tab-based file manager for skill supporting files.
 * Each file has a path input and a Monaco editor for content.
 */
export default function SkillFilePanel({ value, onChange, disabled = false }: Props) {
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const selected = value.length > 0 ? value[Math.min(selectedIndex, value.length - 1)] : null;
  const activeIndex = Math.min(selectedIndex, Math.max(0, value.length - 1));

  const addFile = () => {
    const next: FileEntry[] = [...value, { path: "scripts/script.sh", content: "#!/bin/bash\nset -e\n" }];
    onChange(next);
    setSelectedIndex(next.length - 1);
  };

  const removeFile = (i: number) => {
    const next = value.filter((_, idx) => idx !== i);
    onChange(next);
    setSelectedIndex(Math.min(i, Math.max(0, next.length - 1)));
  };

  const updatePath = (path: string) => {
    onChange(value.map((f, idx) => (idx === activeIndex ? { ...f, path } : f)));
  };

  const updateContent = (content: string) => {
    onChange(value.map((f, idx) => (idx === activeIndex ? { ...f, content } : f)));
  };

  return (
    <div className="flex flex-col border border-divider rounded-xl overflow-hidden">
      {/* Tab strip */}
      <div className="flex items-end gap-0 bg-default-100 border-b border-divider overflow-x-auto min-h-[36px]">
        {value.map((f, i) => (
          <div
            key={i}
            onClick={() => setSelectedIndex(i)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono cursor-pointer border-r border-divider shrink-0 transition-colors ${
              i === activeIndex
                ? "bg-content1 text-foreground border-b border-b-content1 -mb-px"
                : "text-default-400 hover:text-foreground hover:bg-default-50"
            }`}
          >
            <span className="max-w-[160px] truncate">{f.path || "unnamed"}</span>
            {!disabled && (
              <button
                className="text-default-300 hover:text-danger leading-none"
                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                aria-label={`Remove ${f.path}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            className="px-3 py-1.5 text-xs text-default-400 hover:text-primary shrink-0"
            onClick={addFile}
          >
            + Add file
          </button>
        )}
      </div>

      {/* Editor area */}
      {selected ? (
        <div className="flex flex-col">
          <div className="px-3 py-2 bg-default-50 border-b border-divider">
            {(() => {
              const pathError = validatePath(selected.path);
              return (
                <Input
                  size="sm"
                  placeholder="scripts/my-script.sh"
                  value={selected.path}
                  onValueChange={updatePath}
                  isDisabled={disabled}
                  label="File path (relative, e.g. scripts/deploy.sh)"
                  classNames={{ input: "font-mono text-xs" }}
                  isInvalid={!disabled && !!pathError}
                  errorMessage={!disabled ? (pathError ?? undefined) : undefined}
                />
              );
            })()}
          </div>
          <SkillFileEditor
            path={selected.path}
            value={selected.content}
            onChange={updateContent}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="flex items-center justify-center py-8 text-sm text-default-400">
          {disabled
            ? "No supporting files."
            : 'No supporting files yet. Click "+ Add file" to add one.'}
        </div>
      )}
    </div>
  );
}
