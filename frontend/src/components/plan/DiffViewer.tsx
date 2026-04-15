import Editor, { loader } from "@monaco-editor/react";

// Use a CDN that doesn't require a bundler plugin
loader.config({ paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs" } });

interface Props {
  content: string;
  title?: string;
}

/**
 * Renders a unified diff string with Monaco Editor syntax highlighting.
 * Uses the built-in "diff" language for proper +/- line colouring.
 */
export default function DiffViewer({ content, title }: Props) {
  const hasContent = content.trim().length > 0;

  return (
    <div className="flex flex-col gap-2">
      {title && (
        <p className="text-[11px] text-default-400 uppercase tracking-wide">{title}</p>
      )}
      {hasContent ? (
        <div className="rounded-lg overflow-hidden border border-default-200" style={{ height: 400 }}>
          <Editor
            defaultLanguage="diff"
            value={content}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              lineNumbers: "on",
              wordWrap: "off",
              folding: false,
              renderLineHighlight: "none",
              scrollbar: { vertical: "auto", horizontal: "auto" },
            }}
          />
        </div>
      ) : (
        <p className="text-xs text-default-400 italic py-2">No diff available.</p>
      )}
    </div>
  );
}
