/**
 * DocumentEditor — In-browser Monaco editor for text-based documents.
 *
 * Editable file types: md, txt, csv, json
 *
 * Behaviour:
 *  - Fetches the raw content from the presigned URL on mount.
 *  - Monaco Editor renders in edit mode (not read-only).
 *  - "Save" button PUTs the modified content to the API (`PUT /content`).
 *  - "Discard" resets to the original fetched content.
 *  - Dirty-state indicator ("•") in the toolbar when unsaved changes exist.
 *  - Monaco is lazy-loaded so it doesn't bloat the initial bundle.
 */
import { useEffect, useState } from "react";
import { Button, Chip } from "@heroui/react";
import { updateDocumentContent } from "../../lib/api";
import { toast } from "../../lib/toast";

const EDITABLE_TYPES = new Set(["md", "txt", "csv", "json"]);

function langFromType(fileType: string): string {
  switch (fileType) {
    case "md": return "markdown";
    case "json": return "json";
    case "csv": return "plaintext";
    default: return "plaintext";
  }
}

// Lazy-loaded Monaco Editor component type
type MonacoEditorComponent = React.ComponentType<{
  value: string;
  language: string;
  theme: string;
  options: Record<string, unknown>;
  height: string;
  onChange?: (value: string | undefined) => void;
}>;

interface Props {
  url: string;
  fileType: string;
  projectId: string;
  documentId: string;
  onSaved?: () => void;
}

export default function DocumentEditor({ url, fileType, projectId, documentId, onSaved }: Props) {
  const [original, setOriginal] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [MonacoEditor, setMonacoEditor] = useState<MonacoEditorComponent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDirty = original !== null && content !== original;

  // Load Monaco lazily
  useEffect(() => {
    import("@monaco-editor/react").then((mod) => {
      setMonacoEditor(() => mod.default as MonacoEditorComponent);
    }).catch(() => {});
  }, []);

  // Fetch document content
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        if (!cancelled) {
          setOriginal(text);
          setContent(text);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [url]);

  const handleSave = async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      await updateDocumentContent(projectId, documentId, content);
      setOriginal(content);
      toast.success("Document saved");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (original !== null) {
      setContent(original);
    }
  };

  if (!EDITABLE_TYPES.has(fileType)) {
    return (
      <div className="flex items-center justify-center h-full text-default-400 text-sm">
        <span>{fileType.toUpperCase()} files cannot be edited in-browser.</span>
      </div>
    );
  }

  if (loading || !MonacoEditor) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-default-400 text-sm animate-pulse">Loading editor…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-danger text-sm">
        <span>Failed to load content: {error}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-divider bg-content1 flex-shrink-0">
        <span className="text-xs text-default-400 flex-1">
          {fileType.toUpperCase()} Editor
          {isDirty && (
            <Chip size="sm" color="warning" variant="flat" className="ml-2 text-xs">
              Unsaved changes
            </Chip>
          )}
        </span>
        <Button
          size="sm"
          variant="flat"
          onPress={handleDiscard}
          isDisabled={!isDirty || saving}
        >
          Discard
        </Button>
        <Button
          size="sm"
          color="primary"
          onPress={handleSave}
          isLoading={saving}
          isDisabled={!isDirty}
        >
          Save
        </Button>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <MonacoEditor
          height="100%"
          language={langFromType(fileType)}
          value={content}
          theme="vs-dark"
          onChange={(val) => setContent(val ?? "")}
          options={{
            readOnly: false,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 13,
            lineNumbers: "on",
            wordWrap: "on",
            folding: true,
            renderLineHighlight: "line",
            overviewRulerLanes: 0,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
