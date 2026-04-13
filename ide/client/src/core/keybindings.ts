// ─── Keybinding Service ───────────────────────────────────────────────────────
//
// Manages keyboard shortcut bindings and dispatches to the Command Registry.
// Handles platform differences (Ctrl vs Cmd on macOS).
//
// Keybinding format:  "Modifier+Key"
//   Modifiers: Ctrl, Shift, Alt, Meta (Cmd on Mac)
//   Keys:      letter keys, number keys, special keys (Backquote, BracketLeft, etc.)
//   Chords:    "Ctrl+K Ctrl+S" (press Ctrl+K, then Ctrl+S)
//
// Usage:
//   keybindingService.register({ commandId: "file.save", key: "Ctrl+S", mac: "Meta+S" });
//   keybindingService.attach();  // Start listening for keyboard events
//   keybindingService.detach();  // Stop listening
// ──────────────────────────────────────────────────────────────────────────────

import type { KeybindingContribution, Disposable } from "@/types/plugin";
import { commandRegistry } from "./commands";
import { contextKeyService } from "./context-keys";

// ─── Platform Detection ───────────────────────────────────────────────────────

const isMac =
  typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedKey {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string; // Lowercase key name
}

interface RegisteredKeybinding {
  commandId: string;
  parsed: ParsedKey[];  // Array for chord support (usually 1 element)
  displayLabel: string; // Human-readable label for UI
  source: string;
  when?: string;
}

// ─── Key Parsing ──────────────────────────────────────────────────────────────

function parseKeyCombo(combo: string): ParsedKey {
  const parts = combo.split("+").map((p) => p.trim());
  const parsed: ParsedKey = { ctrl: false, shift: false, alt: false, meta: false, key: "" };

  for (const part of parts) {
    const lower = part.toLowerCase();
    switch (lower) {
      case "ctrl":
      case "control":
        parsed.ctrl = true;
        break;
      case "shift":
        parsed.shift = true;
        break;
      case "alt":
      case "option":
        parsed.alt = true;
        break;
      case "meta":
      case "cmd":
      case "command":
      case "super":
        parsed.meta = true;
        break;
      default:
        parsed.key = lower;
    }
  }

  return parsed;
}

function parseKeybinding(keybinding: string): ParsedKey[] {
  // Support chord keybindings: "Ctrl+K Ctrl+S"
  return keybinding.split(/\s+/).map(parseKeyCombo);
}

/**
 * Get the effective key string for the current platform.
 */
function getEffectiveKey(binding: KeybindingContribution): string {
  if (isMac && binding.mac) return binding.mac;
  return binding.key;
}

/**
 * Create a human-readable label from a keybinding string.
 */
