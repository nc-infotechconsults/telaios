import { useState, useCallback, useEffect } from "react";
import {
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
} from "../ui";
import Editor from "@monaco-editor/react";
import {
  listDockerVolumeFiles,
  downloadDockerVolumeFile,
  getDockerVolumeFileContent,
  updateDockerVolumeFileContent,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerVolumeFileEntry, DockerVolumeFileContent } from "../../types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes === 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const EXT_LANGUAGE: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  md: "markdown",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  cs: "csharp",
  cpp: "cpp",
  c: "c",
  h: "c",
  html: "html",
  css: "css",
  scss: "scss",
  xml: "xml",
  toml: "ini",
  ini: "ini",
  conf: "ini",
  env: "ini",
  sql: "sql",
  dockerfile: "dockerfile",
  tf: "hcl",
};

function detectLanguage(filePath: string): string {
  const name = filePath.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  const ext = name.split(".").pop() ?? "";
  return EXT_LANGUAGE[ext] ?? "plaintext";
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  environmentId: string;
  volumeName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type PanelView = "browser" | "editor";

// ── Component ─────────────────────────────────────────────────────────────────

export default function DockerVolumeFileBrowserModal({
  environmentId,
  volumeName,
  isOpen,
  onOpenChange,
}: Props) {
  // ─ File browser state
  const [panelView, setPanelView] = useState<PanelView>("browser");
  const [currentPath, setCurrentPath] = useState("/");
  const [entries, setEntries] = useState<DockerVolumeFileEntry[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  // ─ Editor state
  const [fileData, setFileData] = useState<DockerVolumeFileContent | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editorContent, setEditorContent] = useState("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [openingFilePath, setOpeningFilePath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ─ Reset when modal opens/closes
  useEffect(() => {
    if (!isOpen) return;
    setPanelView("browser");
    setCurrentPath("/");
    setFileData(null);
    setEditMode(false);
  }, [isOpen]);

  const loadDir = useCallback(
    async (path: string) => {
      setBrowserLoading(true);
      setBrowserError(null);
      try {
        const files = await listDockerVolumeFiles(environmentId, volumeName, path);
        setEntries(files);
        setCurrentPath(path);
      } catch {
        setBrowserError("Failed to list files. The volume may be empty or inaccessible.");
        setEntries([]);
      } finally {
        setBrowserLoading(false);
      }
    },
    [environmentId, volumeName],
  );

  // Load root when the modal opens
  useEffect(() => {
    if (isOpen) loadDir("/");
  }, [isOpen, loadDir]);

  const handleNavigate = (path: string) => loadDir(path);

  const handleGoUp = () => {
    const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
    loadDir(parent);
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

  const handleOpenFile = async (entry: DockerVolumeFileEntry, mode: "view" | "edit") => {
    setLoadingFile(true);
    setOpeningFilePath(entry.path);
    try {
      const data = await getDockerVolumeFileContent(environmentId, volumeName, entry.path);
      setFileData(data);
      setEditorContent(data.content);
      setEditMode(mode === "edit" && data.encoding === "text");
      setPanelView("editor");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read file";
      toast.error(message);
    } finally {
      setLoadingFile(false);
      setOpeningFilePath(null);
    }
  };

  const handleBack = () => {
    setPanelView("browser");
    setFileData(null);
    setEditMode(false);
  };

  const handleSave = async () => {
    if (!fileData) return;
    setSaving(true);
    try {
      await updateDockerVolumeFileContent(environmentId, volumeName, fileData.path, editorContent);
      toast.success("File saved");
      setFileData((prev) => prev ? { ...prev, content: editorContent } : prev);
      setEditMode(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save file";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // ─ Breadcrumb segments for current browser path
  const segments = currentPath.split("/").filter(Boolean);
  const breadcrumbs = [
    { label: "/", path: "/" },
    ...segments.map((seg, i) => ({
      label: seg,
      path: "/" + segments.slice(0, i + 1).join("/"),
    })),
  ];

  // ─ Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="5xl"
      scrollBehavior="inside"
      classNames={{ base: "max-h-[90vh]", body: "p-0" }}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-0 pb-2">
              <span className="text-sm font-semibold font-mono">{volumeName}</span>
              {panelView === "browser" ? (
                <span className="text-xs text-default-400 font-normal">File Browser</span>
              ) : (
                <span className="text-xs text-default-400 font-mono font-normal truncate">
                  {fileData?.path ?? ""}
                </span>
              )}
            </ModalHeader>

            <ModalBody>
              {panelView === "browser" ? (
                <div className="flex flex-col gap-0 px-4 py-2">
                  {/* Breadcrumb */}
                  <div className="flex items-center flex-wrap gap-0.5 text-xs font-mono py-2 border-b border-divider mb-1">
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

                  {/* Go up */}
                  {currentPath !== "/" && (
                    <button
                      className="flex items-center gap-1 text-xs text-default-400 hover:text-default-700 transition-colors w-fit py-1 px-1"
                      onClick={handleGoUp}
                    >
                      <span>↑</span>
                      <span>..</span>
                    </button>
                  )}

                  {/* File listing */}
                  {browserLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Spinner size="sm" label="Loading files…" />
                    </div>
                  ) : browserError ? (
                    <p className="text-xs text-danger py-4">{browserError}</p>
                  ) : entries.length === 0 ? (
                    <p className="text-xs text-default-400 py-4">Empty directory</p>
                  ) : (
                    <div className="flex flex-col">
                      {entries.map((entry) => (
                        <div
                          key={entry.path}
                          className="flex items-center justify-between gap-2 py-1.5 px-1 rounded hover:bg-default-50 group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <i className={`fa-solid ${entry.type === "directory" ? "fa-folder" : "fa-file"} text-default-400 text-xs flex-shrink-0`} aria-hidden="true" />
                            {entry.type === "directory" ? (
                              <button
                                className="text-xs font-mono text-primary truncate"
                                onClick={() => handleNavigate(entry.path)}
                              >
                                {entry.name}
                              </button>
                            ) : (
                              <span className="text-xs font-mono text-default-700 truncate">
                                {entry.name}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-xs text-default-400 w-16 text-right">
                              {formatSize(entry.size)}
                            </span>

                            {entry.type === "file" && (
                              <>
                                {/* View */}
                                <Button
                                  size="sm"
                                  variant="flat"
                                  isIconOnly
                                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 min-w-0 text-xs"
                                  title="View"
                                  isLoading={loadingFile && openingFilePath === entry.path}
                                  onPress={() => handleOpenFile(entry, "view")}
                                >
                                  <i className="fa-solid fa-eye" aria-hidden="true" />
                                </Button>
                                {/* Edit */}
                                <Button
                                  size="sm"
                                  variant="flat"
                                  isIconOnly
                                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 min-w-0 text-xs"
                                  title="Edit"
                                  isLoading={loadingFile && openingFilePath === entry.path}
                                  onPress={() => handleOpenFile(entry, "edit")}
                                >
                                  <i className="fa-solid fa-pen" aria-hidden="true" />
                                </Button>
                                {/* Download */}
                                <Button
                                  size="sm"
                                  variant="flat"
                                  isIconOnly
                                  className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 min-w-0 text-xs"
                                  title="Download"
                                  isLoading={downloading === entry.path}
                                  onPress={() => handleDownload(entry)}
                                >
                                  ↓
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* ─ Editor panel ─────────────────────────────────────────── */
                <div className="flex flex-col h-[65vh]">
                  {loadingFile || !fileData ? (
                    <div className="flex items-center justify-center h-full">
                      <Spinner size="sm" label="Loading file…" />
                    </div>
                  ) : fileData.encoding === "binary" ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-default-500">
                      <i className="fa-solid fa-lock" aria-hidden="true" style={{ fontSize: 28 }} />
                      <p className="text-sm">Binary file — download only</p>
                      <p className="text-xs text-default-400">
                        {formatSize(fileData.size)}
                      </p>
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() =>
                          handleDownload({
                            path: fileData.path,
                            name: fileData.path.split("/").pop() ?? "",
                            type: "file",
                            size: fileData.size,
                            modified: "",
                          })
                        }
                      >
                        Download
                      </Button>
                    </div>
                  ) : (
                    <Editor
                      height="100%"
                      language={detectLanguage(fileData.path)}
                      value={editorContent}
                      onChange={(val) => setEditorContent(val ?? "")}
                      options={{
                        readOnly: !editMode,
                        minimap: { enabled: false },
                        fontSize: 12,
                        wordWrap: "on",
                        scrollBeyondLastLine: false,
                        renderLineHighlight: editMode ? "all" : "none",
                      }}
                      theme="vs-dark"
                    />
                  )}
                </div>
              )}
            </ModalBody>

            <ModalFooter className="justify-between gap-2">
              {panelView === "browser" ? (
                <div className="flex w-full justify-end">
                  <Button size="sm" variant="flat" onPress={onClose}>
                    Close
                  </Button>
                </div>
              ) : (
                <>
                  <Button size="sm" variant="flat" onPress={handleBack}>
                    ← Back
                  </Button>
                  <div className="flex gap-2">
                    {fileData?.encoding === "text" && !editMode && (
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => setEditMode(true)}
                      >
                        Edit
                      </Button>
                    )}
                    {editMode && (
                      <>
                        <Button
                          size="sm"
                          variant="flat"
                          onPress={() => {
                            setEditorContent(fileData?.content ?? "");
                            setEditMode(false);
                          }}
                        >
                          Discard
                        </Button>
                        <Button
                          size="sm"
                          color="primary"
                          isLoading={saving}
                          onPress={handleSave}
                        >
                          Save
                        </Button>
                      </>
                    )}
                    {fileData && (
                      <Button
                        size="sm"
                        variant="flat"
                        isLoading={downloading === fileData.path}
                        onPress={() =>
                          handleDownload({
                            path: fileData.path,
                            name: fileData.path.split("/").pop() ?? "",
                            type: "file",
                            size: fileData.size,
                            modified: "",
                          })
                        }
                      >
                        Download
                      </Button>
                    )}
                  </div>
                </>
              )}
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
