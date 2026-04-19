import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Button,
  Input,
  Spinner,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
} from "@heroui/react";
import type { Document, DocumentFolder } from "../types";
import {
  listDocuments,
  uploadDocument,
  deleteDocument,
  getDocumentDownloadUrl,
  listAllFolders,
  createFolder,
  listFavorites,
  addFavorite,
  removeFavorite,
  listTrash,
  restoreDocument,
  searchDocuments,
} from "../lib/api";
import { toast } from "../lib/toast";
import FolderTree from "../components/documents/FolderTree";
import DocumentGrid from "../components/documents/DocumentGrid";
import DocumentPreviewPanel from "../components/documents/DocumentPreviewPanel";

interface Props {
  projectId?: string;
}

export default function DocumentExplorer({ projectId: propProjectId }: Props = {}) {
  const params = useParams<{ projectId: string }>();
  const projectId = propProjectId ?? params.projectId;
  const navigate = useNavigate();

  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"all" | "favorites" | "recent" | "trash">("all");
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [folderTreeCollapsed, setFolderTreeCollapsed] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const { isOpen: isFolderModalOpen, onOpen: openFolderModal, onClose: closeFolderModal } = useDisclosure();

  // Build breadcrumb path from current folder
  const breadcrumbPath = useCallback(() => {
    if (!currentFolderId) return [{ id: null, name: "All Documents" }];
    const crumbs: { id: string | null; name: string }[] = [{ id: null, name: "All Documents" }];
    let fId: string | null = currentFolderId;
    const visited = new Set<string>();
    while (fId) {
      if (visited.has(fId)) break;
      visited.add(fId);
      const folder = folders.find((f) => f.id === fId);
      if (folder) {
        crumbs.push({ id: folder.id, name: folder.name });
        fId = folder.parent_folder_id ?? null;
      } else {
        break;
      }
    }
    // Reverse the trail after root since we walked upward
    const root = crumbs[0];
    const rest = crumbs.slice(1).reverse();
    return [root, ...rest];
  }, [currentFolderId, folders]);

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [foldersData, docsData, favsData] = await Promise.all([
        listAllFolders(projectId),
        listDocuments(projectId),
        listFavorites(projectId),
      ]);
      setFolders(foldersData);
      setDocuments(docsData);
      setFavoriteIds(favsData);
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle section changes
  useEffect(() => {
    if (!projectId) return;
    if (activeSection === "trash") {
      setLoading(true);
      listTrash(projectId)
        .then(setDocuments)
        .catch(() => toast.error("Failed to load trash"))
        .finally(() => setLoading(false));
    } else if (activeSection === "recent") {
      // Recent: sort by updated_at desc, show top items
      setLoading(true);
      listDocuments(projectId)
        .then((docs: Document[]) => {
          const sorted = [...docs].sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
          setDocuments(sorted.slice(0, 50));
        })
        .catch(() => toast.error("Failed to load recent documents"))
        .finally(() => setLoading(false));
    }
  }, [activeSection, projectId]);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (searchQuery.length >= 2 && projectId) {
      searchTimerRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const results = await searchDocuments(projectId, { q: searchQuery });
          setDocuments(results);
        } catch {
          toast.error("Search failed");
        } finally {
          setLoading(false);
        }
      }, 300);
    } else if (searchQuery.length === 0 && activeSection === "all") {
      loadData();
    }
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, projectId, activeSection, loadData]);

  // Filter documents based on section and folder
  const displayedDocuments = (() => {
    if (searchQuery.length >= 2) return documents;
    if (activeSection === "trash" || activeSection === "recent") return documents;
    if (activeSection === "favorites") {
      return documents.filter((d) => favoriteIds.includes(d.id));
    }
    // "all" section: filter by current folder
    if (currentFolderId) {
      return documents.filter((d) => d.folder_id === currentFolderId);
    }
    return documents.filter((d) => !d.folder_id);
  })();

  const handleSelect = (doc: Document) => setSelectedDoc(doc);

  const handleOpen = (doc: Document) => {
    navigate(`/projects/${projectId}/documents/${doc.id}`);
  };

  const handleToggleFavorite = async (doc: Document) => {
    if (!projectId) return;
    try {
      if (favoriteIds.includes(doc.id)) {
        await removeFavorite(projectId, doc.id);
        setFavoriteIds((prev) => prev.filter((id) => id !== doc.id));
        toast.success("Removed from favorites");
      } else {
        await addFavorite(projectId, doc.id);
        setFavoriteIds((prev) => [...prev, doc.id]);
        toast.success("Added to favorites");
      }
    } catch {
      toast.error("Failed to update favorite");
    }
  };

  const handleDownload = async () => {
    if (!projectId || !selectedDoc) return;
    try {
      const url = await getDocumentDownloadUrl(projectId, selectedDoc.id);
      window.open(url, "_blank");
    } catch {
      toast.error("Failed to get download link");
    }
  };

  const handleDelete = async () => {
    if (!projectId || !selectedDoc) return;
    if (!window.confirm(`Delete "${selectedDoc.name}"?`)) return;
    try {
      await deleteDocument(projectId, selectedDoc.id);
      setSelectedDoc(null);
      toast.success("Document deleted");
      await loadData();
    } catch {
      toast.error("Failed to delete document");
    }
  };

  const handleRestore = async (doc: Document) => {
    if (!projectId) return;
    try {
      await restoreDocument(projectId, doc.id);
      toast.success("Document restored");
      // Refresh trash
      const trashDocs = await listTrash(projectId);
      setDocuments(trashDocs);
      setSelectedDoc(null);
    } catch {
      toast.error("Failed to restore document");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!projectId || !e.target.files?.length) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      await uploadDocument(projectId, file);
      toast.success(`"${file.name}" uploaded`);
      await loadData();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleCreateFolder = async () => {
    if (!projectId || !newFolderName.trim()) return;
    try {
      await createFolder(projectId, { name: newFolderName.trim(), parent_folder_id: currentFolderId });
      toast.success("Folder created");
      setNewFolderName("");
      closeFolderModal();
      await loadData();
    } catch {
      toast.error("Failed to create folder");
    }
  };

  const handleFolderNavigate = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSelectedDoc(null);
    if (activeSection !== "all") setActiveSection("all");
  };

  const handleSectionChange = (section: "all" | "favorites" | "recent" | "trash") => {
    setActiveSection(section);
    setSelectedDoc(null);
    setSearchQuery("");
  };

  if (!projectId) return null;

  const crumbs = breadcrumbPath();

  return (
    <div className="flex h-full overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleUpload}
      />

      {/* Left: Folder Tree */}
      {!folderTreeCollapsed && (
        <div className="w-60 flex-shrink-0 border-r border-divider flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-divider">
            <span className="text-xs font-semibold text-default-500 uppercase tracking-wider">Explorer</span>
            <button
              onClick={() => setFolderTreeCollapsed(true)}
              className="p-1 rounded-md hover:bg-default-100 transition-colors text-default-400"
              aria-label="Collapse sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <FolderTree
              folders={folders}
              currentFolderId={currentFolderId}
              onNavigate={handleFolderNavigate}
              activeSection={activeSection}
              onSectionChange={handleSectionChange}
            />
          </div>
        </div>
      )}

      {/* Center: Document List */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-divider flex-shrink-0">
          {folderTreeCollapsed && (
            <button
              onClick={() => setFolderTreeCollapsed(false)}
              className="p-1.5 rounded-md hover:bg-default-100 transition-colors text-default-400 mr-1"
              aria-label="Expand sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          )}

          {/* Breadcrumbs */}
          <div className="flex items-center gap-1 text-sm min-w-0 flex-shrink overflow-hidden">
            {crumbs.map((crumb, i) => (
              <span key={crumb.id ?? "root"} className="flex items-center gap-1 whitespace-nowrap">
                {i > 0 && <span className="text-default-300">/</span>}
                <button
                  onClick={() => handleFolderNavigate(crumb.id as string | null)}
                  className={`hover:text-primary transition-colors truncate max-w-[120px] ${
                    i === crumbs.length - 1 ? "font-medium text-foreground" : "text-default-500"
                  }`}
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <Input
            size="sm"
            placeholder="Search documents…"
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="max-w-[200px]"
            startContent={
              <svg className="w-4 h-4 text-default-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
            isClearable
            onClear={() => setSearchQuery("")}
          />

          {/* View mode toggles */}
          <div className="flex items-center border border-divider rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 transition-colors ${viewMode === "grid" ? "bg-primary/10 text-primary" : "text-default-400 hover:bg-default-100"}`}
              aria-label="Grid view"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 transition-colors ${viewMode === "list" ? "bg-primary/10 text-primary" : "text-default-400 hover:bg-default-100"}`}
              aria-label="List view"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          {/* Upload button */}
          <Button
            size="sm"
            color="primary"
            variant="flat"
            isLoading={uploading}
            onPress={() => fileInputRef.current?.click()}
            startContent={
              !uploading && (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              )
            }
          >
            Upload
          </Button>

          {/* New Folder button */}
          <Button
            size="sm"
            variant="flat"
            onPress={openFolderModal}
            startContent={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            }
          >
            New Folder
          </Button>
        </div>

        {/* Document grid/list area */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="lg" />
            </div>
          ) : activeSection === "trash" ? (
            // Trash view with restore action
            displayedDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-default-400">
                <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <p className="text-sm font-medium">Trash is empty</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {displayedDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between px-4 py-3 border-b border-divider hover:bg-default-50 cursor-pointer"
                    onClick={() => handleSelect(doc)}
                  >
                    <span className="text-sm text-foreground">{doc.name}</span>
                    <Button size="sm" variant="flat" color="success" onPress={() => handleRestore(doc)}>
                      Restore
                    </Button>
                  </div>
                ))}
              </div>
            )
          ) : (
            <DocumentGrid
              documents={displayedDocuments}
              viewMode={viewMode}
              selectedId={selectedDoc?.id ?? null}
              favoriteIds={favoriteIds}
              onSelect={handleSelect}
              onOpen={handleOpen}
              onToggleFavorite={handleToggleFavorite}
            />
          )}
        </div>
      </div>

      {/* Right: Preview Panel */}
      {selectedDoc && (
        <div className="w-80 flex-shrink-0 border-l border-divider overflow-hidden flex flex-col">
          <div className="flex items-center justify-end px-2 py-1 border-b border-divider">
            <button
              onClick={() => setSelectedDoc(null)}
              className="p-1 rounded-md hover:bg-default-100 transition-colors text-default-400"
              aria-label="Close preview"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <DocumentPreviewPanel
              projectId={projectId}
              document={selectedDoc}
              isFavorite={favoriteIds.includes(selectedDoc.id)}
              onToggleFavorite={() => handleToggleFavorite(selectedDoc)}
              onDownload={handleDownload}
              onDelete={handleDelete}
              onOpen={() => handleOpen(selectedDoc)}
            />
          </div>
        </div>
      )}

      {/* New Folder Modal */}
      <Modal isOpen={isFolderModalOpen} onClose={closeFolderModal} size="sm">
        <ModalContent>
          <ModalHeader>New Folder</ModalHeader>
          <ModalBody>
            <Input
              label="Folder name"
              placeholder="Enter folder name"
              value={newFolderName}
              onValueChange={setNewFolderName}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
              }}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={closeFolderModal}>
              Cancel
            </Button>
            <Button color="primary" onPress={handleCreateFolder} isDisabled={!newFolderName.trim()}>
              Create
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
