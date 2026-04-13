// ─── Context Key Service ──────────────────────────────────────────────────────
//
// A simple context-key registry that evaluates `when` clause expressions.
// Used by menus, commands, keybindings, and status bar items to conditionally
// show/hide or enable/disable contributions.
//
// Expression syntax (intentionally simple — no nesting/parentheses):
//   - "key"                → truthy check on key
//   - "!key"               → falsy check on key
//   - "a && b"             → AND — all must be truthy
//   - "a || b"             → OR  — any must be truthy
//   - "key == value"       → equality check (string comparison)
//   - "key != value"       → inequality check
//   - "always"             → always true
//
// Built-in keys (set automatically via Zustand subscriptions):
//   workspaceOpen, editorFocused, editorHasSelection, editorLangId,
//   activeToolWindow, terminalOpen
// ──────────────────────────────────────────────────────────────────────────────

import type { Disposable } from "@/types/plugin";

// ─── Service ──────────────────────────────────────────────────────────────────

class ContextKeyServiceImpl {
  private keys = new Map<string, boolean | string>();
  private listeners = new Set<() => void>();

  /**
   * Set a context key value. Triggers listeners if the value changed.
   */
  set(key: string, value: boolean | string): void {
    const prev = this.keys.get(key);
    if (prev === value) return;
    this.keys.set(key, value);
    this.notify();
  }

  /**
   * Remove a context key entirely.
   */
  delete(key: string): void {
    if (!this.keys.has(key)) return;
    this.keys.delete(key);
    this.notify();
  }

  /**
   * Get a context key's current value.
   */
  get(key: string): boolean | string | undefined {
    return this.keys.get(key);
  }

  /**
   * Evaluate a `when` clause expression.
   * Returns `true` if the expression is empty/undefined (no condition = always show).
   */
  evaluate(expression: string | undefined): boolean {
    if (!expression || expression === "always") return true;

    const trimmed = expression.trim();
    if (!trimmed) return true;

    // OR takes lower precedence than AND
    if (trimmed.includes("||")) {
      return trimmed.split("||").some((part) => this.evaluateAnd(part.trim()));
    }

    return this.evaluateAnd(trimmed);
  }

  /**
   * Listen for any context key change.
   */
  onChange(listener: () => void): Disposable {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  }

  /**
   * Get all current context keys (for debugging).
   */
  getAll(): Record<string, boolean | string> {
    const result: Record<string, boolean | string> = {};
    for (const [k, v] of this.keys) {
      result[k] = v;
    }
    return result;
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private evaluateAnd(expression: string): boolean {
    if (expression.includes("&&")) {
      return expression.split("&&").every((part) => this.evaluateAtom(part.trim()));
    }
    return this.evaluateAtom(expression);
  }

  private evaluateAtom(atom: string): boolean {
    // Equality: "key == value"
    if (atom.includes("==")) {
      const [lhs, rhs] = atom.split("==").map((s) => s.trim());
      if (!lhs) return false;
      const val = this.keys.get(lhs);
      return String(val) === rhs;
    }

    // Inequality: "key != value"
    if (atom.includes("!=")) {
      const [lhs, rhs] = atom.split("!=").map((s) => s.trim());
      if (!lhs) return false;
      const val = this.keys.get(lhs);
      return String(val) !== rhs;
    }

    // Negation: "!key"
    if (atom.startsWith("!")) {
      const key = atom.slice(1).trim();
      const val = this.keys.get(key);
      return !val;
    }

    // Simple truthy: "key"
    const val = this.keys.get(atom);
    return !!val;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error("[ContextKeyService] Listener error:", err);
      }
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const contextKeyService = new ContextKeyServiceImpl();
