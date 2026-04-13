import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  EditorTab,
  EditorGroup,
  EditorSplit,
  SplitDirection,
  GitCommitFile,
  GitCommitDetail,
} from "@/types";
import { isEditorGroup } from "@/types";
import { api } from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",  tsx: "typescript",
    js: "javascript",  jsx: "javascript",
    json: "json",      md: "markdown",
    py: "python",      rs: "rust",
    go: "go",          java: "java",
    css: "css",        scss: "scss",
    html: "html",      yaml: "yaml",
    yml: "yaml",       toml: "toml",
    sh: "shell",       bash: "shell",
    sql: "sql",        graphql: "graphql",
    gql: "graphql",
  };
  return map[ext] ?? "plaintext";
}

let _nextGroupId = 1;
function genGroupId(): string {
  return `group-${_nextGroupId++}`;
}

let _nextSplitId = 1;
function genSplitId(): string {
  return `split-${_nextSplitId++}`;
}

// ── Backward-compat mirror ────────────────────────────────────────────────────
// Syncs top-level `tabs` and `activeTabId` to always reflect the active group.

function syncMirror(
  groups: Record<string, EditorGroup>,
  activeGroupId: string,
): { tabs: EditorTab[]; activeTabId: string | null } {
  const g = groups[activeGroupId];
  return {
    tabs: g?.tabs ?? [],
    activeTabId: g?.activeTabId ?? null,
  };
}

// ── Group helpers ─────────────────────────────────────────────────────────────

/** Resolve `groupId` — falls back to `activeGroupId`. */
function resolveGid(state: EditorState, groupId?: string): string {
  return groupId ?? state.activeGroupId;
}

/** Update a single group in the `groups` record and return merged partial state. */
function patchGroup(
  state: EditorState,
  gid: string,
  patch: Partial<EditorGroup>,
): Pick<EditorState, "groups" | "tabs" | "activeTabId"> {
  const group = state.groups[gid];
  if (!group) return { groups: state.groups, ...syncMirror(state.groups, state.activeGroupId) };
  const updated: EditorGroup = { ...group, ...patch };
  // If tabs changed, ensure any patched tabs array is used
  if (patch.tabs && !patch.activeTabId && updated.activeTabId) {
    // Verify activeTabId still exists in new tabs
    if (!patch.tabs.some((t) => t.id === updated.activeTabId)) {
      updated.activeTabId = patch.tabs[patch.tabs.length - 1]?.id ?? null;
    }
  }
  const newGroups = { ...state.groups, [gid]: updated };
  return { groups: newGroups, ...syncMirror(newGroups, state.activeGroupId) };
}

// ── Root-split tree helpers ───────────────────────────────────────────────────

/** Replace a node (by id) in the split tree with a new node. */
function replaceInTree(
  node: EditorGroup | EditorSplit,
  targetId: string,
  replacement: EditorGroup | EditorSplit,
): EditorGroup | EditorSplit {
  if (node.id === targetId) return replacement;
  if (isEditorGroup(node)) return node;
  return {
    ...node,
    children: node.children.map((c) => replaceInTree(c, targetId, replacement)),
  };
}

/** Remove a node (by id) from the split tree, collapsing single-child splits. */
function removeFromTree(
  node: EditorGroup | EditorSplit,
  targetId: string,
): EditorGroup | EditorSplit | null {
  if (node.id === targetId) return null;
  if (isEditorGroup(node)) return node;

  const newChildren: (EditorGroup | EditorSplit)[] = [];
  const newSizes: number[] = [];
  const removedSizes: number[] = [];

  for (let i = 0; i < node.children.length; i++) {
    const result = removeFromTree(node.children[i], targetId);
    if (result) {
      newChildren.push(result);
      newSizes.push(node.sizes[i]);
    } else {
      removedSizes.push(node.sizes[i]);
    }
  }

  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0]; // collapse single-child split

  // Re-distribute removed sizes proportionally
  const totalRemoved = removedSizes.reduce((a, b) => a + b, 0);
  const totalRemaining = newSizes.reduce((a, b) => a + b, 0);
  const adjusted = newSizes.map(
    (s) => s + (totalRemoved * s) / totalRemaining,
  );

  return { ...node, children: newChildren, sizes: adjusted };
}

