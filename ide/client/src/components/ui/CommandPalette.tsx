// ─── CommandPalette ─────────────────────────────────────────────────────────────
//
// JetBrains "Search Everywhere" / VS Code "Command Palette" style overlay.
// Provides fuzzy search through all registered commands.
//
// Features:
//   - Fuzzy search with match highlighting
//   - Keyboard navigation (Up/Down, Enter, Escape)
//   - Grouped by category
//   - Shows keybinding shortcuts
//   - Works on both desktop and mobile
//   - Opens via Ctrl+Shift+P (registered as `commandPalette.open`)
//
// State management:
//   Uses a module-level Zustand store (commandPaletteStore) for open/close.
//   The command handler calls `openCommandPalette()` to toggle it.
// ──────────────────────────────────────────────────────────────────────────────

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { create } from "zustand";
import { motion, AnimatePresence } from "framer-motion";
import { commandRegistry, type RegisteredCommand } from "@/core/commands";
import { keybindingService } from "@/core/keybindings";
import { contextKeyService } from "@/core/context-keys";
import { Search, CornerDownLeft } from "lucide-react";

// ─── Palette Store ────────────────────────────────────────────────────────────
// Minimal store for open/close state — decoupled from UI.

interface PaletteStore {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<PaletteStore>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));

/** Convenience: call from command handlers */
export const openCommandPalette = () =>
  useCommandPaletteStore.getState().open();
export const closeCommandPalette = () =>
  useCommandPaletteStore.getState().close();
export const toggleCommandPalette = () =>
  useCommandPaletteStore.getState().toggle();

// ─── Fuzzy Scoring ────────────────────────────────────────────────────────────
// Returns a score (higher = better match) and match indices for highlighting.
// Returns null if no match.

interface FuzzyMatch {
  score: number;
  indices: number[];
}

function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  if (q.length === 0) return { score: 0, indices: [] };

  let qi = 0;
  let score = 0;
  const indices: number[] = [];
  let prevMatchIdx = -2;

  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      indices.push(i);

      // Bonus for consecutive matches
      if (i === prevMatchIdx + 1) {
        score += 10;
      }

      // Bonus for matching at word boundaries
      if (i === 0 || t[i - 1] === " " || t[i - 1] === "." || t[i - 1] === ":") {
        score += 5;
      }

      // Bonus for early matches
      score += Math.max(0, 10 - i);

      prevMatchIdx = i;
      qi++;
    }
  }

  // All query chars must be matched
  if (qi < q.length) return null;

  return { score, indices };
}

// ─── Match Highlighting ───────────────────────────────────────────────────────

function HighlightedText({
  text,
  indices,
}: {
  text: string;
  indices: number[];
}) {
  if (indices.length === 0) {
    return <span>{text}</span>;
  }

  const parts: { text: string; highlight: boolean }[] = [];
  let lastIdx = 0;

  for (const idx of indices) {
    if (idx > lastIdx) {
      parts.push({ text: text.slice(lastIdx, idx), highlight: false });
    }
    parts.push({ text: text[idx], highlight: true });
    lastIdx = idx + 1;
  }

  if (lastIdx < text.length) {
    parts.push({ text: text.slice(lastIdx), highlight: false });
  }

  return (
    <span>
      {parts.map((part, i) =>
        part.highlight ? (
          <span key={i} className="text-violet-400 font-semibold">
            {part.text}
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </span>
  );
}

// ─── Filtered Command with Score ──────────────────────────────────────────────

interface ScoredCommand {
  command: RegisteredCommand;
  labelMatch: FuzzyMatch;
  categoryMatch: FuzzyMatch | null;
}

function useFilteredCommands(query: string): ScoredCommand[] {
  return useMemo(() => {
    const all = commandRegistry.getAll();

    // Filter out the commandPalette.open command itself to avoid recursion confusion
    // Also filter out commands whose `when` clause is not satisfied
    const commands = all.filter(
      (c) =>
        c.id !== "commandPalette.open" &&
        contextKeyService.evaluate(c.when),
    );

    if (!query.trim()) {
      return commands.map((c) => ({
        command: c,
        labelMatch: { score: 0, indices: [] },
        categoryMatch: null,
      }));
    }

    const scored: ScoredCommand[] = [];

    for (const command of commands) {
      const labelMatch = fuzzyMatch(query, command.label);
      const categoryMatch = command.category
        ? fuzzyMatch(query, command.category)
        : null;

      // Match against "Category: Label" combined
      const combinedMatch = command.category
        ? fuzzyMatch(query, `${command.category}: ${command.label}`)
        : null;

      if (labelMatch || categoryMatch || combinedMatch) {
        scored.push({
          command,
          labelMatch: labelMatch ?? { score: -1, indices: [] },
          categoryMatch,
        });
      }
    }

    // Sort by score (higher first)
    scored.sort((a, b) => b.labelMatch.score - a.labelMatch.score);

    return scored;
  }, [query]);
}

// ─── CommandPalette ───────────────────────────────────────────────────────────

export function CommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const close = useCommandPaletteStore((s) => s.close);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && <CommandPaletteInner onClose={close} />}
    </AnimatePresence>
  );
}

