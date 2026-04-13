// ─── useBreadcrumbSymbols Hook ────────────────────────────────────────────────
//
// Provides breadcrumb data: file-path segments + symbol chain from cursor.
//
// Subscribes to:
//   1. Document symbols (via useDocumentSymbols)
//   2. Monaco cursor position (debounced 150ms)
//
// Returns an array of BreadcrumbSegment objects for rendering.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  useDocumentSymbols,
  type OutlineSymbol,
} from "@/hooks/useDocumentSymbols";
import {
  getMonacoEditor,
} from "@/stores/monacoInstanceStore";
import { useEditorStore } from "@/stores/editorStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BreadcrumbSegment {
  /** Display label */
  label: string;
  /** "dir" | "file" | "symbol" */
  type: "dir" | "file" | "symbol";
  /** For dir: the partial path up to this directory. For file: full path. */
  path?: string;
  /** For symbol segments: the symbol itself */
  symbol?: OutlineSymbol;
  /** For symbol segments: sibling symbols at the same tree level */
  siblings?: OutlineSymbol[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Walk a tree of OutlineSymbol to find the chain of symbols
 * from root to the deepest symbol whose range contains the cursor.
 */
function findSymbolChain(
  symbols: OutlineSymbol[],
  line: number,
  column: number,
): { chain: OutlineSymbol[]; siblingsByDepth: OutlineSymbol[][] } {
  const chain: OutlineSymbol[] = [];
  const siblingsByDepth: OutlineSymbol[][] = [];

  let current = symbols;

  while (current.length > 0) {
    const match = current.find(
      (s) =>
        line >= s.range.startLineNumber &&
        line <= s.range.endLineNumber &&
        // If on the start line, column must be >= startColumn
        (line > s.range.startLineNumber || column >= s.range.startColumn) &&
        // If on the end line, column must be <= endColumn
        (line < s.range.endLineNumber || column <= s.range.endColumn),
    );

    if (!match) break;

    siblingsByDepth.push(current);
    chain.push(match);
    current = match.children;
  }

  return { chain, siblingsByDepth };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Create simple path-only breadcrumb segments (no symbol tracking).
 * Useful for standalone CodeEditor without group context.
 */
export function pathToSegments(filePath: string | null): BreadcrumbSegment[] {
  if (!filePath) return [];
  const parts = filePath.split("/").filter(Boolean);
  return parts.map((part, i) => {
    const isFile = i === parts.length - 1;
    return {
      label: part,
      type: isFile ? ("file" as const) : ("dir" as const),
      path: isFile ? filePath : parts.slice(0, i + 1).join("/"),
    };
  });
}

/**
 * Returns breadcrumb segments for the current file and cursor position.
 *
 * @param filePath  – The active file path (e.g. "src/stores/editorStore.ts")
 * @param isActive  – Whether this group currently owns the shared Monaco instance
 */
export function useBreadcrumbSymbols(
  filePath: string | null,
  isActive: boolean,
): BreadcrumbSegment[] {
  const { symbols } = useDocumentSymbols();
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorColumn, setCursorColumn] = useState(1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read the cursor from the active group's editor store for initial render
  const storedCursor = useEditorStore((s) => {
    const g = s.groups[s.activeGroupId];
    if (!g) return null;
    const tab = g.tabs.find((t) => t.id === g.activeTabId);
    if (!tab?.cursorLine) return null;
    return { line: tab.cursorLine, column: tab.cursorColumn ?? 1 };
  });

  // Seed cursor from store on mount / tab switch
  useEffect(() => {
    if (storedCursor) {
      setCursorLine(storedCursor.line);
      setCursorColumn(storedCursor.column);
    }
  }, [storedCursor?.line, storedCursor?.column]);

  // Subscribe to Monaco cursor position changes (debounced 150ms)
  useEffect(() => {
    if (!isActive) return;

    const editor = getMonacoEditor();
    if (!editor) return;

    const disposable = editor.onDidChangeCursorPosition((e) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setCursorLine(e.position.lineNumber);
        setCursorColumn(e.position.column);
      }, 150);
    });

    return () => {
      disposable.dispose();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isActive, filePath]);

  // Build the path segments
  const pathSegments: BreadcrumbSegment[] = useMemo(() => {
    if (!filePath) return [];
    const parts = filePath.split("/").filter(Boolean);
    return parts.map((part, i) => {
      const isFile = i === parts.length - 1;
      return {
        label: part,
        type: isFile ? ("file" as const) : ("dir" as const),
        path: isFile ? filePath : parts.slice(0, i + 1).join("/"),
      };
    });
  }, [filePath]);

  // Build the symbol segments (only when this group is active)
  const symbolSegments: BreadcrumbSegment[] = useMemo(() => {
    if (!isActive || symbols.length === 0) return [];

    const { chain, siblingsByDepth } = findSymbolChain(
      symbols,
      cursorLine,
      cursorColumn,
    );

    return chain.map((sym, i) => ({
      label: sym.name,
      type: "symbol" as const,
      symbol: sym,
      siblings: siblingsByDepth[i],
    }));
  }, [isActive, symbols, cursorLine, cursorColumn]);

  // Combine path + symbol segments
  return useMemo(
    () => [...pathSegments, ...symbolSegments],
    [pathSegments, symbolSegments],
  );
}
