// ─── Keybinding Service Tests ─────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { keybindingService } from "@/core/keybindings";
import { commandRegistry } from "@/core/commands";
import { contextKeyService } from "@/core/context-keys";

// ── Cleanup helpers ──────────────────────────────────────────────────────────

let disposables: Array<{ dispose: () => void }> = [];

beforeEach(() => {
  disposables.forEach((d) => d.dispose());
  disposables = [];
  // Clear context keys
  const all = contextKeyService.getAll();
  for (const key of Object.keys(all)) {
    contextKeyService.delete(key);
  }
  keybindingService.detach();
});

afterEach(() => {
  keybindingService.detach();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function fireKeydown(opts: {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}) {
  const event = new KeyboardEvent("keydown", {
    key: opts.key,
    ctrlKey: opts.ctrlKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    altKey: opts.altKey ?? false,
    metaKey: opts.metaKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("KeybindingService", () => {
  it("registers a keybinding and returns it via getAll", () => {
    const d = keybindingService.register({
      commandId: "test.save",
      key: "Ctrl+S",
    });
    disposables.push(d);

    const all = keybindingService.getAll();
    expect(all.some((b) => b.commandId === "test.save")).toBe(true);
  });

  it("disposes a keybinding", () => {
    const d = keybindingService.register({
      commandId: "test.dispose",
      key: "Ctrl+D",
    });

    expect(keybindingService.getAll().some((b) => b.commandId === "test.dispose")).toBe(true);
    d.dispose();
    expect(keybindingService.getAll().some((b) => b.commandId === "test.dispose")).toBe(false);
  });

  it("getLabel returns the display label for a command", () => {
    const d = keybindingService.register({
      commandId: "test.label",
      key: "Ctrl+Shift+P",
    });
    disposables.push(d);

    const label = keybindingService.getLabel("test.label");
    expect(label).toBeDefined();
    // On non-Mac, should contain "Ctrl" and "Shift"
    expect(label).toContain("Ctrl");
    expect(label).toContain("Shift");
  });

  it("registerMany registers and disposes multiple keybindings", () => {
    const d = keybindingService.registerMany([
      { commandId: "test.k1", key: "Ctrl+1" },
      { commandId: "test.k2", key: "Ctrl+2" },
    ]);
    disposables.push(d);

    const all = keybindingService.getAll();
    expect(all.some((b) => b.commandId === "test.k1")).toBe(true);
    expect(all.some((b) => b.commandId === "test.k2")).toBe(true);

    d.dispose();
    const after = keybindingService.getAll();
    expect(after.some((b) => b.commandId === "test.k1")).toBe(false);
    expect(after.some((b) => b.commandId === "test.k2")).toBe(false);
  });

  it("dispatches command on matching keydown when attached", () => {
    const handler = vi.fn();
    const cmdD = commandRegistry.register({
      id: "test.shortcut",
      label: "Shortcut",
      handler,
    });
    disposables.push(cmdD);

    const kbD = keybindingService.register({
      commandId: "test.shortcut",
      key: "Ctrl+S",
    });
    disposables.push(kbD);

    keybindingService.attach();
    fireKeydown({ key: "s", ctrlKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch when when-clause is false", () => {
    const handler = vi.fn();
    const cmdD = commandRegistry.register({
      id: "test.conditional",
      label: "Conditional",
      handler,
    });
    disposables.push(cmdD);

    const kbD = keybindingService.register({
      commandId: "test.conditional",
      key: "Ctrl+E",
      when: "editorFocused",
    });
    disposables.push(kbD);

    // editorFocused is not set (undefined → falsy)
    keybindingService.attach();
    fireKeydown({ key: "e", ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();

    // Now set it to true
    contextKeyService.set("editorFocused", true);
    fireKeydown({ key: "e", ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not dispatch when detached", () => {
    const handler = vi.fn();
    const cmdD = commandRegistry.register({
      id: "test.detached",
      label: "Detached",
      handler,
    });
    disposables.push(cmdD);

    const kbD = keybindingService.register({
      commandId: "test.detached",
      key: "Ctrl+X",
    });
    disposables.push(kbD);

    // Attach then detach
    keybindingService.attach();
    keybindingService.detach();

    fireKeydown({ key: "x", ctrlKey: true });
    expect(handler).not.toHaveBeenCalled();
  });
});
