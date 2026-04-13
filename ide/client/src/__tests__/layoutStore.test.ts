// ─── Layout Store Tests ───────────────────────────────────────────────────────
import { describe, it, expect, beforeEach } from "vitest";
import { useLayoutStore } from "@/stores/layoutStore";

// ── Reset store between tests ────────────────────────────────────────────────

beforeEach(() => {
  useLayoutStore.setState({
    toolWindows: {},
    activeToolWindowId: null,
    collapsedRegions: {},
    leftSidebarWidth: 280,
    rightSidebarWidth: 320,
    bottomPanelHeight: 250,
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("LayoutStore", () => {
  // ── Registration ───────────────────────────────────────────────────────────

  it("registers a tool window with default state", () => {
    const { registerToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "explorer", placement: "left-top", order: 0 });

    const tw = useLayoutStore.getState().toolWindows["explorer"];
    expect(tw).toBeDefined();
    expect(tw.placement).toBe("left-top");
    expect(tw.viewMode).toBe("dock-pinned");
    expect(tw.isVisible).toBe(false);
    expect(tw.order).toBe(0);
  });

  it("registers with visible: true and sets as active", () => {
    const { registerToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "agent", placement: "right-top", visible: true });

    const state = useLayoutStore.getState();
    expect(state.toolWindows["agent"].isVisible).toBe(true);
    expect(state.activeToolWindowId).toBe("agent");
  });

  it("does not overwrite existing tool window on re-register (idempotent)", () => {
    const { registerToolWindow, showToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "tw", placement: "left-top" });
    showToolWindow("tw"); // makes visible + active

    // Re-register should NOT overwrite
    registerToolWindow({ id: "tw", placement: "right-top" });
    const tw = useLayoutStore.getState().toolWindows["tw"];
    expect(tw.placement).toBe("left-top"); // original placement kept
    expect(tw.isVisible).toBe(true); // visibility preserved
  });

  it("unregisters a tool window", () => {
    const { registerToolWindow, unregisterToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "temp", placement: "bottom" });
    expect(useLayoutStore.getState().toolWindows["temp"]).toBeDefined();

    unregisterToolWindow("temp");
    expect(useLayoutStore.getState().toolWindows["temp"]).toBeUndefined();
  });

  it("clears activeToolWindowId when active window is unregistered", () => {
    const { registerToolWindow, showToolWindow, unregisterToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "active", placement: "left-top" });
    showToolWindow("active");
    expect(useLayoutStore.getState().activeToolWindowId).toBe("active");

    unregisterToolWindow("active");
    expect(useLayoutStore.getState().activeToolWindowId).toBeNull();
  });

  // ── Toggle / Show / Hide ───────────────────────────────────────────────────

  it("toggleToolWindow opens a closed window", () => {
    const { registerToolWindow, toggleToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "tw", placement: "left-top" });
    expect(useLayoutStore.getState().toolWindows["tw"].isVisible).toBe(false);

    toggleToolWindow("tw");
    const state = useLayoutStore.getState();
    expect(state.toolWindows["tw"].isVisible).toBe(true);
    expect(state.activeToolWindowId).toBe("tw");
  });

  it("toggleToolWindow closes an open window", () => {
    const { registerToolWindow, showToolWindow, toggleToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "tw", placement: "left-top" });
    showToolWindow("tw");
    expect(useLayoutStore.getState().toolWindows["tw"].isVisible).toBe(true);

    toggleToolWindow("tw");
    expect(useLayoutStore.getState().toolWindows["tw"].isVisible).toBe(false);
  });

  it("showToolWindow un-collapses the region", () => {
    const { registerToolWindow, showToolWindow, toggleRegionCollapse } = useLayoutStore.getState();
    registerToolWindow({ id: "tw", placement: "left-top" });
    toggleRegionCollapse("left"); // collapse left
    expect(useLayoutStore.getState().collapsedRegions.left).toBe(true);

    showToolWindow("tw");
    expect(useLayoutStore.getState().collapsedRegions.left).toBe(false);
  });

  // ── Placement ──────────────────────────────────────────────────────────────

  it("moveToolWindow changes placement", () => {
    const { registerToolWindow, moveToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "tw", placement: "left-top" });

    moveToolWindow("tw", "right-top");
    expect(useLayoutStore.getState().toolWindows["tw"].placement).toBe("right-top");
  });

  // ── hasVisibleIn ───────────────────────────────────────────────────────────

  it("hasVisibleIn returns true when a docked window is visible in region", () => {
    const { registerToolWindow, showToolWindow, hasVisibleIn } = useLayoutStore.getState();
    registerToolWindow({ id: "tw", placement: "left-top" });

    expect(hasVisibleIn("left")).toBe(false);

    showToolWindow("tw");
    expect(useLayoutStore.getState().hasVisibleIn("left")).toBe(true);
  });

  it("hasVisibleIn excludes floating windows", () => {
    const { registerToolWindow, floatToolWindow, hasVisibleIn } = useLayoutStore.getState();
    registerToolWindow({ id: "tw", placement: "left-top" });
    floatToolWindow("tw"); // visible but floating

    expect(useLayoutStore.getState().hasVisibleIn("left")).toBe(false);
  });

  // ── Float / Dock ───────────────────────────────────────────────────────────

  it("floatToolWindow sets viewMode to float with default position/size", () => {
    const { registerToolWindow, floatToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "tw", placement: "left-top" });

    floatToolWindow("tw");
    const tw = useLayoutStore.getState().toolWindows["tw"];
    expect(tw.viewMode).toBe("float");
    expect(tw.isVisible).toBe(true);
    expect(tw.floatPosition).toEqual({ x: 120, y: 80 });
    expect(tw.floatSize).toEqual({ width: 400, height: 350 });
  });

  it("dockToolWindow restores viewMode to dock-pinned", () => {
    const { registerToolWindow, floatToolWindow, dockToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "tw", placement: "left-top" });
    floatToolWindow("tw");

    dockToolWindow("tw");
    const tw = useLayoutStore.getState().toolWindows["tw"];
    expect(tw.viewMode).toBe("dock-pinned");
    expect(tw.isVisible).toBe(true);
  });

  it("getFloatingWindows returns only visible floating windows", () => {
    const { registerToolWindow, floatToolWindow, getFloatingWindows } = useLayoutStore.getState();
    registerToolWindow({ id: "a", placement: "left-top" });
    registerToolWindow({ id: "b", placement: "right-top" });
    floatToolWindow("a");

    const floating = useLayoutStore.getState().getFloatingWindows();
    expect(floating.length).toBe(1);
    expect(floating[0].id).toBe("a");
  });

  // ── Region Collapse ────────────────────────────────────────────────────────

  it("toggleRegionCollapse toggles collapse state", () => {
    const { toggleRegionCollapse } = useLayoutStore.getState();

    toggleRegionCollapse("left");
    expect(useLayoutStore.getState().collapsedRegions.left).toBe(true);

    useLayoutStore.getState().toggleRegionCollapse("left");
    expect(useLayoutStore.getState().collapsedRegions.left).toBe(false);
  });

  // ── Sidebar Width / Bottom Height ──────────────────────────────────────────

  it("setLeftSidebarWidth clamps to [200, 600]", () => {
    const { setLeftSidebarWidth } = useLayoutStore.getState();

    setLeftSidebarWidth(100);
    expect(useLayoutStore.getState().leftSidebarWidth).toBe(200);

    useLayoutStore.getState().setLeftSidebarWidth(800);
    expect(useLayoutStore.getState().leftSidebarWidth).toBe(600);

    useLayoutStore.getState().setLeftSidebarWidth(350);
    expect(useLayoutStore.getState().leftSidebarWidth).toBe(350);
  });

  it("setRightSidebarWidth clamps to [200, 600]", () => {
    const { setRightSidebarWidth } = useLayoutStore.getState();

    setRightSidebarWidth(100);
    expect(useLayoutStore.getState().rightSidebarWidth).toBe(200);

    useLayoutStore.getState().setRightSidebarWidth(700);
    expect(useLayoutStore.getState().rightSidebarWidth).toBe(600);
  });

  it("setBottomPanelHeight clamps to [100, 500]", () => {
    const { setBottomPanelHeight } = useLayoutStore.getState();

    setBottomPanelHeight(50);
    expect(useLayoutStore.getState().bottomPanelHeight).toBe(100);

    useLayoutStore.getState().setBottomPanelHeight(600);
    expect(useLayoutStore.getState().bottomPanelHeight).toBe(500);
  });

  // ── Gutter selectors ──────────────────────────────────────────────────────

  it("getLeftGutterIds returns sorted top/bottom arrays", () => {
    const { registerToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "a", placement: "left-top", order: 1 });
    registerToolWindow({ id: "b", placement: "left-top", order: 0 });
    registerToolWindow({ id: "c", placement: "left-bottom", order: 0 });

    const ids = useLayoutStore.getState().getLeftGutterIds();
    expect(ids.top).toEqual(["b", "a"]); // sorted by order
    expect(ids.bottom).toEqual(["c"]);
  });

  it("getToolWindowsAt returns windows sorted by order", () => {
    const { registerToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "x", placement: "right-top", order: 2 });
    registerToolWindow({ id: "y", placement: "right-top", order: 0 });
    registerToolWindow({ id: "z", placement: "right-top", order: 1 });

    const at = useLayoutStore.getState().getToolWindowsAt("right-top");
    expect(at.map((t) => t.id)).toEqual(["y", "z", "x"]);
  });

  it("getVisibleAt returns only visible windows at a placement", () => {
    const { registerToolWindow, showToolWindow } = useLayoutStore.getState();
    registerToolWindow({ id: "a", placement: "bottom", order: 0 });
    registerToolWindow({ id: "b", placement: "bottom", order: 1 });

    showToolWindow("a");
    const visible = useLayoutStore.getState().getVisibleAt("bottom");
    expect(visible.length).toBe(1);
    expect(visible[0].id).toBe("a");
  });
});