/** Collect all group IDs from the tree (in order). */
function collectGroupIds(node: EditorGroup | EditorSplit): string[] {
  if (isEditorGroup(node)) return [node.id];
  return node.children.flatMap(collectGroupIds);
}

// ── Default group ─────────────────────────────────────────────────────────────

const DEFAULT_GROUP_ID = "group-0";

function createEmptyGroup(id: string = DEFAULT_GROUP_ID): EditorGroup {
  return { id, tabs: [], activeTabId: null };
}

// ── State interface ───────────────────────────────────────────────────────────

interface EditorState {
  // ── Multi-group state (NEW) ─────────────────────────────────────────────────
  groups: Record<string, EditorGroup>;
  activeGroupId: string;
  rootSplit: EditorSplit | EditorGroup;

  // ── Backward-compatible mirrors (synced from active group) ──────────────────
  tabs: EditorTab[];
  activeTabId: string | null;

  // ── Group actions (NEW) ─────────────────────────────────────────────────────
  splitGroup: (groupId: string, direction: SplitDirection) => void;
  closeGroup: (groupId: string) => void;
  moveTab: (tabId: string, fromGroupId: string, toGroupId: string) => void;
  setActiveGroup: (groupId: string) => void;
  /** Split a group and move a specific tab into the new split. */
  splitWithTab: (tabId: string, fromGroupId: string, direction: SplitDirection) => void;

  // ── Tab actions (migrated — optional groupId, defaults to activeGroupId) ────
  openFile: (workspaceId: string, path: string, groupId?: string) => Promise<void>;
  openTab: (workspaceId: string, path: string, groupId?: string) => Promise<void>;
  openQueryConsole: (connectionId: string, connectionName: string, initialSql?: string, groupId?: string) => void;
  openDiff: (workspaceId: string, filePath: string, staged: boolean, groupId?: string) => Promise<void>;
  openCommitDetail: (workspaceId: string, hash: string, groupId?: string) => Promise<void>;
  openGitGraph: (workspaceId: string, groupId?: string) => void;
  openCommitFileDiff: (
    workspaceId: string,
    file: GitCommitFile,
    commitHash: string,
    parentHash?: string,
    groupId?: string,
  ) => Promise<void>;
  closeTab: (id: string, groupId?: string) => void;
  setActiveTab: (id: string, groupId?: string) => void;
  updateTabContent: (id: string, content: string) => void;
  markTabSaved: (id: string) => void;
  saveTab: (workspaceId: string, id: string) => Promise<void>;
  setCursor: (id: string, line: number, column: number) => void;
  renameTab: (oldPath: string, newPath: string) => void;

  // ── Convenience getters ─────────────────────────────────────────────────────
  getActiveGroup: () => EditorGroup;
  getAllTabs: () => EditorTab[];
}

// ── Store ─────────────────────────────────────────────────────────────────────

const defaultGroup = createEmptyGroup();

