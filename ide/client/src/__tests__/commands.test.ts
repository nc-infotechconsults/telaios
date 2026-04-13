// ─── Command Registry Tests ───────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { commandRegistry } from "@/core/commands";

// ── Helper: clear all commands between tests ─────────────────────────────────
// The registry is a singleton, so we need to dispose leftover commands.

let cleanup: Array<{ dispose: () => void }> = [];

beforeEach(() => {
  cleanup.forEach((d) => d.dispose());
  cleanup = [];
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("CommandRegistry", () => {
  it("registers and retrieves a command", () => {
    const d = commandRegistry.register({
      id: "test.hello",
      label: "Hello",
      handler: () => {},
    });
    cleanup.push(d);

    expect(commandRegistry.has("test.hello")).toBe(true);
    expect(commandRegistry.get("test.hello")?.label).toBe("Hello");
  });

  it("returns source as 'core' by default", () => {
    const d = commandRegistry.register({
      id: "test.src",
      label: "Source",
      handler: () => {},
    });
    cleanup.push(d);

    expect(commandRegistry.get("test.src")?.source).toBe("core");
  });

  it("returns source from plugin when specified", () => {
    const d = commandRegistry.register(
      { id: "test.plugin", label: "Plugin", handler: () => {} },
      "my-plugin",
    );
    cleanup.push(d);

    expect(commandRegistry.get("test.plugin")?.source).toBe("my-plugin");
  });

  it("executes a registered command handler", async () => {
    const handler = vi.fn();
    const d = commandRegistry.register({
      id: "test.exec",
      label: "Exec",
      handler,
    });
    cleanup.push(d);

    await commandRegistry.execute("test.exec", "arg1", 42);
    expect(handler).toHaveBeenCalledWith("arg1", 42);
  });

  it("does not throw for unknown command (warns instead)", async () => {
    // Should silently warn, not throw
    await expect(commandRegistry.execute("nonexistent")).resolves.toBeUndefined();
  });

  it("disposes a command", () => {
    const d = commandRegistry.register({
      id: "test.disposable",
      label: "Disposable",
      handler: () => {},
    });
    expect(commandRegistry.has("test.disposable")).toBe(true);

    d.dispose();
    expect(commandRegistry.has("test.disposable")).toBe(false);
  });

  it("getAll returns all registered commands", () => {
    const d1 = commandRegistry.register({ id: "test.a", label: "A", handler: () => {} });
    const d2 = commandRegistry.register({ id: "test.b", label: "B", handler: () => {} });
    cleanup.push(d1, d2);

    const all = commandRegistry.getAll();
    const ids = all.map((c) => c.id);
    expect(ids).toContain("test.a");
    expect(ids).toContain("test.b");
  });

  it("registerMany registers and disposes multiple commands", () => {
    const d = commandRegistry.registerMany([
      { id: "test.m1", label: "M1", handler: () => {} },
      { id: "test.m2", label: "M2", handler: () => {} },
    ]);
    cleanup.push(d);

    expect(commandRegistry.has("test.m1")).toBe(true);
    expect(commandRegistry.has("test.m2")).toBe(true);

    d.dispose();
    expect(commandRegistry.has("test.m1")).toBe(false);
    expect(commandRegistry.has("test.m2")).toBe(false);
  });

  it("search finds commands by fuzzy label match", () => {
    const d = commandRegistry.registerMany([
      { id: "test.formatDoc", label: "Format Document", handler: () => {} },
      { id: "test.openFile", label: "Open File", handler: () => {} },
      { id: "test.saveAll", label: "Save All", handler: () => {} },
    ]);
    cleanup.push(d);

    const results = commandRegistry.search("fmt");
    // "fmt" matches "Format" (f, m, t appear in order)
    expect(results.some((r) => r.id === "test.formatDoc")).toBe(true);
    // "fmt" should not match "Open File"
    expect(results.some((r) => r.id === "test.openFile")).toBe(false);
  });

  it("getByCategory filters by category", () => {
    const d = commandRegistry.registerMany([
      { id: "test.catA", label: "A", category: "file", handler: () => {} },
      { id: "test.catB", label: "B", category: "edit", handler: () => {} },
      { id: "test.catC", label: "C", category: "file", handler: () => {} },
    ]);
    cleanup.push(d);

    const fileCmds = commandRegistry.getByCategory("file");
    expect(fileCmds.length).toBe(2);
    expect(fileCmds.every((c) => c.category === "file")).toBe(true);
  });

  it("onDidRegister fires when a new command is registered", () => {
    const listener = vi.fn();
    const listenerDisposable = commandRegistry.onDidRegister(listener);
    cleanup.push(listenerDisposable);

    const d = commandRegistry.register({
      id: "test.notify",
      label: "Notify",
      handler: () => {},
    });
    cleanup.push(d);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ id: "test.notify" }),
    );

    listenerDisposable.dispose();
    // After disposing listener, it should not fire again
    const d2 = commandRegistry.register({
      id: "test.notify2",
      label: "Notify2",
      handler: () => {},
    });
    cleanup.push(d2);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
