import { useState, useEffect, useRef } from "react";
import { Icon } from "../../components/Icon";
import { listDocuments, listAllFolders, uploadDocument } from "../../lib/api";
import type { Document as ApiDocument, DocumentFolder } from "../../types";

const DEMO = import.meta.env.VITE_DEMO_MODE === "true";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocNode {
  type: "doc";
  id: string;
  name: string;
  ext: string;
  size: string;
  pages: number;
  status: string;
  words: string;
  uploaded: string;
  time: string;
  tag: string;
  progress?: number;
  preview?: {
    title: string;
    author: string;
    updated: string;
    body: Array<{ h?: string; p?: string; cite?: string }>;
  };
}

interface FolderNode {
  type: "folder";
  id: string;
  name: string;
  color: string;
  children: TreeNode[];
}

type TreeNode = DocNode | FolderNode;

// ─── Mock data ────────────────────────────────────────────────────────────────

const DOC_TYPE_INFO: Record<string, { color: string; label: string }> = {
  pdf:        { color: "#ff375f", label: "PDF" },
  md:         { color: "#0a84ff", label: "MD"  },
  figma:      { color: "#bf5af2", label: "FIG" },
  notion:     { color: "#1d9954", label: "NTN" },
  confluence: { color: "#5e5ce6", label: "CFL" },
  yaml:       { color: "#ff9f0a", label: "YML" },
};

// ─── API → UI helpers ─────────────────────────────────────────────────────────

const FOLDER_COLORS = ["#0a84ff", "#bf5af2", "#30d158", "#ff9f0a", "#ff375f", "#5e5ce6", "#64d2ff"];

function folderColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  return FOLDER_COLORS[h % FOLDER_COLORS.length];
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

function apiDocToNode(d: ApiDocument): DocNode {
  const statusMap: Record<string, string> = { ready: "indexed", processing: "indexing", uploading: "indexing", error: "failed" };
  return {
    type: "doc",
    id: d.id,
    name: d.name,
    ext: d.file_type,
    size: fmtSize(d.size_bytes),
    pages: (d.metadata?.page_count as number) ?? 0,
    status: statusMap[d.status] ?? "indexed",
    words: "—",
    uploaded: d.uploaded_by ?? "—",
    time: fmtRelative(d.created_at),
    tag: d.file_type.toUpperCase(),
    progress: d.status === "processing" ? 50 : undefined,
  };
}

