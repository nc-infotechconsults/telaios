// ─── useDocumentSymbols Hook ──────────────────────────────────────────────────
//
// Extracts document symbols (functions, classes, variables, etc.) from the
// current Monaco editor model. Returns a tree of OutlineSymbol items that the
// FileOutlinePanel renders.
//
// Re-queries symbols when:
//   1. The active editor tab changes
//   2. The model content changes (debounced 300ms)
//
// Uses Monaco's DocumentSymbolProvider registry (internal but standard API
// used by all Monaco-based editors for outline functionality).
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef } from "react";
import type { Monaco } from "@monaco-editor/react";
import { useEditorStore } from "@/stores/editorStore";
import {
  useMonacoInstanceStore,
  getMonacoEditor,
  getMonacoNamespace,
} from "@/stores/monacoInstanceStore";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OutlineSymbol {
  name: string;
  detail?: string;
  kind: number; // monaco.languages.SymbolKind
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  children: OutlineSymbol[];
}

// ─── Symbol Kind Labels (for display) ─────────────────────────────────────────

const SYMBOL_KIND_LABELS: Record<number, string> = {
  0: "File",
  1: "Module",
  2: "Namespace",
  3: "Package",
  4: "Class",
  5: "Method",
  6: "Property",
  7: "Field",
  8: "Constructor",
  9: "Enum",
  10: "Interface",
  11: "Function",
  12: "Variable",
  13: "Constant",
  14: "String",
  15: "Number",
  16: "Boolean",
  17: "Array",
  18: "Object",
  19: "Key",
  20: "Null",
  21: "EnumMember",
  22: "Struct",
  23: "Event",
  24: "Operator",
  25: "TypeParameter",
};

export function symbolKindLabel(kind: number): string {
  return SYMBOL_KIND_LABELS[kind] ?? "Symbol";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDocumentSymbols(): {
  symbols: OutlineSymbol[];
  loading: boolean;
} {
  const [symbols, setSymbols] = useState<OutlineSymbol[]>([]);
  const [loading, setLoading] = useState(false);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const revision = useMonacoInstanceStore((s) => s.revision);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    // Clear pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    cancelRef.current = false;

    debounceRef.current = setTimeout(() => {
      void querySymbols();
    }, 300);

    return () => {
      cancelRef.current = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };

    async function querySymbols() {
      const editor = getMonacoEditor();
      const monaco = getMonacoNamespace();
      if (!editor || !monaco) {
        setSymbols([]);
        return;
      }

      const model = editor.getModel();
      if (!model) {
        setSymbols([]);
        return;
      }

      setLoading(true);

      try {
        const result = await getDocumentSymbols(monaco, model);
        if (!cancelRef.current) {
          setSymbols(result);
        }
      } catch {
        if (!cancelRef.current) {
          setSymbols([]);
        }
      } finally {
        if (!cancelRef.current) {
          setLoading(false);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, revision]);

  return { symbols, loading };
}

// ─── Symbol Extraction ────────────────────────────────────────────────────────

// Use a type alias for the ITextModel — derived from the editor's getModel return
type TextModel = NonNullable<ReturnType<NonNullable<ReturnType<typeof getMonacoEditor>>["getModel"]>>;

/**
 * Query document symbols from Monaco's registered DocumentSymbolProviders.
 *
 * This accesses the internal `DocumentSymbolProviderRegistry` which is the
 * standard mechanism used by Monaco-based editors (including VS Code) to
 * populate the outline view. It's not in the official public API surface but
 * is stable across Monaco versions.
 *
 * Falls back to the TypeScript worker's getNavigationTree for TS/JS files.
 */
async function getDocumentSymbols(
  monaco: Monaco,
  model: TextModel,
): Promise<OutlineSymbol[]> {
  // Try the internal DocumentSymbolProviderRegistry
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registry = (monaco.languages as any).DocumentSymbolProviderRegistry;

  if (registry) {
    try {
      const providers = registry.ordered(model);
      if (providers && providers.length > 0) {
        const raw = await providers[0].provideDocumentSymbols(model);
        if (raw && !Array.isArray(raw)) return [];
        if (raw) return mapSymbols(raw);
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: try TypeScript/JavaScript worker's getNavigationTree
  const lang = model.getLanguageId();
  if (lang === "typescript" || lang === "javascript") {
    try {
      const tsDefaults = monaco.languages.typescript;
      const getWorker =
        lang === "typescript"
          ? tsDefaults.getTypeScriptWorker
          : tsDefaults.getJavaScriptWorker;
      const worker = await getWorker();
      const client = await worker(model.uri);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof (client as any).getNavigationTree === "function") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tree = await (client as any).getNavigationTree(
          model.uri.toString(),
        );
        if (tree) {
          return mapNavigationTree(tree, model);
        }
      }
    } catch {
      // Fall through
    }
  }

  return [];
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

/**
 * Map Monaco's internal DocumentSymbol[] to our OutlineSymbol[].
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSymbols(raw: any[]): OutlineSymbol[] {
  return raw.map((s) => ({
    name: s.name ?? s.label ?? "?",
    detail: s.detail,
    kind: s.kind ?? 11, // default to Function
    range: s.range ?? s.selectionRange ?? {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    },
    children: s.children ? mapSymbols(s.children) : [],
  }));
}

/**
 * Map TypeScript worker's NavigationTree to OutlineSymbol[].
 */
function mapNavigationTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tree: any,
  model: TextModel,
): OutlineSymbol[] {
  // NavigationTree has: text, kind (string), spans[], childItems[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function convert(node: any): OutlineSymbol | null {
    if (!node || !node.text || node.text === "<global>") return null;

    const span = node.spans?.[0];
    let range = {
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
    };

    if (span) {
      const startPos = model.getPositionAt(span.start);
      const endPos = model.getPositionAt(span.start + span.length);
      range = {
        startLineNumber: startPos.lineNumber,
        startColumn: startPos.column,
        endLineNumber: endPos.lineNumber,
        endColumn: endPos.column,
      };
    }

    const children: OutlineSymbol[] = [];
    if (node.childItems) {
      for (const child of node.childItems) {
        const mapped = convert(child);
        if (mapped) children.push(mapped);
      }
    }

    return {
      name: node.text,
      kind: tsKindToSymbolKind(node.kind),
      range,
      children,
    };
  }

  // The root is usually the file itself — return its children
  if (tree.childItems) {
    const result: OutlineSymbol[] = [];
    for (const child of tree.childItems) {
      const mapped = convert(child);
      if (mapped) result.push(mapped);
    }
    return result;
  }

  const single = convert(tree);
  return single ? [single] : [];
}

/**
 * Map TypeScript's string kind names to Monaco SymbolKind numbers.
 */
function tsKindToSymbolKind(kind: string): number {
  const map: Record<string, number> = {
    module: 1,
    class: 4,
    method: 5,
    property: 6,
    field: 7,
    constructor: 8,
    enum: 9,
    interface: 10,
    function: 11,
    var: 12,
    let: 12,
    const: 13,
    string: 14,
    number: 15,
    boolean: 16,
    array: 17,
    object: 18,
    key: 19,
    "enum member": 21,
    struct: 22,
    event: 23,
    operator: 24,
    "type parameter": 25,
    type: 10, // treat type aliases like interfaces
    alias: 1,
  };
  return map[kind?.toLowerCase()] ?? 12; // default to Variable
}
