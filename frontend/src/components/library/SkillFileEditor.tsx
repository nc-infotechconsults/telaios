import Editor from "@monaco-editor/react";

function getLanguage(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    sh: "shell",
    bash: "shell",
    md: "markdown",
    markdown: "markdown",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    html: "html",
    css: "css",
    sql: "sql",
    toml: "ini",
    ini: "ini",
    txt: "plaintext",
    xml: "xml",
    rs: "rust",
    go: "go",
    rb: "ruby",
    java: "java",
  };
  return map[ext] ?? "plaintext";
}

interface Props {
  path: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  height?: string;
}

/**
 * Monaco editor wrapper with automatic language detection from file extension.
 */
export default function SkillFileEditor({
  path,
  value,
  onChange,
  disabled = false,
  height = "220px",
}: Props) {
  return (
    <Editor
      height={height}
      language={getLanguage(path)}
      value={value}
      onChange={(v) => onChange(v ?? "")}
      options={{
        readOnly: disabled,
        minimap: { enabled: false },
        fontSize: 12,
        lineNumbers: "on",
        scrollBeyondLastLine: false,
        wordWrap: "on",
        automaticLayout: true,
        padding: { top: 8, bottom: 8 },
      }}
      theme="vs-dark"
    />
  );
}