function buildTree(folders: DocumentFolder[], docs: ApiDocument[]): TreeNode[] {
  const folderMap = new Map<string, FolderNode>();
  const roots: TreeNode[] = [];

  for (const f of folders) {
    folderMap.set(f.id, { type: "folder", id: f.id, name: f.name, color: folderColor(f.id), children: [] });
  }
  for (const f of folders) {
    const node = folderMap.get(f.id)!;
    if (f.parent_folder_id && folderMap.has(f.parent_folder_id)) {
      folderMap.get(f.parent_folder_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  for (const d of docs) {
    const node = apiDocToNode(d);
    if (d.folder_id && folderMap.has(d.folder_id)) {
      folderMap.get(d.folder_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// ─── Mock data (DEMO mode only) ───────────────────────────────────────────────

const DOCUMENTS_TREE: TreeNode[] = [
  {
    type: "folder", id: "f-arch", name: "Architecture", color: "#0a84ff",
    children: [
      {
        type: "doc", id: "d-rfc14", name: "Atlas Platform — RFC-014", ext: "pdf",
        size: "2.4 MB", pages: 38, status: "indexed", words: "14,820",
        uploaded: "Lina P.", time: "2 days ago", tag: "RFC",
        preview: {
          title: "RFC-014 — Atlas Edge Tier Cold-Start Budget",
          author: "Lina Park · Atlas Infrastructure",
          updated: "2 days ago",
          body: [
            { h: "Summary" },
            { p: "Atlas's edge tier exhibits cold-start latency in the 380–620ms range for the bottom-quartile region. This RFC proposes a budget of 250ms p99 cold-start by combining warm pools, ahead-of-time compilation, and a smaller worker bundle." },
            { h: "Motivation" },
            { p: "12% of edge requests in EU-West-3 incur a cold start. p99 in that region drifts to 940ms during traffic dips at 03:00 UTC, violating our 500ms SLO." },
            { h: "Proposal" },
            { p: "Three concurrent workstreams: (1) maintain N=4 warm workers per region, (2) ship a Rust binary instead of a JIT bundle, (3) preload the auth & rate-limit modules at boot." },
            { cite: "Citations: atlas-edge/src/runtime.rs §worker_pool · atlas-infra/regions.tf · Edge benchmarks Q1 2026" },
          ],
        },
      },
      {
        type: "doc", id: "d-q2", name: "Q2 Architecture Review", ext: "pdf",
        size: "5.1 MB", pages: 64, status: "indexed", words: "28,400",
        uploaded: "Elena N.", time: "1 week ago", tag: "Architecture",
      },
      {
        type: "folder", id: "f-decisions", name: "Decisions", color: "#5e5ce6",
        children: [
          { type: "doc", id: "d-adr01", name: "ADR-001 — Adopt gRPC for internal RPC", ext: "md", size: "12 KB", pages: 3, status: "indexed", words: "1,420", uploaded: "Elena N.", time: "1 month ago", tag: "ADR" },
          { type: "doc", id: "d-adr02", name: "ADR-002 — Postgres for OLTP, Click for OLAP", ext: "md", size: "18 KB", pages: 5, status: "indexed", words: "2,280", uploaded: "Mei T.", time: "3 weeks ago", tag: "ADR" },
        ],
      },
    ],
  },
  {
    type: "folder", id: "f-design", name: "Design", color: "#bf5af2",
    children: [
      { type: "doc", id: "d-brand", name: "Brand & UI Guidelines", ext: "figma", size: "Linked", pages: 142, status: "indexed", words: "—", uploaded: "Mei T.", time: "3 days ago", tag: "Design" },
    ],
  },
  {
    type: "folder", id: "f-ops", name: "Operations", color: "#30d158",
    children: [
      { type: "doc", id: "d-runbook", name: "Onboarding Runbook", ext: "md", size: "84 KB", pages: 12, status: "indexed", words: "6,310", uploaded: "Sam O.", time: "5 days ago", tag: "Ops" },
      { type: "doc", id: "d-edge-bench", name: "Edge cold-start benchmarks", ext: "md", size: "42 KB", pages: 4, status: "indexed", words: "2,840", uploaded: "Lina P.", time: "4h ago", tag: "Performance" },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countDocs(node: TreeNode): number {
  if (node.type === "doc") return 1;
  return (node as FolderNode).children.reduce((s, c) => s + countDocs(c), 0);
}

function findDoc(nodes: TreeNode[], id: string): DocNode | null {
  for (const n of nodes) {
    if (n.type === "doc" && n.id === id) return n as DocNode;
    if (n.type === "folder") {
      const f = findDoc((n as FolderNode).children, id);
      if (f) return f;
    }
  }
  return null;
}

function findPath(nodes: TreeNode[], id: string, trail: TreeNode[] = []): TreeNode[] | null {
  for (const n of nodes) {
    if (n.type === "doc" && n.id === id) return [...trail, n];
    if (n.type === "folder") {
      const f = findPath((n as FolderNode).children, id, [...trail, n]);
      if (f) return f;
    }
  }
  return null;
}

function flattenDocs(nodes: TreeNode[]): DocNode[] {
  const out: DocNode[] = [];
  nodes.forEach((n) => {
    if (n.type === "doc") out.push(n as DocNode);
    else out.push(...flattenDocs((n as FolderNode).children));
  });
  return out;
}

function findFolder(nodes: TreeNode[], id: string): FolderNode | null {
  for (const n of nodes) {
    if (n.type === "folder" && n.id === id) return n as FolderNode;
    if (n.type === "folder") {
      const f = findFolder((n as FolderNode).children, id);
      if (f) return f;
    }
  }
  return null;
}

// ─── FolderNodeItem ───────────────────────────────────────────────────────────

function FolderNodeItem({
  node, depth, openIds, setOpenIds, selectedId, setSelectedId,
}: {
  node: TreeNode; depth: number;
  openIds: Set<string>; setOpenIds: (s: Set<string>) => void;
  selectedId: string | null; setSelectedId: (id: string) => void;
}) {
  if (node.type === "doc") {
    const d = node as DocNode;
    const ti = DOC_TYPE_INFO[d.ext] || DOC_TYPE_INFO.md;
    return (
      <button
        className="ft-node"
        data-active={selectedId === d.id ? "true" : undefined}
        style={{ paddingLeft: 22 + depth * 14 }}
        onClick={() => setSelectedId(d.id)}
      >
        <span className="ft-ext" style={{ color: ti.color }}>{ti.label}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
      </button>
    );
  }
  const folder = node as FolderNode;
  const isOpen = openIds.has(folder.id);
  const c = countDocs(folder);
  return (
    <>
      <button
        className="ft-node ft-folder"
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => {
          const next = new Set(openIds);
          isOpen ? next.delete(folder.id) : next.add(folder.id);
          setOpenIds(next);
        }}
      >
        <span className="ft-chev" style={{ transform: isOpen ? "rotate(90deg)" : "", transition: "transform .15s" }}>
          <Icon name="chev" size="sm" />
        </span>
        <span className="ft-folder-ico" style={{ color: folder.color }}>
          <Icon name={isOpen ? "folder-open" : "folder"} size="sm" />
        </span>
        <span style={{ fontWeight: 600 }}>{folder.name}</span>
        <span className="ft-count">{c}</span>
      </button>
      {isOpen && folder.children.map((ch) => (
        <FolderNodeItem key={ch.id} node={ch} depth={depth + 1}
          openIds={openIds} setOpenIds={setOpenIds}
          selectedId={selectedId} setSelectedId={setSelectedId} />
      ))}
    </>
  );
}

// ─── Doc preview ──────────────────────────────────────────────────────────────

function DocPreview({ doc, path }: { doc: DocNode; path: TreeNode[] | null }) {
  const ti = DOC_TYPE_INFO[doc.ext] || DOC_TYPE_INFO.md;
  const p = doc.preview;
  return (
    <>
      <div className="dp-head">
        <span className="doc-tile lg" style={{ background: `linear-gradient(135deg, ${ti.color}28, ${ti.color}08)`, color: ti.color }}>
          {ti.label}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.name}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginTop: 2 }}>
            {(path || []).slice(0, -1).map((n) => n.name).join(" / ") || "Root"}
          </div>
        </div>
      </div>
      <div className="dp-actions">
        <button className="pill-btn" data-primary="true">
          <Icon name="sparkle" size="sm" /> Ask about this
        </button>
        <button className="pill-btn"><Icon name="upload" size="sm" /> Replace</button>
        <button className="pill-btn"><Icon name="settings" size="sm" /></button>
      </div>
      <div className="dp-paper">
        {p ? (
          <>
            <h2 style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em", margin: "0 0 6px" }}>{p.title}</h2>
            <div style={{ fontSize: 11.5, color: "var(--fg-3)", marginBottom: 16 }}>{p.author} · {p.updated}</div>
            {p.body.map((b, i) => {
              if (b.h) return <h3 key={i} className="dp-h3">{b.h}</h3>;
              if (b.p) return <p key={i} className="dp-p">{b.p}</p>;
              if (b.cite) return <div key={i} className="dp-cite">{b.cite}</div>;
              return null;
            })}
          </>
        ) : (
          <div className="dp-placeholder">
            <div className="dp-placeholder-stack">
              {[60, 85, 78, 92, 40, 82, 76, 88].map((w, i) => (
                <div key={i} className="dp-line" style={{ width: w + "%" }} />
              ))}
            </div>
            <div className="dp-overlay-msg">
              <Icon name="eye" />
              <div>
                <b>Preview not rendered</b>
                <div>{doc.pages} pages indexed · ask TEOS to summarize or quote</div>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="dp-stats">
        <div><span>Pages</span><b>{doc.pages}</b></div>
        <div><span>Words</span><b>{doc.words}</b></div>
        <div><span>Size</span><b>{doc.size}</b></div>
        <div><span>Uploaded</span><b>{doc.uploaded}</b></div>
      </div>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectDocuments({ projectId }: { projectId: string }) {
  const [tree, setTree] = useState<TreeNode[]>(DEMO ? DOCUMENTS_TREE : []);
  const [openIds, setOpenIds] = useState(new Set(["f-arch", "f-design"]));
  const [selectedId, setSelectedId] = useState<string | null>(DEMO ? "d-rfc14" : null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (DEMO) return;
    Promise.all([listAllFolders(projectId), listDocuments(projectId)]).then(([folders, docs]) => {
      setTree(buildTree(folders, docs));
    }).catch(() => {});
  }, [projectId]);

  const allDocs = flattenDocs(tree);
  const selectedDoc = selectedId ? findDoc(tree, selectedId) : null;
  const selectedPath = selectedId ? findPath(tree, selectedId) : null;
  const currentScope = folderId ? (findFolder(tree, folderId)?.children ?? []) : tree;
  const listItems: TreeNode[] = query
    ? flattenDocs(tree).filter((d) => d.name.toLowerCase().includes(query.toLowerCase()))
    : currentScope;

  async function handleFileUpload(file: File) {
    if (DEMO) return;
    setUploading(true);
    try {
      await uploadDocument(projectId, file);
      const [folders, docs] = await Promise.all([listAllFolders(projectId), listDocuments(projectId)]);
      setTree(buildTree(folders, docs));
    } catch { /* ignore */ } finally {
      setUploading(false);
      setShowUpload(false);
    }
  }

  return (
    <div className="main-scroll">
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <h1 className="h-page">Documents</h1>
          <p className="sub-page" style={{ margin: 0 }}>
            PDFs, design files, wikis and specs TEOS indexes alongside your code. Organize them in folders;
            TEOS's agents cite them when answering.
          </p>
        </div>
        <button className="pill-btn"><Icon name="folder-plus" size="sm" /> New folder</button>
        <button className="pill-btn" data-primary="true" onClick={() => setShowUpload(true)}>
          <Icon name="upload" size="sm" /> Upload documents
        </button>
      </div>

      <div className="docs-3col">
        {/* Folder tree */}
        <aside className="docs-tree glass">
          <div className="docs-tree-head">
            <Icon name="folder" size="sm" />
            <span>All documents</span>
            <span className="ft-count" style={{ marginLeft: "auto" }}>{allDocs.length}</span>
          </div>
          <div className="docs-tree-search">
            <Icon name="search" size="sm" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" />
          </div>
          <div className="docs-tree-body">
            <button
              className="ft-node"
              data-active={folderId === null && !query ? "true" : undefined}
              style={{ paddingLeft: 10 }}
              onClick={() => { setFolderId(null); setQuery(""); }}
            >
              <Icon name="layers" size="sm" className="ft-folder-ico" />
              <span style={{ fontWeight: 600 }}>All</span>
              <span className="ft-count">{allDocs.length}</span>
            </button>
            {tree.map((n) => (
              <FolderNodeItem key={n.id} node={n} depth={0}
                openIds={openIds} setOpenIds={setOpenIds}
                selectedId={selectedId} setSelectedId={setSelectedId} />
            ))}
          </div>
        </aside>

        {/* Middle list */}
        <section className="docs-list glass">
          <div className="docs-list-head">
            <div className="crumb" style={{ fontSize: 12.5 }}>
              {query ? (
                <span>Search results <b style={{ color: "var(--fg)" }}>"{query}"</b> · {listItems.length}</span>
              ) : folderId ? (
                <>
                  <button className="link-btn" onClick={() => setFolderId(null)}>All</button>
                  <span className="crumb-sep">/</span>
                  <b>{findFolder(tree, folderId)?.name}</b>
                </>
              ) : (
                <b>All documents</b>
              )}
            </div>
            <div style={{ flex: 1 }} />
            <button className="pill-btn" style={{ height: 26 }}>
              <Icon name="sliders" size="sm" /> Sort
            </button>
          </div>
          <div className="docs-list-body">
            {listItems.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--fg-3)", fontSize: 13 }}>Nothing here yet.</div>
            )}
            {listItems.map((it) => {
              if (it.type === "folder") {
                const f = it as FolderNode;
                const c = countDocs(f);
                return (
                  <button key={f.id} className="doc-list-row" onClick={() => setFolderId(f.id)}>
                    <span className="folder-tile" style={{ background: `linear-gradient(135deg, ${f.color}28, ${f.color}10)` }}>
                      <Icon name="folder" style={{ color: f.color }} />
                    </span>
                    <div className="doc-list-meta">
                      <b>{f.name}</b>
                      <span>{c} {c === 1 ? "document" : "documents"}</span>
                    </div>
                    <Icon name="chev" size="sm" className="row-chev" />
                  </button>
                );
              }
              const doc = it as DocNode;
              const ti = DOC_TYPE_INFO[doc.ext] || DOC_TYPE_INFO.md;
              return (
                <button key={doc.id} className="doc-list-row"
                  data-active={selectedId === doc.id ? "true" : undefined}
                  onClick={() => setSelectedId(doc.id)}
                >
                  <span className="doc-tile" style={{ background: `linear-gradient(135deg, ${ti.color}28, ${ti.color}08)`, color: ti.color }}>
                    {ti.label}
                  </span>
                  <div className="doc-list-meta">
                    <b>{doc.name}</b>
                    <span>{doc.pages} pages · {doc.size} · {doc.uploaded} · {doc.time}</span>
                    {doc.status === "indexing" && (
                      <div className="task-bar" style={{ marginTop: 6, maxWidth: 220 }}>
                        <div style={{ width: (doc.progress || 0) + "%" }} />
                      </div>
                    )}
                  </div>
                  <span className="task-status" data-s={doc.status === "indexed" ? "done" : "running"}>
                    {doc.status}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Preview pane */}
        <aside className="docs-preview glass">
          {selectedDoc ? (
            <DocPreview doc={selectedDoc} path={selectedPath} />
          ) : (
            <div style={{ padding: 24, textAlign: "center", color: "var(--fg-3)", fontSize: 13 }}>
              Select a document to preview.
            </div>
          )}
        </aside>
      </div>

      {showUpload && (
        <div className="cmd-overlay" onClick={() => setShowUpload(false)}>
          <div className="cmd-panel" onClick={(e) => e.stopPropagation()} style={{ width: 540, padding: 0 }}>
            <div style={{ padding: "20px 22px 6px" }}>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" }}>Upload documents</div>
              <div style={{ fontSize: 12.5, color: "var(--fg-3)", marginTop: 4 }}>
                Files are chunked, embedded and indexed. Indexing typically completes within seconds.
              </div>
            </div>
            <div style={{ padding: "16px 22px" }}>
              <div className="upload-zone" style={{ borderStyle: "dashed", padding: 30 }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void handleFileUpload(f); }}>
                <Icon name="upload" />
                <div><b>Drop files here</b><div>or click to browse · max 200 MB per file</div></div>
              </div>
              <input ref={fileInputRef} type="file" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFileUpload(f); }} />
              <div style={{ fontSize: 12, color: "var(--fg-3)", marginTop: 14, textAlign: "center" }}>
                Or link a workspace: Figma · Notion · Confluence · Google Drive
              </div>
            </div>
            <div style={{ padding: 18, display: "flex", gap: 8, justifyContent: "flex-end", borderTop: "0.5px solid var(--hairline)" }}>
              <button className="pill-btn" onClick={() => setShowUpload(false)} disabled={uploading}>Cancel</button>
              <button className="pill-btn" data-primary="true" onClick={() => setShowUpload(false)} disabled={uploading}>
                {uploading ? "Uploading…" : "Done"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