export const useEditorStore = create<EditorState>()(
  devtools(
    (set, get) => ({
      // ── Multi-group state ───────────────────────────────────────────────────
      groups: { [DEFAULT_GROUP_ID]: defaultGroup },
      activeGroupId: DEFAULT_GROUP_ID,
      rootSplit: defaultGroup,

      // ── Backward-compatible mirrors ─────────────────────────────────────────
      tabs: [],
      activeTabId: null,

      // ── Group actions ───────────────────────────────────────────────────────

      splitGroup(groupId, direction) {
        set((s) => {
          const existing = s.groups[groupId];
          if (!existing) return s;

          const newId = genGroupId();
          const newGroup = createEmptyGroup(newId);
          const newGroups = { ...s.groups, [newId]: newGroup };

          // Create a split node containing the existing group and the new one
          const splitNode: EditorSplit = {
            id: genSplitId(),
            direction,
            children: [existing, newGroup],
            sizes: [50, 50],
          };

          const newRoot = replaceInTree(s.rootSplit, groupId, splitNode);

          return {
            groups: newGroups,
            rootSplit: newRoot,
            activeGroupId: newId,
            ...syncMirror(newGroups, newId),
          };
        });
      },

      closeGroup(groupId) {
        set((s) => {
          const groupIds = collectGroupIds(s.rootSplit);
          // Cannot close the last group
          if (groupIds.length <= 1) return s;

          const newRoot = removeFromTree(s.rootSplit, groupId);
          if (!newRoot) return s; // shouldn't happen

          const { [groupId]: _removed, ...newGroups } = s.groups;
          const remainingIds = collectGroupIds(newRoot);
          // Pick next active group: prefer current, else first remaining
          const newActiveId = remainingIds.includes(s.activeGroupId)
            ? s.activeGroupId
            : remainingIds[0];

          return {
            groups: newGroups,
            rootSplit: newRoot,
            activeGroupId: newActiveId,
            ...syncMirror(newGroups, newActiveId),
          };
        });
      },

      moveTab(tabId, fromGroupId, toGroupId) {
        set((s) => {
          const from = s.groups[fromGroupId];
          const to = s.groups[toGroupId];
          if (!from || !to) return s;

          const tab = from.tabs.find((t) => t.id === tabId);
          if (!tab) return s;

          // Remove from source
          const fromTabs = from.tabs.filter((t) => t.id !== tabId);
          const fromActiveIdx = from.tabs.findIndex((t) => t.id === tabId);
          let fromActive = from.activeTabId;
          if (fromActive === tabId) {
            fromActive = fromTabs[Math.min(fromActiveIdx, fromTabs.length - 1)]?.id ?? null;
          }

          // Add to target
          const toTabs = [...to.tabs, tab];

          const newGroups = {
            ...s.groups,
            [fromGroupId]: { ...from, tabs: fromTabs, activeTabId: fromActive },
            [toGroupId]: { ...to, tabs: toTabs, activeTabId: tab.id },
          };

          return {
            groups: newGroups,
            activeGroupId: toGroupId,
            ...syncMirror(newGroups, toGroupId),
          };
        });
      },

      setActiveGroup(groupId) {
        set((s) => {
          if (!s.groups[groupId]) return s;
          return {
            activeGroupId: groupId,
            ...syncMirror(s.groups, groupId),
          };
        });
      },

      splitWithTab(tabId, fromGroupId, direction) {
        set((s) => {
          const from = s.groups[fromGroupId];
          if (!from) return s;

          const tab = from.tabs.find((t) => t.id === tabId);
          if (!tab) return s;

          // Remove tab from source group
          const fromTabs = from.tabs.filter((t) => t.id !== tabId);
          const fromActiveIdx = from.tabs.findIndex((t) => t.id === tabId);
          let fromActive = from.activeTabId;
          if (fromActive === tabId) {
            fromActive = fromTabs[Math.min(fromActiveIdx, fromTabs.length - 1)]?.id ?? null;
          }

          // Create new group with the tab
          const newId = genGroupId();
          const newGroup: EditorGroup = {
            id: newId,
            tabs: [tab],
            activeTabId: tab.id,
          };

          const updatedFrom: EditorGroup = { ...from, tabs: fromTabs, activeTabId: fromActive };
          const newGroups = { ...s.groups, [fromGroupId]: updatedFrom, [newId]: newGroup };

          // Create a split node: existing group + new group
          const splitNode: EditorSplit = {
            id: genSplitId(),
            direction,
            children: [updatedFrom, newGroup],
            sizes: [50, 50],
          };

          const newRoot = replaceInTree(s.rootSplit, fromGroupId, splitNode);

          // If source group is now empty, clean it up
          if (fromTabs.length === 0) {
            const { [fromGroupId]: _removed, ...cleanedGroups } = newGroups;
            const cleanedRoot = removeFromTree(newRoot, fromGroupId);
            if (!cleanedRoot) {
              // Shouldn't happen — we just created a new group
              return s;
            }
            return {
              groups: cleanedGroups,
              rootSplit: cleanedRoot,
              activeGroupId: newId,
              ...syncMirror(cleanedGroups, newId),
            };
          }

          return {
            groups: newGroups,
            rootSplit: newRoot,
            activeGroupId: newId,
            ...syncMirror(newGroups, newId),
          };
        });
      },

      // ── Tab actions (group-scoped) ──────────────────────────────────────────

      async openFile(workspaceId, path, groupId?) {
        const s = get();
        const gid = resolveGid(s, groupId);
        const group = s.groups[gid];
        if (!group) return;

        const existing = group.tabs.find((t) => t.path === path);
        if (existing) {
          set((s2) => ({
            ...patchGroup(s2, gid, { activeTabId: existing.id }),
          }));
          return;
        }

        const { content, encoding } = await api.workspaces.readFile(workspaceId, path);
        const tab: EditorTab = {
          id: path,
          path,
          name: path.split("/").pop() ?? path,
          language: languageFromPath(path),
          content: encoding === "base64" ? "(binary file)" : content,
          isDirty: false,
        };

        set((s2) => {
          const g = s2.groups[gid];
          if (!g) return s2;
          return patchGroup(s2, gid, {
            tabs: [...g.tabs, tab],
            activeTabId: tab.id,
          });
        });
      },

      async openTab(workspaceId, path, groupId?) {
        await get().openFile(workspaceId, path, groupId);
      },

      openQueryConsole(connectionId, connectionName, initialSql?, groupId?) {
        const s = get();
        const gid = resolveGid(s, groupId);
        const group = s.groups[gid];
        if (!group) return;

        const existing = group.tabs.find(
          (t) => t.isVirtual && t.connectionId === connectionId,
        );
        if (existing) {
          set((s2) => ({
            ...patchGroup(s2, gid, { activeTabId: existing.id }),
          }));
          return;
        }

        const id = `db://${connectionId}/console-${Date.now()}`;
        const tab: EditorTab = {
          id,
          path: id,
          name: connectionName,
          language: "sql",
          content: initialSql ?? "",
          isDirty: false,
          isVirtual: true,
          virtualType: "query-console",
          connectionId,
        };
        set((s2) => {
          const g = s2.groups[gid];
          if (!g) return s2;
          return patchGroup(s2, gid, {
            tabs: [...g.tabs, tab],
            activeTabId: tab.id,
          });
        });
      },

      async openDiff(workspaceId, filePath, staged, groupId?) {
        const s = get();
        const gid = resolveGid(s, groupId);
        const group = s.groups[gid];
        if (!group) return;

        const tabId = `diff://${staged ? "staged" : "working"}/${filePath}`;
        const existing = group.tabs.find((t) => t.id === tabId);
        if (existing) {
          set((s2) => ({
            ...patchGroup(s2, gid, { activeTabId: tabId }),
          }));
          return;
        }

        const [originalContent, currentContent] = await Promise.all([
          api.git.fileAtRef(workspaceId, filePath, "HEAD").catch(() => ""),
          api.workspaces.readFile(workspaceId, filePath).then((r) => r.content).catch(() => ""),
        ]);

        const name = filePath.split("/").pop() ?? filePath;
        const tab: EditorTab = {
          id: tabId,
          path: tabId,
          name: `${name} (diff)`,
          language: languageFromPath(filePath),
          content: currentContent,
          isDirty: false,
          isVirtual: true,
          virtualType: "diff",
          diffOriginalContent: originalContent,
          diffModifiedContent: currentContent,
          diffFilePath: filePath,
          diffStaged: staged,
        };
        set((s2) => {
          const g = s2.groups[gid];
          if (!g) return s2;
          return patchGroup(s2, gid, {
            tabs: [...g.tabs, tab],
            activeTabId: tab.id,
          });
        });
      },

      async openCommitDetail(workspaceId, hash, groupId?) {
        const s = get();
        const gid = resolveGid(s, groupId);
        const group = s.groups[gid];
        if (!group) return;

        const tabId = `commit://${hash}`;
        const existing = group.tabs.find((t) => t.id === tabId);
        if (existing) {
          set((s2) => ({
            ...patchGroup(s2, gid, { activeTabId: tabId }),
          }));
          return;
        }

        const detail: GitCommitDetail = await api.git.commitDetail(workspaceId, hash);
        const tab: EditorTab = {
          id: tabId,
          path: tabId,
          name: `${detail.shortHash} — ${detail.message.slice(0, 40)}`,
          language: "plaintext",
          content: "",
          isDirty: false,
          isVirtual: true,
          virtualType: "commit-detail",
          commitDetail: detail,
        };
        set((s2) => {
          const g = s2.groups[gid];
          if (!g) return s2;
          return patchGroup(s2, gid, {
            tabs: [...g.tabs, tab],
            activeTabId: tab.id,
          });
        });
      },

      openGitGraph(workspaceId, groupId?) {
        const s = get();
        const gid = resolveGid(s, groupId);
        const group = s.groups[gid];
        if (!group) return;

        const tabId = `git-graph://${workspaceId}`;
        const existing = group.tabs.find((t) => t.id === tabId);
        if (existing) {
          set((s2) => ({
            ...patchGroup(s2, gid, { activeTabId: tabId }),
          }));
          return;
        }

        const tab: EditorTab = {
          id: tabId,
          path: tabId,
          name: "Git Graph",
          language: "plaintext",
          content: "",
          isDirty: false,
          isVirtual: true,
          virtualType: "git-graph",
        };
        set((s2) => {
          const g = s2.groups[gid];
          if (!g) return s2;
          return patchGroup(s2, gid, {
            tabs: [...g.tabs, tab],
            activeTabId: tab.id,
          });
        });
      },

      async openCommitFileDiff(workspaceId, file, commitHash, parentHash?, groupId?) {
        const s = get();
        const gid = resolveGid(s, groupId);
        const group = s.groups[gid];
        if (!group) return;

        const displayPath = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
        const tabId = `commit-diff://${commitHash}/${file.path}`;
        const existing = group.tabs.find((t) => t.id === tabId);
        if (existing) {
          set((s2) => ({
            ...patchGroup(s2, gid, { activeTabId: tabId }),
          }));
          return;
        }

        const parentRef = parentHash ?? `${commitHash}^`;
        const [originalContent, modifiedContent] = await Promise.all([
          file.status === "A"
            ? Promise.resolve("")
            : api.git.fileAtRef(workspaceId, file.oldPath ?? file.path, parentRef).catch(() => ""),
          file.status === "D"
            ? Promise.resolve("")
            : api.git.fileAtRef(workspaceId, file.path, commitHash).catch(() => ""),
        ]);

        const name = file.path.split("/").pop() ?? file.path;
        const tab: EditorTab = {
          id: tabId,
          path: tabId,
          name: `${name} (${commitHash.slice(0, 7)})`,
          language: languageFromPath(file.path),
          content: modifiedContent,
          isDirty: false,
          isVirtual: true,
          virtualType: "diff",
          diffOriginalContent: originalContent,
          diffModifiedContent: modifiedContent,
          diffFilePath: displayPath,
          diffStaged: false,
        };
        set((s2) => {
          const g = s2.groups[gid];
          if (!g) return s2;
          return patchGroup(s2, gid, {
            tabs: [...g.tabs, tab],
            activeTabId: tab.id,
          });
        });
      },

      closeTab(id, groupId?) {
        set((s) => {
          const gid = resolveGid(s, groupId);
          const group = s.groups[gid];
          if (!group) return s;

          const idx = group.tabs.findIndex((t) => t.id === id);
          if (idx === -1) return s;

          const newTabs = group.tabs.filter((t) => t.id !== id);
          let newActive = group.activeTabId;
          if (newActive === id) {
            newActive = newTabs[Math.min(idx, newTabs.length - 1)]?.id ?? null;
          }

          return patchGroup(s, gid, { tabs: newTabs, activeTabId: newActive });
        });
      },

      setActiveTab(id, groupId?) {
        set((s) => {
          const gid = resolveGid(s, groupId);
          return patchGroup(s, gid, { activeTabId: id });
        });
      },

      updateTabContent(id, content) {
        set((s) => {
          // Find which group contains this tab
          for (const gid of Object.keys(s.groups)) {
            const group = s.groups[gid];
            if (group.tabs.some((t) => t.id === id)) {
              return patchGroup(s, gid, {
                tabs: group.tabs.map((t) =>
                  t.id === id ? { ...t, content, isDirty: true } : t,
                ),
              });
            }
          }
          return s;
        });
      },

      markTabSaved(id) {
        set((s) => {
          for (const gid of Object.keys(s.groups)) {
            const group = s.groups[gid];
            if (group.tabs.some((t) => t.id === id)) {
              return patchGroup(s, gid, {
                tabs: group.tabs.map((t) =>
                  t.id === id ? { ...t, isDirty: false } : t,
                ),
              });
            }
          }
          return s;
        });
      },

      async saveTab(workspaceId, id) {
        // Find tab across all groups
        const s = get();
        let tab: EditorTab | undefined;
        for (const group of Object.values(s.groups)) {
          tab = group.tabs.find((t) => t.id === id);
          if (tab) break;
        }
        if (!tab || !tab.isDirty) return;
        await api.workspaces.writeFile(workspaceId, tab.path, tab.content);
        get().markTabSaved(id);
      },

      setCursor(id, line, column) {
        set((s) => {
          for (const gid of Object.keys(s.groups)) {
            const group = s.groups[gid];
            if (group.tabs.some((t) => t.id === id)) {
              return patchGroup(s, gid, {
                tabs: group.tabs.map((t) =>
                  t.id === id ? { ...t, cursorLine: line, cursorColumn: column } : t,
                ),
              });
            }
          }
          return s;
        });
      },

      renameTab(oldPath, newPath) {
        set((s) => {
          let changed = false;
          const newGroups = { ...s.groups };

          for (const gid of Object.keys(newGroups)) {
            const group = newGroups[gid];
            if (group.tabs.some((t) => t.path === oldPath)) {
              changed = true;
              newGroups[gid] = {
                ...group,
                tabs: group.tabs.map((t) =>
                  t.path === oldPath
                    ? {
                        ...t,
                        id: newPath,
                        path: newPath,
                        name: newPath.split("/").pop() ?? newPath,
                        language: languageFromPath(newPath),
                      }
                    : t,
                ),
                activeTabId: group.activeTabId === oldPath ? newPath : group.activeTabId,
              };
            }
          }

          if (!changed) return s;
          return {
            groups: newGroups,
            ...syncMirror(newGroups, s.activeGroupId),
          };
        });
      },

      // ── Convenience getters ─────────────────────────────────────────────────

      getActiveGroup() {
        const s = get();
        return s.groups[s.activeGroupId] ?? createEmptyGroup();
      },

      getAllTabs() {
        const s = get();
        return Object.values(s.groups).flatMap((g) => g.tabs);
      },
    }),
    { name: "editor-store" },
  ),
);
