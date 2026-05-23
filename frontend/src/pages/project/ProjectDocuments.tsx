import { useEffect, useState } from "react";
import { listDocuments, listAllFolders } from "../../lib/api";
import type { Document, DocumentFolder } from "../../types";

const FILE_ICONS: Record<string, string> = {
  pdf: "📄",
  docx: "📝",
  md: "📋",
  xlsx: "📊",
  txt: "📃",
  image: "🖼",
  other: "📁",
};

function buildTree(folders: DocumentFolder[]): DocumentFolder & { children: DocumentFolder[] } {
  const map: Record<string, DocumentFolder & { children: DocumentFolder[] }> = {};
  folders.forEach((f) => { map[f.id] = { ...f, children: [] }; });
  const roots: (DocumentFolder & { children: DocumentFolder[] })[] = [];
  folders.forEach((f) => {
    if (f.parent_folder_id && map[f.parent_folder_id]) {
      map[f.parent_folder_id].children.push(map[f.id]);
    } else {
      roots.push(map[f.id]);
    }
  });
  return { id: "__root__", project_id: "", name: "Root", path: "/", parent_folder_id: null, created_by: null, created_at: "", updated_at: "", children: roots };
}

function FolderNode({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: DocumentFolder & { children: DocumentFolder[] };
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);

  if (node.id === "__root__") {
    return (
      <div>
        {node.children.map((c) => (
          <FolderNode key={c.id} node={c as DocumentFolder & { children: DocumentFolder[] }} depth={depth} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => { setExpanded((e) => !e); onSelect(node.id); }}
        aria-expanded={expanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: `5px ${8 + depth * 12}px`,
          background: selectedId === node.id ? "var(--hover-glass)" : "none",
          border: "none",
          borderLeft: selectedId === node.id ? "2px solid #0a84ff" : "2px solid transparent",
          cursor: "pointer",
          color: selectedId === node.id ? "var(--label-primary)" : "var(--label-secondary)",
          fontSize: 12,
          fontWeight: selectedId === node.id ? 500 : 400,
          textAlign: "left",
        }}
      >
        <span aria-hidden="true">{expanded ? "▾" : "▸"}</span>
        <span aria-hidden="true">📂</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
      </button>
      {expanded && node.children.map((c) => (
        <FolderNode key={c.id} node={c as DocumentFolder & { children: DocumentFolder[] }} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

export default function ProjectDocuments({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<Document[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([listDocuments(projectId), listAllFolders(projectId)])
      .then(([d, f]) => { setDocs(d); setFolders(f); })
      .finally(() => setLoading(false));
  }, [projectId]);

  const tree = buildTree(folders);

  const filteredDocs = docs.filter((d) => {
    const matchesFolder = selectedFolder ? d.folder_id === selectedFolder : true;
    const matchesSearch = !search || d.name.toLowerCase().includes(search.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Folder tree */}
      <div
        style={{
          width: 200,
          borderRight: "0.5px solid var(--hairline)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "10px 12px", borderBottom: "0.5px solid var(--hairline)" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            aria-label="Search documents"
            style={{
              width: "100%",
              padding: "6px 10px",
              borderRadius: 8,
              background: "var(--fill-tertiary)",
              border: "0.5px solid var(--glass-edge)",
              color: "var(--label-primary)",
              fontSize: 12,
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>
        <nav aria-label="Folder tree" style={{ flex: 1, overflowY: "auto", paddingTop: 4 }}>
          {/* All documents option */}
          <button
            onClick={() => setSelectedFolder(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              width: "100%",
              padding: "5px 10px",
              background: selectedFolder === null ? "var(--hover-glass)" : "none",
              border: "none",
              borderLeft: selectedFolder === null ? "2px solid #0a84ff" : "2px solid transparent",
              cursor: "pointer",
              color: selectedFolder === null ? "var(--label-primary)" : "var(--label-secondary)",
              fontSize: 12,
              fontWeight: selectedFolder === null ? 500 : 400,
              textAlign: "left",
            }}
          >
            <span aria-hidden="true">📁</span>
            <span>All documents</span>
          </button>
          <FolderNode node={tree} depth={0} selectedId={selectedFolder} onSelect={setSelectedFolder} />
        </nav>
      </div>

      {/* Document list */}
      <div
        style={{
          flex: 1,
          borderRight: "0.5px solid var(--hairline)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px 8px", borderBottom: "0.5px solid var(--hairline)", flexShrink: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--label-secondary)" }}>
            {filteredDocs.length} document{filteredDocs.length !== 1 ? "s" : ""}
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 52, borderRadius: 10, background: "var(--fill-quaternary)" }} aria-hidden="true" />
            ))}
          </div>
        ) : filteredDocs.length === 0 ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "var(--label-tertiary)" }}>
            <span style={{ fontSize: 32 }}>📁</span>
            <p style={{ fontSize: 13, margin: 0 }}>No documents found</p>
          </div>
        ) : (
          <ul
            style={{ flex: 1, overflowY: "auto", margin: 0, padding: "8px", listStyle: "none" }}
            role="listbox"
            aria-label="Documents"
          >
            {filteredDocs.map((doc) => (
              <li key={doc.id} role="option" aria-selected={selectedDoc?.id === doc.id}>
                <button
                  onClick={() => setSelectedDoc(doc)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "9px 10px",
                    borderRadius: 10,
                    background: selectedDoc?.id === doc.id ? "var(--hover-glass)" : "none",
                    border: "none",
                    borderLeft: selectedDoc?.id === doc.id ? "2px solid #0a84ff" : "2px solid transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--label-primary)",
                    marginBottom: 1,
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }} aria-hidden="true">
                    {FILE_ICONS[doc.file_type] ?? FILE_ICONS.other}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
                    <div style={{ fontSize: 10, color: "var(--label-tertiary)", marginTop: 1 }}>
                      {doc.status} · {doc.size_bytes ? `${Math.round(doc.size_bytes / 1024)} KB` : "—"}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Preview pane */}
      <div style={{ flex: 1.5, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selectedDoc ? (
          <>
            <div style={{ padding: "12px 18px", borderBottom: "0.5px solid var(--hairline)", flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 22 }} aria-hidden="true">{FILE_ICONS[selectedDoc.file_type] ?? FILE_ICONS.other}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--label-primary)" }}>{selectedDoc.name}</div>
                <div style={{ fontSize: 11, color: "var(--label-tertiary)" }}>
                  {selectedDoc.mime_type} · {selectedDoc.size_bytes ? `${Math.round(selectedDoc.size_bytes / 1024)} KB` : "—"}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ textAlign: "center", color: "var(--label-tertiary)" }}>
                <span style={{ fontSize: 48, display: "block", marginBottom: 16 }} aria-hidden="true">
                  {FILE_ICONS[selectedDoc.file_type] ?? FILE_ICONS.other}
                </span>
                <p style={{ fontSize: 14, margin: 0, color: "var(--label-secondary)" }}>{selectedDoc.name}</p>
                <p style={{ fontSize: 12, margin: "8px 0 0" }}>Status: {selectedDoc.status}</p>
                <p style={{ fontSize: 11, margin: "4px 0 0" }}>Upload a file or view it in the document viewer</p>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: "var(--label-tertiary)" }}>
            <span style={{ fontSize: 36 }} aria-hidden="true">⎕</span>
            <p style={{ fontSize: 13, margin: 0 }}>Select a document to preview</p>
          </div>
        )}
      </div>
    </div>
  );
}
