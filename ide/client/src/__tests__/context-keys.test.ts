// ─── Context Key Service Tests ────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { contextKeyService } from "@/core/context-keys";

// ── Reset context keys between tests ─────────────────────────────────────────
// The service is a singleton; we must clear state manually.

beforeEach(() => {
  // Clear all keys by reading them and deleting
  const all = contextKeyService.getAll();
  for (const key of Object.keys(all)) {
    contextKeyService.delete(key);
  }
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("ContextKeyService", () => {
  // ── set / get ──────────────────────────────────────────────────────────────

  it("sets and gets a boolean key", () => {
    contextKeyService.set("workspaceOpen", true);
    expect(contextKeyService.get("workspaceOpen")).toBe(true);
  });

  it("sets and gets a string key", () => {
    contextKeyService.set("editorLangId", "typescript");
    expect(contextKeyService.get("editorLangId")).toBe("typescript");
  });

  it("returns undefined for unset keys", () => {
    expect(contextKeyService.get("nonexistent")).toBeUndefined();
  });

  it("deletes a key", () => {
    contextKeyService.set("temp", true);
    expect(contextKeyService.get("temp")).toBe(true);
    contextKeyService.delete("temp");
    expect(contextKeyService.get("temp")).toBeUndefined();
  });

  it("getAll returns all set keys", () => {
    contextKeyService.set("a", true);
    contextKeyService.set("b", "hello");
    const all = contextKeyService.getAll();
    expect(all).toEqual({ a: true, b: "hello" });
  });

  // ── evaluate: empty / undefined / always ───────────────────────────────────

  it('evaluate returns true for undefined expression', () => {
    expect(contextKeyService.evaluate(undefined)).toBe(true);
  });

  it('evaluate returns true for empty string', () => {
    expect(contextKeyService.evaluate("")).toBe(true);
  });

  it('evaluate returns true for "always"', () => {
    expect(contextKeyService.evaluate("always")).toBe(true);
  });

  // ── evaluate: simple truthy ────────────────────────────────────────────────

  it("evaluates truthy key as true", () => {
    contextKeyService.set("editorFocused", true);
    expect(contextKeyService.evaluate("editorFocused")).toBe(true);
  });

  it("evaluates falsy key as false", () => {
    contextKeyService.set("editorFocused", false);
    expect(contextKeyService.evaluate("editorFocused")).toBe(false);
  });

  it("evaluates unset key as false (falsy)", () => {
    expect(contextKeyService.evaluate("unknownKey")).toBe(false);
  });

  // ── evaluate: negation ─────────────────────────────────────────────────────

  it("evaluates !key (negation) correctly", () => {
    contextKeyService.set("editorFocused", true);
    expect(contextKeyService.evaluate("!editorFocused")).toBe(false);

    contextKeyService.set("editorFocused", false);
    expect(contextKeyService.evaluate("!editorFocused")).toBe(true);
  });

  it("evaluates !unsetKey as true", () => {
    expect(contextKeyService.evaluate("!missing")).toBe(true);
  });

  // ── evaluate: AND ──────────────────────────────────────────────────────────

  it("evaluates AND expression (both true)", () => {
    contextKeyService.set("a", true);
    contextKeyService.set("b", true);
    expect(contextKeyService.evaluate("a && b")).toBe(true);
  });

  it("evaluates AND expression (one false)", () => {
    contextKeyService.set("a", true);
    contextKeyService.set("b", false);
    expect(contextKeyService.evaluate("a && b")).toBe(false);
  });

  // ── evaluate: OR ───────────────────────────────────────────────────────────

  it("evaluates OR expression (one true)", () => {
    contextKeyService.set("a", false);
    contextKeyService.set("b", true);
    expect(contextKeyService.evaluate("a || b")).toBe(true);
  });

  it("evaluates OR expression (both false)", () => {
    contextKeyService.set("a", false);
    contextKeyService.set("b", false);
    expect(contextKeyService.evaluate("a || b")).toBe(false);
  });

  // ── evaluate: equality ─────────────────────────────────────────────────────

  it("evaluates == equality expression", () => {
    contextKeyService.set("editorLangId", "typescript");
    expect(contextKeyService.evaluate("editorLangId == typescript")).toBe(true);
    expect(contextKeyService.evaluate("editorLangId == python")).toBe(false);
  });

  // ── evaluate: inequality ───────────────────────────────────────────────────

  it("evaluates != inequality expression", () => {
    contextKeyService.set("editorLangId", "typescript");
    expect(contextKeyService.evaluate("editorLangId != python")).toBe(true);
    expect(contextKeyService.evaluate("editorLangId != typescript")).toBe(false);
  });

  // ── evaluate: combined ─────────────────────────────────────────────────────

  it("evaluates complex AND + negation", () => {
    contextKeyService.set("editorFocused", true);
    contextKeyService.set("terminalOpen", false);
    expect(contextKeyService.evaluate("editorFocused && !terminalOpen")).toBe(true);
  });

  // ── onChange listener ──────────────────────────────────────────────────────

  it("fires onChange listener when a key changes", () => {
    const listener = vi.fn();
    const d = contextKeyService.onChange(listener);

    contextKeyService.set("foo", true);
    expect(listener).toHaveBeenCalledTimes(1);

    contextKeyService.set("foo", false);
    expect(listener).toHaveBeenCalledTimes(2);

    d.dispose();

    // After dispose, listener should not fire
    contextKeyService.set("foo", true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not fire onChange if value does not change", () => {
    contextKeyService.set("stable", true);
    const listener = vi.fn();
    const d = contextKeyService.onChange(listener);

    contextKeyService.set("stable", true); // same value
    expect(listener).not.toHaveBeenCalled();

    d.dispose();
  });

  it("fires onChange when a key is deleted", () => {
    contextKeyService.set("temp", true);
    const listener = vi.fn();
    const d = contextKeyService.onChange(listener);

    contextKeyService.delete("temp");
    expect(listener).toHaveBeenCalledTimes(1);

    d.dispose();
  });
});
