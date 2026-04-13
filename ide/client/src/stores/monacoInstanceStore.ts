// ─── Monaco Instance Store ────────────────────────────────────────────────────
//
// Shares the current Monaco editor & namespace across components.
//
// The editor instance and monaco namespace are stored as module-level variables
// (NOT in Zustand — they're non-serializable, same pattern as SSE EventSource).
// A tiny Zustand store holds a `revision` counter that increments on model changes,
// allowing subscribers (e.g. useDocumentSymbols) to re-render reactively.
// ──────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import type { OnMount, Monaco } from "@monaco-editor/react";

// Derive editor type from @monaco-editor/react's OnMount callback signature
type MonacoEditor = Parameters<OnMount>[0];

// ─── Module-level refs (non-serializable) ─────────────────────────────────────

let _editor: MonacoEditor | null = null;
let _monaco: Monaco | null = null;
let _contentDisposable: { dispose(): void } | null = null;

// ─── Public getters ───────────────────────────────────────────────────────────

export function getMonacoEditor(): MonacoEditor | null {
  return _editor;
}

export function getMonacoNamespace(): Monaco | null {
  return _monaco;
}

// ─── Reactive revision counter ────────────────────────────────────────────────

interface MonacoInstanceState {
  /** Increments whenever the editor model content changes or model is swapped. */
  revision: number;
  /** Bumps the revision — called internally on model content change. */
  bump: () => void;
}

export const useMonacoInstanceStore = create<MonacoInstanceState>()((set) => ({
  revision: 0,
  bump: () => set((s) => ({ revision: s.revision + 1 })),
}));

// ─── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Called by CodeEditor on mount to share the editor instance.
 * Subscribes to model content changes to bump the revision counter.
 */
export function setMonacoInstance(
  ed: MonacoEditor,
  monaco: Monaco,
): void {
  // Clean up previous subscription
  _contentDisposable?.dispose();
  _contentDisposable = null;

  _editor = ed;
  _monaco = monaco;

  // Listen for model changes (tab switches) and content changes
  const modelDisposable = ed.onDidChangeModel(() => {
    rebindContentListener(ed);
    useMonacoInstanceStore.getState().bump();
  });

  rebindContentListener(ed);
  useMonacoInstanceStore.getState().bump();

  // Store the model-change disposable so we can clean up later
  _contentDisposable = {
    dispose: () => {
      modelDisposable.dispose();
    },
  };
}

/** Re-subscribe to `onDidChangeContent` for the current model. */
let _contentChangeDisposable: { dispose(): void } | null = null;

function rebindContentListener(ed: MonacoEditor): void {
  _contentChangeDisposable?.dispose();
  _contentChangeDisposable = null;

  const model = ed.getModel();
  if (!model) return;

  _contentChangeDisposable = model.onDidChangeContent(() => {
    useMonacoInstanceStore.getState().bump();
  });
}

/**
 * Called by CodeEditor on unmount to release the editor reference.
 */
export function clearMonacoInstance(): void {
  _contentChangeDisposable?.dispose();
  _contentChangeDisposable = null;
  _contentDisposable?.dispose();
  _contentDisposable = null;
  _editor = null;
  _monaco = null;
  useMonacoInstanceStore.getState().bump();
}
