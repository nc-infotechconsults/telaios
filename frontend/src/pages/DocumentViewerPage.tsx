/**
 * DocumentViewerPage — full-page document viewer/editor accessible at:
 *   /projects/:projectId/documents/:documentId
 *
 * Features:
 *  - Loads the document metadata and presigned download URL
 *  - Renders inline preview via DocumentViewer (PDF, MD, DOCX, XLSX, code, images)
 *  - Top bar: breadcrumb, download, back, delete
 *  - Right sidebar: Copilot Q&A / summarize + document details
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Chip, Input, Spinner, Tooltip } from "@heroui/react";
import type { Document } from "../types";
import {
  getDocument,
  getDocumentDownloadUrl,
  deleteDocument,
  copilotSummarize,
  copilotAsk,
  type CopilotSummarizeResult,
  type CopilotAskResult,
} from "../lib/api";
import { toast } from "../lib/toast";
import DocumentViewer from "../components/documents/DocumentViewer";
import DocumentEditor from "../components/documents/DocumentEditor";
import FileTypeIcon from "../components/documents/FileTypeIcon";

const EDITABLE_TYPES = new Set(["md", "txt", "csv", "json"]);

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

export default function DocumentViewerPage() {
  const { projectId, documentId } = useParams<{ projectId: string; documentId: string }>();
  const navigate = useNavigate();

  const [doc, setDoc] = useState<Document | null>(null);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Copilot sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"details" | "copilot">("details");
  const [copilotQuestion, setCopilotQuestion] = useState("");
  const [copilotAnswer, setCopilotAnswer] = useState<CopilotAskResult | null>(null);
  const [summary, setSummary] = useState<CopilotSummarizeResult | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  // Edit mode (only for editable file types)
  const [editMode, setEditMode] = useState(false);

  const loadDocument = useCallback(async () => {
    if (!projectId || !documentId) return;
    setLoading(true);
    setError(null);
    try {
      const [docData, url] = await Promise.all([
        getDocument(projectId, documentId),
        getDocumentDownloadUrl(projectId, documentId),
      ]);
      setDoc(docData);
      setPresignedUrl(url);
    } catch {
      setError("Failed to load document");
    } finally {
      setLoading(false);
    }
  }, [projectId, documentId]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  const handleDownload = useCallback(() => {
    if (presignedUrl) {
      const a = window.document.createElement("a");
      a.href = presignedUrl;
      a.download = doc?.name ?? "document";
      a.click();
    }
  }, [presignedUrl, doc]);

  const handleDelete = useCallback(async () => {
    if (!projectId || !documentId || !doc) return;
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
    try {
      await deleteDocument(projectId, documentId);
      toast.success("Document deleted");
      navigate(`/projects/${projectId}`);
    } catch {
      toast.error("Failed to delete document");
    }
  }, [projectId, documentId, doc, navigate]);

  const handleSummarize = useCallback(async () => {
    if (!projectId || !documentId) return;
    setCopilotLoading(true);
    setSummary(null);
    setCopilotAnswer(null);
    try {
      const result = await copilotSummarize(projectId, documentId);
      setSummary(result);
    } catch {
      toast.error("Summarize failed — ensure the document is processed and a Copilot agent is configured");
    } finally {
      setCopilotLoading(false);
    }
  }, [projectId, documentId]);

  const handleAsk = useCallback(async () => {
    if (!projectId || !documentId || !copilotQuestion.trim()) return;
    setCopilotLoading(true);
    setSummary(null);
    setCopilotAnswer(null);
    try {
      const result = await copilotAsk(projectId, documentId, copilotQuestion.trim());
      setCopilotAnswer(result);
    } catch {
      toast.error("Q&A failed — ensure the document is processed and a Copilot agent is configured");
    } finally {
      setCopilotLoading(false);
    }
  }, [projectId, documentId, copilotQuestion]);

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !doc || !presignedUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-default-400">
        <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <p className="text-sm font-medium">{error ?? "Document not found"}</p>
        <Button size="sm" variant="flat" onPress={() => navigate(-1)}>Go back</Button>
      </div>
    );
  }

  // ── Rendered page ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-divider bg-content1 flex-shrink-0">
        {/* Back */}
        <Button
          size="sm"
          variant="light"
          isIconOnly
          onPress={() => navigate(`/projects/${projectId}`)}
          aria-label="Back to project"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </Button>

        {/* File icon + name + chip */}
        <FileTypeIcon fileType={doc.file_type} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-foreground truncate">{doc.name}</h1>
            <Chip size="sm" variant="flat" color={STATUS_COLOR[doc.status] ?? "default"} className="flex-shrink-0">
              {doc.status}
            </Chip>
          </div>
          <p className="text-[10px] text-default-400">{formatBytes(doc.size_bytes)} · {doc.file_type.toUpperCase()}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Edit / Preview toggle (only for editable file types) */}
          {doc.status === "ready" && EDITABLE_TYPES.has(doc.file_type) && (
            <Tooltip content={editMode ? "Switch to Preview" : "Edit document"}>
              <Button
                size="sm"
                variant={editMode ? "solid" : "flat"}
                color={editMode ? "primary" : "default"}
                onPress={() => setEditMode((m) => !m)}
                aria-label={editMode ? "Switch to preview" : "Edit document"}
              >
                {editMode ? "Preview" : "Edit"}
              </Button>
            </Tooltip>
          )}
          <Tooltip content="Download">
            <Button size="sm" variant="flat" isIconOnly onPress={handleDownload} aria-label="Download">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </Button>
          </Tooltip>
          <Tooltip content="Delete">
            <Button size="sm" variant="flat" color="danger" isIconOnly onPress={handleDelete} aria-label="Delete">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </Button>
          </Tooltip>

          {/* Toggle sidebar */}
          <Tooltip content={sidebarOpen ? "Hide sidebar" : "Show sidebar"}>
            <Button
              size="sm"
              variant={sidebarOpen ? "flat" : "light"}
              isIconOnly
              onPress={() => setSidebarOpen((o) => !o)}
              aria-label="Toggle sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
              </svg>
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* ── Main body ───────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Document viewer area */}
        <div className="flex-1 overflow-auto bg-background">
          {doc.status === "processing" || doc.status === "uploading" ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-default-400">
              <Spinner size="lg" />
              <p className="text-sm">Document is still processing…</p>
              <Button size="sm" variant="flat" onPress={loadDocument}>Refresh</Button>
            </div>
          ) : editMode && EDITABLE_TYPES.has(doc.file_type) ? (
            <DocumentEditor
              url={presignedUrl}
              fileType={doc.file_type}
              projectId={projectId!}
              documentId={documentId!}
              onSaved={loadDocument}
            />
          ) : (
            <DocumentViewer
              url={presignedUrl}
              mimeType={doc.mime_type}
              fileType={doc.file_type}
              fileName={doc.name}
            />
          )}
        </div>

        {/* ── Right Sidebar ───────────────────────────────────────────────── */}
        {sidebarOpen && (
          <div className="w-80 border-l border-divider bg-content1 flex flex-col flex-shrink-0 overflow-hidden">
            {/* Sidebar tabs */}
            <div className="flex border-b border-divider">
              {(["details", "copilot"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSidebarTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-medium capitalize transition-colors border-b-2 ${
                    sidebarTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-default-400 hover:text-foreground"
                  }`}
                >
                  {tab === "copilot" ? "✨ Copilot" : "Details"}
                </button>
              ))}
            </div>

            {/* Details tab */}
            {sidebarTab === "details" && (
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                <DetailRow label="Name">{doc.name}</DetailRow>
                <DetailRow label="Type">{doc.file_type.toUpperCase()}</DetailRow>
                <DetailRow label="Size">{formatBytes(doc.size_bytes)}</DetailRow>
                <DetailRow label="Status">
                  <Chip size="sm" variant="flat" color={STATUS_COLOR[doc.status] ?? "default"}>
                    {doc.status}
                  </Chip>
                </DetailRow>
                <DetailRow label="Created">{formatDate(doc.created_at)}</DetailRow>
                <DetailRow label="Modified">{formatDate(doc.updated_at)}</DetailRow>
                {doc.mime_type && <DetailRow label="MIME">{doc.mime_type}</DetailRow>}
                {doc.error_message && (
                  <div className="p-3 rounded-lg bg-danger-50 border border-danger-200">
                    <p className="text-xs text-danger font-medium">Error</p>
                    <p className="text-xs text-danger mt-1">{doc.error_message}</p>
                  </div>
                )}
              </div>
            )}

            {/* Copilot tab */}
            {sidebarTab === "copilot" && (
              <div className="flex-1 overflow-y-auto flex flex-col">
                {/* Suggested prompts */}
                <div className="p-3 border-b border-divider">
                  <p className="text-[10px] text-default-400 uppercase tracking-wider mb-2">Quick actions</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["Summarize", "Find action items", "List key decisions", "Extract entities"].map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => {
                          if (prompt === "Summarize") {
                            handleSummarize();
                          } else {
                            setCopilotQuestion(prompt);
                          }
                        }}
                        className="text-[10px] px-2 py-1 rounded-full bg-default-100 hover:bg-primary hover:text-primary-foreground transition-colors text-default-600"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Q&A input */}
                <div className="p-3 border-b border-divider">
                  <div className="flex gap-2">
                    <Input
                      size="sm"
                      placeholder="Ask a question about this document…"
                      value={copilotQuestion}
                      onValueChange={setCopilotQuestion}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAsk(); }}
                      classNames={{ inputWrapper: "text-xs" }}
                    />
                    <Button
                      size="sm"
                      color="primary"
                      variant="flat"
                      isLoading={copilotLoading}
                      onPress={handleAsk}
                      isDisabled={!copilotQuestion.trim()}
                    >
                      Ask
                    </Button>
                  </div>
                </div>

                {/* Results */}
                <div className="flex-1 overflow-y-auto p-3">
                  {copilotLoading && (
                    <div className="flex items-center gap-2 py-4">
                      <Spinner size="sm" />
                      <span className="text-xs text-default-400">Thinking…</span>
                    </div>
                  )}

                  {summary && !copilotLoading && (
                    <div className="flex flex-col gap-3">
                      <div className="p-3 rounded-lg bg-primary-50 border border-primary-200">
                        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-2">Summary</p>
                        <p className="text-xs text-foreground leading-relaxed">{summary.summary}</p>
                      </div>
                      {summary.key_points.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-default-400 uppercase tracking-wider mb-1.5">Key Points</p>
                          <ul className="flex flex-col gap-1.5">
                            {summary.key_points.map((pt, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-foreground">
                                <span className="text-primary mt-0.5 flex-shrink-0">•</span>
                                {pt}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {summary.word_count > 0 && (
                        <p className="text-[10px] text-default-400">{summary.word_count.toLocaleString()} words</p>
                      )}
                    </div>
                  )}

                  {copilotAnswer && !copilotLoading && (
                    <div className="flex flex-col gap-3">
                      <div className="p-3 rounded-lg bg-success-50 border border-success-200">
                        <p className="text-[10px] font-semibold text-success uppercase tracking-wider mb-2">Answer</p>
                        <p className="text-xs text-foreground leading-relaxed">{copilotAnswer.answer}</p>
                        {copilotAnswer.confidence > 0 && (
                          <p className="text-[10px] text-default-400 mt-2">
                            Confidence: {Math.round(copilotAnswer.confidence * 100)}%
                          </p>
                        )}
                      </div>
                      {copilotAnswer.sources.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-default-400 uppercase tracking-wider mb-1.5">Sources</p>
                          <ul className="flex flex-col gap-1">
                            {copilotAnswer.sources.map((s, i) => (
                              <li key={i} className="text-[10px] text-default-500 font-mono truncate">{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {!copilotLoading && !summary && !copilotAnswer && (
                    <div className="flex flex-col items-center justify-center py-10 gap-2 text-default-400">
                      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                      </svg>
                      <p className="text-xs text-center">Ask a question or click Summarize to get AI insights about this document</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs text-default-400 flex-shrink-0">{label}</span>
      <div className="text-xs text-foreground text-right max-w-[65%] truncate">{children}</div>
    </div>
  );
}
