// ─── Editor Action Store ───────────────────────────────────────────────────────
//
// Registry of editor actions contributed by plugins.
// Plugins call context.editor.registerAction() which writes here.
// CodeEditor.tsx reads from this store and registers actions in Monaco.
// ──────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import type { EditorAction } from "@/types/plugin";

// ─── Store ────────────────────────────────────────────────────────────────────

interface EditorActionState {
  actions: EditorAction[];

  /** Register an action. Returns a function to unregister it. */
  register(action: EditorAction): () => void;
}

export const useEditorActionStore = create<EditorActionState>()((set) => ({
  actions: [],

  register(action) {
    set((s) => ({
      actions: [
        // Replace if same ID already registered
        ...s.actions.filter((a) => a.id !== action.id),
        action,
      ],
    }));
    return () => {
      set((s) => ({ actions: s.actions.filter((a) => a.id !== action.id) }));
    };
  },
}));
