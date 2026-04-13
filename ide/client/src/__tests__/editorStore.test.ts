// ─── Editor Store Tests ───────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import type { EditorTab, EditorGroup, EditorSplit } from "@/types";
import { isEditorGroup } from "@/types";

// ── Mock api module ──────────────────────────────────────────────────────────
// editorStore imports `api` from "@/lib/api" for file operations.
vi.mock("@/lib/api", () => ({
  api: {
    workspaces: {
      readFile: vi.fn().mockResolvedValue({
        content: "file content",
        encoding: "utf8",
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
    },
    git: {
      fileAtRef: vi.fn().mockResolvedValue("original content"),
      commitDetail: vi.fn().mockResolvedValue({
        hash: "abc123",
        shortHash: "abc1",
        message: "Test commit",
        author: "test",
        date: "2024-01-01",
        parentHashes: [],
        refs: [],
        body: "",
        files: [],
      }),
    },
  },
}));

// ── Reset store between tests ────────────────────────────────────────────────

const DEFAULT_GROUP_ID = "group-0";

function createDefaultState() {
  const defaultGroup: EditorGroup = {
    id: DEFAULT_GROUP_ID,
    tabs: [],
    activeTabId: null,
  };
  return {
    groups: { [DEFAULT_GROUP_ID]: defaultGroup },
    activeGroupId: DEFAULT_GROUP_ID,
    rootSplit: defaultGroup,
    tabs: [],
    activeTabId: null,
  };
}

beforeEach(() => {
  useEditorStore.setState(createDefaultState());
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTab(id: string, overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id,
    path: id,
    name: id.split("/").pop() ?? id,
    language: "typescript",
    content: `// ${id}`,
    isDirty: false,
    ...overrides,
  };
}

function injectTab(tab: EditorTab, groupId: string = DEFAULT_GROUP_ID) {
  useEditorStore.setState((s) => {
    const group = s.groups[groupId];
    if (!group) return s;
    const newGroups = {
      ...s.groups,
      [groupId]: {
        ...group,
        tabs: [...group.tabs, tab],
        activeTabId: tab.id,
      },
    };
    return {
      groups: newGroups,
      tabs: newGroups[s.activeGroupId]?.tabs ?? [],
      activeTabId: newGroups[s.activeGroupId]?.activeTabId ?? null,
    };
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("EditorStore", () => {
  // ── Tab operations (single group) ──────────────────────────────────────────

  describe("Tab operations", () => {
    it("openFile adds a tab and sets it active", async () => {
      await useEditorStore.getState().openFile("ws1", "src/index.ts");

      const state = useEditorStore.getState();
      expect(state.tabs.length).toBe(1);
      expect(state.tabs[0].path).toBe("src/index.ts");
      expect(state.activeTabId).toBe("src/index.ts");
    });

    it("openFile re-activates existing tab instead of duplicating", async () => {
      await useEditorStore.getState().openFile("ws1", "src/index.ts");
      await useEditorStore.getState().openFile("ws1", "src/other.ts");
      await useEditorStore.getState().openFile("ws1", "src/index.ts");

      const state = useEditorStore.getState();
      expect(state.tabs.length).toBe(2);
      expect(state.activeTabId).toBe("src/index.ts");
    });

    it("closeTab removes tab and selects neighbor", () => {
      const tab1 = makeTab("a.ts");
      const tab2 = makeTab("b.ts");
      injectTab(tab1);
      injectTab(tab2);

      // Active is tab2 (last injected)
      useEditorStore.getState().closeTab("b.ts");

      const state = useEditorStore.getState();
      expect(state.tabs.length).toBe(1);
      expect(state.tabs[0].id).toBe("a.ts");
      expect(state.activeTabId).toBe("a.ts");
    });

    it("closeTab with last tab leaves empty", () => {
      injectTab(makeTab("only.ts"));
      useEditorStore.getState().closeTab("only.ts");

      const state = useEditorStore.getState();
      expect(state.tabs.length).toBe(0);
      expect(state.activeTabId).toBeNull();
    });

    it("setActiveTab changes the active tab", () => {
      injectTab(makeTab("a.ts"));
      injectTab(makeTab("b.ts"));

      useEditorStore.getState().setActiveTab("a.ts");
      expect(useEditorStore.getState().activeTabId).toBe("a.ts");
    });

    it("updateTabContent marks tab dirty", () => {
      injectTab(makeTab("file.ts"));

      useEditorStore.getState().updateTabContent("file.ts", "new content");

      const state = useEditorStore.getState();
      const tab = state.tabs.find((t) => t.id === "file.ts");
      expect(tab?.content).toBe("new content");
      expect(tab?.isDirty).toBe(true);
    });

    it("markTabSaved clears isDirty", () => {
      injectTab(makeTab("file.ts", { isDirty: true, content: "dirty" }));

      useEditorStore.getState().markTabSaved("file.ts");

      const tab = useEditorStore.getState().tabs.find((t) => t.id === "file.ts");
      expect(tab?.isDirty).toBe(false);
    });

    it("saveTab calls api.writeFile and marks saved", async () => {
      const { api } = await import("@/lib/api");
      injectTab(makeTab("file.ts", { isDirty: true, content: "save me" }));

      await useEditorStore.getState().saveTab("ws1", "file.ts");

      expect(api.workspaces.writeFile).toHaveBeenCalledWith("ws1", "file.ts", "save me");
      const tab = useEditorStore.getState().tabs.find((t) => t.id === "file.ts");
      expect(tab?.isDirty).toBe(false);
    });

    it("setCursor sets cursorLine and cursorColumn", () => {
      injectTab(makeTab("file.ts"));

      useEditorStore.getState().setCursor("file.ts", 10, 5);

      const tab = useEditorStore.getState().tabs.find((t) => t.id === "file.ts");
      expect(tab?.cursorLine).toBe(10);
      expect(tab?.cursorColumn).toBe(5);
    });

    it("renameTab updates id, path, name, and language", () => {
      injectTab(makeTab("old.ts"));

      useEditorStore.getState().renameTab("old.ts", "new.js");

      const state = useEditorStore.getState();
      expect(state.tabs.length).toBe(1);
      const tab = state.tabs[0];
      expect(tab.id).toBe("new.js");
      expect(tab.path).toBe("new.js");
      expect(tab.name).toBe("new.js");
      expect(tab.language).toBe("javascript");
    });

    it("renameTab updates activeTabId if renamed tab was active", () => {
      injectTab(makeTab("active.ts"));
      expect(useEditorStore.getState().activeTabId).toBe("active.ts");

      useEditorStore.getState().renameTab("active.ts", "renamed.ts");
      expect(useEditorStore.getState().activeTabId).toBe("renamed.ts");
    });
  });

  // ── Virtual tabs ───────────────────────────────────────────────────────────

  describe("Virtual tabs", () => {
    it("openQueryConsole creates a virtual query-console tab", () => {
      useEditorStore.getState().openQueryConsole("conn1", "My DB", "SELECT 1");

      const state = useEditorStore.getState();
      expect(state.tabs.length).toBe(1);
      expect(state.tabs[0].isVirtual).toBe(true);
      expect(state.tabs[0].virtualType).toBe("query-console");
      expect(state.tabs[0].connectionId).toBe("conn1");
      expect(state.tabs[0].content).toBe("SELECT 1");
    });

    it("openQueryConsole re-activates existing console for same connection", () => {
      useEditorStore.getState().openQueryConsole("conn1", "My DB");
      useEditorStore.getState().openQueryConsole("conn1", "My DB");

      expect(useEditorStore.getState().tabs.length).toBe(1);
    });

    it("openGitGraph creates a virtual git-graph tab", () => {
      useEditorStore.getState().openGitGraph("ws1");

      const state = useEditorStore.getState();
      expect(state.tabs.length).toBe(1);
      expect(state.tabs[0].virtualType).toBe("git-graph");
    });
  });

  // ── Multi-group operations ─────────────────────────────────────────────────

  describe("Multi-group operations", () => {
    it("splitGroup creates a new group and split node", () => {
      useEditorStore.getState().splitGroup(DEFAULT_GROUP_ID, "horizontal");

      const state = useEditorStore.getState();
      const groupIds = Object.keys(state.groups);
      expect(groupIds.length).toBe(2);

      // Root should now be a split node
      expect(isEditorGroup(state.rootSplit)).toBe(false);
      const split = state.rootSplit as EditorSplit;
      expect(split.direction).toBe("horizontal");
      expect(split.children.length).toBe(2);
      expect(split.sizes).toEqual([50, 50]);

      // Active group should be the new one
      expect(state.activeGroupId).not.toBe(DEFAULT_GROUP_ID);
    });

    it("closeGroup removes a group and collapses single-child split", () => {
      // Create a split first
      useEditorStore.getState().splitGroup(DEFAULT_GROUP_ID, "horizontal");
      const afterSplit = useEditorStore.getState();
      const newGroupId = afterSplit.activeGroupId;

      // Close the new group
      useEditorStore.getState().closeGroup(newGroupId);

      const state = useEditorStore.getState();
      expect(Object.keys(state.groups).length).toBe(1);
      // Root should collapse back to a single group
      expect(isEditorGroup(state.rootSplit)).toBe(true);
    });

    it("cannot close the last remaining group", () => {
      useEditorStore.getState().closeGroup(DEFAULT_GROUP_ID);

      const state = useEditorStore.getState();
      expect(Object.keys(state.groups).length).toBe(1);
      expect(state.groups[DEFAULT_GROUP_ID]).toBeDefined();
    });

    it("moveTab transfers a tab between groups", () => {
      // Add a tab to default group
      injectTab(makeTab("file.ts"), DEFAULT_GROUP_ID);

      // Create a split
      useEditorStore.getState().splitGroup(DEFAULT_GROUP_ID, "horizontal");
      const newGroupId = useEditorStore.getState().activeGroupId;

      // Move tab from default to new
      useEditorStore.getState().moveTab("file.ts", DEFAULT_GROUP_ID, newGroupId);

      const state = useEditorStore.getState();
      expect(state.groups[DEFAULT_GROUP_ID].tabs.length).toBe(0);
      expect(state.groups[newGroupId].tabs.length).toBe(1);
      expect(state.groups[newGroupId].tabs[0].id).toBe("file.ts");
    });

    it("setActiveGroup updates active group and syncs mirrors", () => {
      injectTab(makeTab("file.ts"), DEFAULT_GROUP_ID);

      useEditorStore.getState().splitGroup(DEFAULT_GROUP_ID, "horizontal");
      const newGroupId = useEditorStore.getState().activeGroupId;

      // Switch back to default
      useEditorStore.getState().setActiveGroup(DEFAULT_GROUP_ID);

      const state = useEditorStore.getState();
      expect(state.activeGroupId).toBe(DEFAULT_GROUP_ID);
      expect(state.tabs.length).toBe(1); // mirrors default group's tabs
      expect(state.activeTabId).toBe("file.ts");
    });

    it("setActiveGroup is a no-op for nonexistent group", () => {
      useEditorStore.getState().setActiveGroup("nonexistent");
      expect(useEditorStore.getState().activeGroupId).toBe(DEFAULT_GROUP_ID);
    });
  });

  // ── Convenience getters ────────────────────────────────────────────────────

  describe("Convenience getters", () => {
    it("getActiveGroup returns the active group", () => {
      injectTab(makeTab("a.ts"));
      const group = useEditorStore.getState().getActiveGroup();
      expect(group.id).toBe(DEFAULT_GROUP_ID);
      expect(group.tabs.length).toBe(1);
    });

    it("getAllTabs returns tabs from all groups", () => {
      injectTab(makeTab("a.ts"), DEFAULT_GROUP_ID);

      useEditorStore.getState().splitGroup(DEFAULT_GROUP_ID, "horizontal");
      const newGroupId = useEditorStore.getState().activeGroupId;
      injectTab(makeTab("b.ts"), newGroupId);

      const allTabs = useEditorStore.getState().getAllTabs();
      expect(allTabs.length).toBe(2);
      const ids = allTabs.map((t) => t.id);
      expect(ids).toContain("a.ts");
      expect(ids).toContain("b.ts");
    });
  });

  // ── Cross-group operations ─────────────────────────────────────────────────

  describe("Cross-group tab operations", () => {
    it("updateTabContent finds tab across groups", () => {
      injectTab(makeTab("a.ts"), DEFAULT_GROUP_ID);

      useEditorStore.getState().splitGroup(DEFAULT_GROUP_ID, "horizontal");
      const newGroupId = useEditorStore.getState().activeGroupId;
      injectTab(makeTab("b.ts"), newGroupId);

      // Update tab in the default group while active group is the new one
      useEditorStore.getState().updateTabContent("a.ts", "updated");

      const tab = useEditorStore.getState().groups[DEFAULT_GROUP_ID].tabs.find(
        (t) => t.id === "a.ts",
      );
      expect(tab?.content).toBe("updated");
      expect(tab?.isDirty).toBe(true);
    });

    it("setCursor finds tab across groups", () => {
      injectTab(makeTab("a.ts"), DEFAULT_GROUP_ID);

      useEditorStore.getState().splitGroup(DEFAULT_GROUP_ID, "horizontal");

      useEditorStore.getState().setCursor("a.ts", 42, 10);

      const tab = useEditorStore.getState().groups[DEFAULT_GROUP_ID].tabs.find(
        (t) => t.id === "a.ts",
      );
      expect(tab?.cursorLine).toBe(42);
      expect(tab?.cursorColumn).toBe(10);
    });

    it("renameTab updates across all groups", () => {
      injectTab(makeTab("old.ts"), DEFAULT_GROUP_ID);

      useEditorStore.getState().splitGroup(DEFAULT_GROUP_ID, "horizontal");
      const newGroupId = useEditorStore.getState().activeGroupId;
      // even though the tab is in group-0, rename should find it

      useEditorStore.getState().renameTab("old.ts", "new.ts");

      const tab = useEditorStore.getState().groups[DEFAULT_GROUP_ID].tabs[0];
      expect(tab.id).toBe("new.ts");
      expect(tab.path).toBe("new.ts");
    });
  });
});
