import { useEffect, useRef, useState } from "react";
import { Button, Chip, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Spinner, useDisclosure } from "@heroui/react";
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

  // Poll while any document is still in processing/uploading state
  const schedulePoll = (docs: Document[]) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    const needsPoll = docs.some((d) => d.status === "processing" || d.status === "uploading");
    if (needsPoll) {
      pollRef.current = setTimeout(async () => {
        const updated = await load();
        schedulePoll(updated);
      }, 3000);
    }
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
      onDeleteOpenChange();
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
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 p-4 rounded-xl border border-divider hover:border-default-300 transition-all"
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
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
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
