import { useEffect, useRef, useState } from "react";
import { Button, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Spinner, useDisclosure } from "../ui";
import type { Document } from "../../types";
import { listDocuments, uploadDocument, deleteDocument, getDocumentDownloadUrl } from "../../lib/api";
import { toast } from "../../lib/toast";

interface Props {
  projectId: string;
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

export default function DocumentsTab({ projectId }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docToDelete, setDocToDelete] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollAttemptsRef = useRef(0);
  const MAX_POLL_ATTEMPTS = 40; // ~2 minutes at 3 s intervals

  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();

  const load = async () => {
    try {
      const docs = await listDocuments(projectId);
      setDocuments(docs);
      return docs;
    } catch {
      toast.error("Failed to load documents");
      return [];
    }
  };

  // Poll while any document is still in processing/uploading state.
  // Stops automatically once all docs are settled or after MAX_POLL_ATTEMPTS.
  const schedulePoll = (docs: Document[]) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    const needsPoll = docs.some((d) => d.status === "processing" || d.status === "uploading");
    if (!needsPoll) {
      pollAttemptsRef.current = 0;
      return;
    }
    if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
      pollAttemptsRef.current = 0;
      toast.error("Document processing timed out");
      return;
    }
    pollAttemptsRef.current += 1;
    pollRef.current = setTimeout(async () => {
      const updated = await load();
      schedulePoll(updated);
    }, 3000);
  };

  useEffect(() => {
    setLoading(true);
    load()
      .then(schedulePoll)
      .finally(() => setLoading(false));

    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-uploaded if needed
    e.target.value = "";

    setUploading(true);
    try {
      const doc = await uploadDocument(projectId, file);
      setDocuments((prev) => [doc, ...prev]);
      toast.success("Upload started", doc.name);
      // Start polling since the new doc is processing
      schedulePoll([doc]);
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const url = await getDocumentDownloadUrl(projectId, doc.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Failed to get download link");
    }
  };

  const handleDelete = async () => {
    if (!docToDelete) return;
    setDeleting(true);
    try {
      await deleteDocument(projectId, docToDelete.id);
      setDocuments((prev) => prev.filter((d) => d.id !== docToDelete.id));
      toast.success("Document deleted", docToDelete.name);
      onDeleteOpenChange(false);
      setDocToDelete(null);
    } catch {
      toast.error("Failed to delete document");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" label="Loading documents…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Upload area */}
      <div
        className="border-2 border-dashed border-divider rounded-xl p-8 flex flex-col items-center gap-3 text-default-400 hover:border-primary/50 hover:bg-default-50 transition-all cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          const input = fileInputRef.current;
          if (!input) return;
          // Simulate change event via DataTransfer
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }}
      >
        {uploading ? (
          <Spinner size="sm" label="Uploading…" />
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm">Drop a file here or <span className="text-primary underline">browse</span></p>
            <p className="text-xs">PDF, DOCX, TXT, MD, CSV, JSON, XLSX</p>
          </>
        )}
        <input
          ref={fileInputRef}
          id="doc-upload-trigger"
          type="file"
          className="hidden"
          accept=".pdf,.docx,.doc,.txt,.md,.csv,.json,.xlsx"
          onChange={handleFileChange}
        />
      </div>

      {/* Document list */}
      {documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
          <p className="text-lg">No documents yet</p>
          <p className="text-sm">Upload files to give your agents project knowledge.</p>
        </div>
      ) : (
        <div className="apple-card overflow-hidden flex flex-col divide-y divide-default-100/60">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="apple-list-item flex items-center gap-3 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-sm">{doc.name}</p>
                <p className="text-xs text-default-400 mt-0.5">
                  {formatBytes(doc.size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}
                </p>
                {doc.status === "error" && doc.error_message && (
                  <p className="text-xs text-danger mt-1 truncate" title={doc.error_message}>
                    {doc.error_message}
                  </p>
                )}
              </div>

              <Chip
                size="sm"
                variant="flat"
                color={STATUS_COLOR[doc.status] ?? "default"}
                startContent={
                  doc.status === "processing" || doc.status === "uploading"
                    ? <Spinner size="sm" className="mr-1" />
                    : undefined
                }
              >
                {doc.status}
              </Chip>

              {doc.status === "ready" && (
                <Button
                  size="sm"
                  variant="light"
                  aria-label={`Download ${doc.name}`}
                  onPress={() => handleDownload(doc)}
                >
                  Download
                </Button>
              )}

              <Button
                isIconOnly
                size="sm"
                variant="light"
                color="danger"
                aria-label={`Delete ${doc.name}`}
                onPress={() => {
                  setDocToDelete(doc);
                  onDeleteOpen();
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <Modal isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Delete Document</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Delete <span className="font-semibold">{docToDelete?.name}</span>? This will also remove all associated knowledge chunks. This action cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={deleting}>
                  Cancel
                </Button>
                <Button color="danger" onPress={handleDelete} isLoading={deleting}>
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