function CommandPaletteInner({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useFilteredCommands(query);

  // Focus input on mount
  useEffect(() => {
    // Small delay to let animation start
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const executeSelected = useCallback(() => {
    const selected = results[selectedIndex];
    if (selected) {
      onClose();
      // Execute after closing to avoid UI conflicts
      requestAnimationFrame(() => {
        commandRegistry.execute(selected.command.id);
      });
    }
  }, [results, selectedIndex, onClose]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          executeSelected();
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [results.length, executeSelected, onClose]
  );

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]"
        onClick={onClose}
      />

      {/* Palette */}
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.98 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[min(540px,calc(100vw-32px))] z-[101]"
      >
        <div className="bg-[#18181b]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 h-12 border-b border-white/[0.06]">
            <Search size={16} className="text-zinc-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command..."
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 outline-none"
              spellCheck={false}
              autoComplete="off"
              autoCorrect="off"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-zinc-600 hover:text-zinc-400 transition-colors text-xs"
              >
                Clear
              </button>
            )}
          </div>

          {/* Results list */}
          <div
            ref={listRef}
            className="max-h-[min(360px,50vh)] overflow-y-auto py-1"
          >
            {results.length === 0 && query.trim() && (
              <div className="px-4 py-8 text-center text-zinc-600 text-sm">
                No commands match "{query}"
              </div>
            )}

            {results.map((item, index) => {
              const isSelected = index === selectedIndex;
              const shortcut = keybindingService.getLabel(item.command.id);
              const Icon = item.command.icon;

              return (
                <button
                  key={item.command.id}
                  onClick={() => {
                    setSelectedIndex(index);
                    onClose();
                    requestAnimationFrame(() => {
                      commandRegistry.execute(item.command.id);
                    });
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={[
                    "w-full flex items-center gap-3 px-4 py-2 text-left transition-colors",
                    isSelected
                      ? "bg-violet-500/10 text-zinc-100"
                      : "text-zinc-400 hover:bg-white/[0.03]",
                  ].join(" ")}
                >
                  {/* Icon */}
                  <div className="w-5 flex items-center justify-center shrink-0">
                    {Icon ? (
                      <Icon
                        size={14}
                        className={isSelected ? "text-violet-400" : "text-zinc-600"}
                      />
                    ) : (
                      <div className="w-1 h-1 rounded-full bg-zinc-700" />
                    )}
                  </div>

                  {/* Label + category */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">
                      {item.command.category && (
                        <span className="text-zinc-600 mr-1.5">
                          {item.command.category}:
                        </span>
                      )}
                      <HighlightedText
                        text={item.command.label}
                        indices={item.labelMatch.indices}
                      />
                    </div>
                  </div>

                  {/* Shortcut */}
                  {shortcut && (
                    <kbd className="text-[10px] text-zinc-600 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06] shrink-0 font-mono">
                      {shortcut}
                    </kbd>
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.06] text-[10px] text-zinc-600">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-white/[0.04] rounded border border-white/[0.06] font-mono">
                  <CornerDownLeft size={8} />
                </kbd>
                Run
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-white/[0.04] rounded border border-white/[0.06] font-mono text-[8px]">
                  ↑↓
                </kbd>
                Navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1 py-0.5 bg-white/[0.04] rounded border border-white/[0.06] font-mono text-[8px]">
                  Esc
                </kbd>
                Close
              </span>
            </div>
            <span>{results.length} commands</span>
          </div>
        </div>
      </motion.div>
    </>
  );
}