function formatKeybinding(keybinding: string): string {
  return keybinding
    .split(/\s+/)
    .map((chord) =>
      chord
        .split("+")
        .map((part) => {
          const lower = part.toLowerCase();
          if (isMac) {
            if (lower === "ctrl" || lower === "control") return "\u2303";
            if (lower === "shift") return "\u21E7";
            if (lower === "alt" || lower === "option") return "\u2325";
            if (lower === "meta" || lower === "cmd" || lower === "command") return "\u2318";
          } else {
            if (lower === "ctrl" || lower === "control") return "Ctrl";
            if (lower === "shift") return "Shift";
            if (lower === "alt" || lower === "option") return "Alt";
            if (lower === "meta" || lower === "cmd" || lower === "command") return "Win";
          }
          // Capitalize first letter for display
          if (lower === "backquote") return "`";
          if (lower === "escape") return "Esc";
          if (lower === "enter" || lower === "return") return "\u21B5";
          if (lower === "backspace") return "\u232B";
          if (lower === "delete") return "Del";
          if (lower === "space") return "Space";
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join(isMac ? "" : "+")
    )
    .join(" ");
}

/**
 * Map a KeyboardEvent.key to our normalized key name.
 */
function normalizeEventKey(e: KeyboardEvent): string {
  // Map special keys
  const key = e.key.toLowerCase();
  if (key === " ") return "space";
  if (key === "`") return "backquote";
  if (key === "\\") return "backslash";
  if (key === "[") return "bracketleft";
  if (key === "]") return "bracketright";
  if (key === "=") return "equal";
  if (key === "-") return "minus";
  return key;
}

function matchesKey(parsed: ParsedKey, e: KeyboardEvent): boolean {
  const eventKey = normalizeEventKey(e);
  return (
    parsed.ctrl === (e.ctrlKey && !e.metaKey) &&
    parsed.shift === e.shiftKey &&
    parsed.alt === e.altKey &&
    parsed.meta === e.metaKey &&
    parsed.key === eventKey
  );
}

// ─── Keybinding Service ───────────────────────────────────────────────────────

class KeybindingServiceImpl {
  private bindings: RegisteredKeybinding[] = [];
  private chordState: ParsedKey | null = null; // For chord keybindings
  private chordTimeout: ReturnType<typeof setTimeout> | null = null;
  private attached = false;
  private handleKeyDown: ((e: KeyboardEvent) => void) | null = null;

  /**
   * Register a keybinding. Returns a Disposable.
   */
  register(binding: KeybindingContribution, source = "core"): Disposable {
    const effectiveKey = getEffectiveKey(binding);
    const parsed = parseKeybinding(effectiveKey);
    const registered: RegisteredKeybinding = {
      commandId: binding.commandId,
      parsed,
      displayLabel: formatKeybinding(effectiveKey),
      source,
      when: binding.when,
    };

    this.bindings.push(registered);

    return {
      dispose: () => {
        const idx = this.bindings.indexOf(registered);
        if (idx !== -1) this.bindings.splice(idx, 1);
      },
    };
  }

  /**
   * Register multiple keybindings. Returns a single Disposable.
   */
  registerMany(bindings: KeybindingContribution[], source = "core"): Disposable {
    const disposables = bindings.map((b) => this.register(b, source));
    return {
      dispose: () => disposables.forEach((d) => d.dispose()),
    };
  }

  /**
   * Get all registered keybindings.
   */
  getAll(): RegisteredKeybinding[] {
    return [...this.bindings];
  }

  /**
   * Get the display label for a command's keybinding.
   */
  getLabel(commandId: string): string | undefined {
    const binding = this.bindings.find((b) => b.commandId === commandId);
    return binding?.displayLabel;
  }

  /**
   * Start listening for keyboard events on the document.
   */
  attach(): void {
    if (this.attached) return;

    this.handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs/textareas (unless it's a global shortcut)
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // For chord keybindings: check second key of chord
      if (this.chordState) {
        if (this.chordTimeout) clearTimeout(this.chordTimeout);
        this.chordTimeout = null;

        const matched = this.bindings.find(
          (b) =>
            b.parsed.length === 2 &&
            matchesKey(b.parsed[0], { ...e, ...this.chordState } as unknown as KeyboardEvent) &&
            matchesKey(b.parsed[1], e)
        );

        this.chordState = null;

        if (matched) {
          // Evaluate `when` clause — skip if condition is not met
          if (!contextKeyService.evaluate(matched.when)) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          commandRegistry.execute(matched.commandId);
          return;
        }
      }

      // Check single-key bindings and first key of chords
      for (const binding of this.bindings) {
        if (!matchesKey(binding.parsed[0], e)) continue;

        // If this is a chord (2+ keys), enter chord state
        if (binding.parsed.length > 1) {
          e.preventDefault();
          this.chordState = binding.parsed[0];
          this.chordTimeout = setTimeout(() => {
            this.chordState = null;
          }, 2000); // 2s chord timeout
          return;
        }

        // Single key binding
        // Skip if typing in input, unless the shortcut uses Ctrl/Meta
        if (isInput && !binding.parsed[0].ctrl && !binding.parsed[0].meta) continue;

        // Evaluate `when` clause — skip if condition is not met
        if (!contextKeyService.evaluate(binding.when)) continue;

        e.preventDefault();
        e.stopPropagation();
        commandRegistry.execute(binding.commandId);
        return;
      }
    };

    document.addEventListener("keydown", this.handleKeyDown, true); // Capture phase
    this.attached = true;
  }

  /**
   * Stop listening for keyboard events.
   */
  detach(): void {
    if (!this.attached || !this.handleKeyDown) return;
    document.removeEventListener("keydown", this.handleKeyDown, true);
    this.handleKeyDown = null;
    this.attached = false;
    if (this.chordTimeout) {
      clearTimeout(this.chordTimeout);
      this.chordTimeout = null;
    }
    this.chordState = null;
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const keybindingService = new KeybindingServiceImpl();

/**
 * Helper: format a keybinding string for display in UI.
 */
export { formatKeybinding, isMac };
