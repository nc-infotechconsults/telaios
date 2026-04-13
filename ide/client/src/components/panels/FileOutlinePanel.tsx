// ─── File Outline Panel ───────────────────────────────────────────────────────
//
// Displays the symbol structure of the active file as a collapsible tree.
// Clicking a symbol scrolls the editor to that location.
//
// Registered as a core tool window (ID: "outline", shortcut: Alt+7).
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, memo, type FC } from "react";
import {
  useDocumentSymbols,
  symbolKindLabel,
  type OutlineSymbol,
} from "@/hooks/useDocumentSymbols";
import { getMonacoEditor } from "@/stores/monacoInstanceStore";
import { useEditorStore } from "@/stores/editorStore";
import {
  ChevronRight,
  ChevronDown,
  Box,
  Braces,
  Code2,
  Diamond,
  FileCode,
  FunctionSquare,
  Hash,
  Layers,
  LetterText,
  List,
  Puzzle,
  SquareCode,
  Tag,
  Type,
  Variable,
  Loader2,
} from "lucide-react";

// ─── Symbol Kind → Icon mapping ──────────────────────────────────────────────

function SymbolIcon({ kind, size = 14 }: { kind: number; size?: number }) {
  const cls = "shrink-0";
  // Mapped to Monaco's SymbolKind enum values
  switch (kind) {
    case 0: // File
      return <FileCode size={size} className={`${cls} text-zinc-400`} />;
    case 1: // Module
      return <Layers size={size} className={`${cls} text-amber-400`} />;
    case 2: // Namespace
      return <Braces size={size} className={`${cls} text-amber-400`} />;
    case 4: // Class
      return <Diamond size={size} className={`${cls} text-amber-400`} />;
    case 5: // Method
      return <FunctionSquare size={size} className={`${cls} text-violet-400`} />;
    case 6: // Property
    case 7: // Field
      return <Tag size={size} className={`${cls} text-cyan-400`} />;
    case 8: // Constructor
      return <SquareCode size={size} className={`${cls} text-violet-400`} />;
    case 9: // Enum
      return <List size={size} className={`${cls} text-orange-400`} />;
    case 10: // Interface
      return <Puzzle size={size} className={`${cls} text-cyan-400`} />;
    case 11: // Function
      return <FunctionSquare size={size} className={`${cls} text-violet-400`} />;
    case 12: // Variable
      return <Variable size={size} className={`${cls} text-blue-400`} />;
    case 13: // Constant
      return <Hash size={size} className={`${cls} text-blue-400`} />;
    case 14: // String
      return <LetterText size={size} className={`${cls} text-green-400`} />;
    case 15: // Number
    case 16: // Boolean
      return <Hash size={size} className={`${cls} text-yellow-400`} />;
    case 17: // Array
    case 18: // Object
      return <Box size={size} className={`${cls} text-cyan-400`} />;
    case 21: // EnumMember
      return <Code2 size={size} className={`${cls} text-orange-400`} />;
    case 25: // TypeParameter
      return <Type size={size} className={`${cls} text-teal-400`} />;
    default:
      return <Code2 size={size} className={`${cls} text-zinc-400`} />;
  }
}

// ─── Tree Node ────────────────────────────────────────────────────────────────

interface SymbolNodeProps {
  symbol: OutlineSymbol;
  depth: number;
  onNavigate: (line: number, column: number) => void;
}

const SymbolNode: FC<SymbolNodeProps> = memo(
  ({ symbol, depth, onNavigate }) => {
    const [expanded, setExpanded] = useState(true);
    const hasChildren = symbol.children.length > 0;

    const handleClick = useCallback(() => {
      onNavigate(symbol.range.startLineNumber, symbol.range.startColumn);
    }, [symbol.range.startLineNumber, symbol.range.startColumn, onNavigate]);

    const handleToggle = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        setExpanded((prev) => !prev);
      },
      [],
    );

    return (
      <>
        <button
          type="button"
          className="flex items-center w-full gap-1.5 px-2 py-[3px] text-left text-xs 
                     hover:bg-white/[0.06] rounded-sm transition-colors group"
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={handleClick}
          title={`${symbolKindLabel(symbol.kind)}: ${symbol.name} (line ${symbol.range.startLineNumber})`}
        >
          {/* Expand/collapse toggle */}
          {hasChildren ? (
            <span
              onClick={handleToggle}
              className="shrink-0 w-4 h-4 flex items-center justify-center
                         text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >
              {expanded ? (
                <ChevronDown size={12} />
              ) : (
                <ChevronRight size={12} />
              )}
            </span>
          ) : (
            <span className="shrink-0 w-4" />
          )}

          {/* Icon */}
          <SymbolIcon kind={symbol.kind} />

          {/* Name */}
          <span className="truncate text-zinc-300 group-hover:text-zinc-100">
            {symbol.name}
          </span>

          {/* Line number hint */}
          <span className="ml-auto shrink-0 text-[10px] text-zinc-600 group-hover:text-zinc-500">
            {symbol.range.startLineNumber}
          </span>
        </button>

        {/* Children */}
        {hasChildren && expanded && (
          <div>
            {symbol.children.map((child, i) => (
              <SymbolNode
                key={`${child.name}-${child.range.startLineNumber}-${i}`}
                symbol={child}
                depth={depth + 1}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </>
    );
  },
);

SymbolNode.displayName = "SymbolNode";

// ─── FileOutlinePanel ─────────────────────────────────────────────────────────

export function FileOutlinePanel() {
  const { symbols, loading } = useDocumentSymbols();
  const activeTabId = useEditorStore((s) => s.activeTabId);

  const handleNavigate = useCallback((line: number, column: number) => {
    const editor = getMonacoEditor();
    if (!editor) return;

    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column });
    editor.focus();
  }, []);

  // No file open
  if (!activeTabId) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center">
        <FileCode size={28} className="text-zinc-600 mb-2" />
        <p className="text-xs text-zinc-500">
          Open a file to see its outline
        </p>
      </div>
    );
  }

  // Loading
  if (loading && symbols.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={18} className="text-zinc-500 animate-spin" />
      </div>
    );
  }

  // No symbols found
  if (symbols.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center">
        <Code2 size={28} className="text-zinc-600 mb-2" />
        <p className="text-xs text-zinc-500">No symbols found</p>
        <p className="text-[10px] text-zinc-600 mt-1">
          Symbols appear for supported languages
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-white/[0.06] shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-medium">
          Outline
        </span>
        {loading && (
          <Loader2 size={10} className="text-zinc-500 animate-spin" />
        )}
        <span className="ml-auto text-[10px] text-zinc-600">
          {countSymbols(symbols)} symbols
        </span>
      </div>

      {/* Symbol tree */}
      <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
        {symbols.map((sym, i) => (
          <SymbolNode
            key={`${sym.name}-${sym.range.startLineNumber}-${i}`}
            symbol={sym}
            depth={0}
            onNavigate={handleNavigate}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function countSymbols(symbols: OutlineSymbol[]): number {
  let count = 0;
  for (const s of symbols) {
    count += 1;
    if (s.children.length > 0) {
      count += countSymbols(s.children);
    }
  }
  return count;
}
