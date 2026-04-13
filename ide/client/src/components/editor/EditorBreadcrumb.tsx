// ─── EditorBreadcrumb ─────────────────────────────────────────────────────────
//
// Breadcrumb bar: directory > filename > Symbol > Nested Symbol
//
// Path segments come from the file path. Symbol segments come from cursor
// tracking via useBreadcrumbSymbols. Clicking a directory opens the Explorer,
// clicking a symbol scrolls to it, clicking a symbol segment opens a dropdown
// of sibling symbols at that level.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback, memo } from "react";
import {
  ChevronRight,
  Folder,
  FileCode,
  FunctionSquare,
  Diamond,
  Variable,
  Puzzle,
  Tag,
  Hash,
  List,
  Braces,
  Layers,
  SquareCode,
  LetterText,
  Box,
  Code2,
  Type,
} from "lucide-react";
import type { BreadcrumbSegment } from "@/hooks/useBreadcrumbSymbols";
import type { OutlineSymbol } from "@/hooks/useDocumentSymbols";
import { getMonacoEditor } from "@/stores/monacoInstanceStore";
import { useLayoutStore } from "@/stores/layoutStore";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  segments: BreadcrumbSegment[];
}

// ─── Symbol Icon (compact, same mapping as FileOutlinePanel) ──────────────────

function SymbolIcon({ kind, size = 12 }: { kind: number; size?: number }) {
  const cls = "shrink-0";
  switch (kind) {
    case 0: return <FileCode size={size} className={`${cls} text-zinc-400`} />;
    case 1: return <Layers size={size} className={`${cls} text-amber-400`} />;
    case 2: return <Braces size={size} className={`${cls} text-amber-400`} />;
    case 4: return <Diamond size={size} className={`${cls} text-amber-400`} />;
    case 5: return <FunctionSquare size={size} className={`${cls} text-violet-400`} />;
    case 6: case 7: return <Tag size={size} className={`${cls} text-cyan-400`} />;
    case 8: return <SquareCode size={size} className={`${cls} text-violet-400`} />;
    case 9: return <List size={size} className={`${cls} text-orange-400`} />;
    case 10: return <Puzzle size={size} className={`${cls} text-cyan-400`} />;
    case 11: return <FunctionSquare size={size} className={`${cls} text-violet-400`} />;
    case 12: return <Variable size={size} className={`${cls} text-blue-400`} />;
    case 13: return <Hash size={size} className={`${cls} text-blue-400`} />;
    case 14: return <LetterText size={size} className={`${cls} text-green-400`} />;
    case 22: return <Box size={size} className={`${cls} text-amber-400`} />;
    case 25: return <Type size={size} className={`${cls} text-cyan-400`} />;
    default: return <Code2 size={size} className={`${cls} text-zinc-400`} />;
  }
}

// ─── Sibling Dropdown ─────────────────────────────────────────────────────────

interface DropdownProps {
  siblings: OutlineSymbol[];
  activeSymbolName: string;
  onSelect: (sym: OutlineSymbol) => void;
  onClose: () => void;
}

function SiblingDropdown({ siblings, activeSymbolName, onSelect, onClose }: DropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 min-w-[180px] max-h-[240px] overflow-y-auto rounded-lg border border-white/[0.08] bg-zinc-900/95 backdrop-blur-xl shadow-2xl shadow-black/40 py-1"
    >
      {siblings.map((sym) => (
        <button
          key={`${sym.name}-${sym.range.startLineNumber}`}
          className={[
            "flex items-center gap-2 w-full px-3 py-1.5 text-xs text-left transition-colors",
            sym.name === activeSymbolName
              ? "bg-violet-500/20 text-white"
              : "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
          ].join(" ")}
          onClick={() => {
            onSelect(sym);
            onClose();
          }}
        >
          <SymbolIcon kind={sym.kind} size={14} />
          <span className="truncate">{sym.name}</span>
          <span className="ml-auto text-[10px] text-zinc-500">
            :{sym.range.startLineNumber}
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Single Segment ───────────────────────────────────────────────────────────

const BreadcrumbSegmentView = memo(function BreadcrumbSegmentView({
  segment,
  isLast,
  showChevron,
}: {
  segment: BreadcrumbSegment;
  isLast: boolean;
  showChevron: boolean;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  const navigateToSymbol = useCallback((sym: OutlineSymbol) => {
    const editor = getMonacoEditor();
    if (!editor) return;
    editor.revealLineInCenter(sym.range.startLineNumber);
    editor.setPosition({
      lineNumber: sym.range.startLineNumber,
      column: sym.range.startColumn,
    });
    editor.focus();
  }, []);

  const handleClick = useCallback(() => {
    if (segment.type === "dir" && segment.path) {
      // Open the Explorer and ideally expand to this directory
      useLayoutStore.getState().showToolWindow("explorer");
    } else if (segment.type === "symbol" && segment.symbol) {
      if (segment.siblings && segment.siblings.length > 1) {
        setDropdownOpen((prev) => !prev);
      } else {
        navigateToSymbol(segment.symbol);
      }
    }
    // file type = no-op
  }, [segment, navigateToSymbol]);

  const isClickable = segment.type === "dir" || (segment.type === "symbol" && segment.symbol);

  return (
    <span ref={containerRef} className="flex items-center gap-1.5 group relative">
      {showChevron && (
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          className="text-zinc-600 group-hover:text-cyan-500/50 transition-colors shrink-0"
        />
      )}

      {segment.type === "dir" && (
        <Folder size={12} className="text-zinc-500 shrink-0" />
      )}
      {segment.type === "file" && (
        <FileCode size={12} className="text-zinc-400 shrink-0" />
      )}
      {segment.type === "symbol" && segment.symbol && (
        <SymbolIcon kind={segment.symbol.kind} />
      )}

      <button
        className={[
          "transition-colors text-xs",
          isLast && segment.type !== "symbol"
            ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] tracking-wide"
            : "",
          isLast && segment.type === "symbol"
            ? "text-violet-300 drop-shadow-[0_0_6px_rgba(139,92,246,0.3)]"
            : "",
          !isLast && segment.type === "symbol"
            ? "text-zinc-300 hover:text-violet-300"
            : "",
          !isLast && segment.type !== "symbol"
            ? "text-zinc-400 hover:text-zinc-300"
            : "",
          isClickable ? "cursor-pointer" : "cursor-default",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={handleClick}
        tabIndex={isClickable ? 0 : -1}
      >
        {segment.label}
      </button>

      {dropdownOpen && segment.siblings && segment.symbol && (
        <SiblingDropdown
          siblings={segment.siblings}
          activeSymbolName={segment.symbol.name}
          onSelect={navigateToSymbol}
          onClose={() => setDropdownOpen(false)}
        />
      )}
    </span>
  );
});

// ─── EditorBreadcrumb ─────────────────────────────────────────────────────────

export function EditorBreadcrumb({ segments }: Props) {
  if (segments.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-500 bg-white/[0.01] backdrop-blur-md border-b border-white/[0.05] overflow-x-auto whitespace-nowrap shrink-0 z-10 shadow-sm">
      {segments.map((seg, i) => (
        <BreadcrumbSegmentView
          key={`${seg.type}-${seg.label}-${i}`}
          segment={seg}
          isLast={i === segments.length - 1}
          showChevron={i > 0}
        />
      ))}
    </div>
  );
}
