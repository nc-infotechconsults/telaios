// ─── Theme Switcher ───────────────────────────────────────────────────────────
//
// A dialog for switching IDE themes. Accessed via the command palette
// (`view.switchTheme`) or status bar theme indicator.
//
// Lists all registered themes with type badges and applies selection immediately.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from "react";
import { create } from "zustand";
import { motion, AnimatePresence } from "framer-motion";
import { useThemeStore } from "@/stores/themeStore";
import { applyTheme } from "@/core/theme-manager";
import { Palette, Sun, Moon, Contrast } from "lucide-react";
import type { ThemeType } from "@/types/plugin";

// ─── Switcher State ──────────────────────────────────────────────────────────

interface ThemeSwitcherState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useThemeSwitcherStore = create<ThemeSwitcherState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));

export const openThemeSwitcher = () => useThemeSwitcherStore.getState().open();
export const closeThemeSwitcher = () => useThemeSwitcherStore.getState().close();

// ─── Theme Type Badge ────────────────────────────────────────────────────────

const TYPE_ICONS: Record<ThemeType, typeof Sun> = {
  light: Sun,
  dark: Moon,
  "high-contrast": Contrast,
};

const TYPE_COLORS: Record<ThemeType, string> = {
  light: "text-yellow-400 bg-yellow-500/10",
  dark: "text-violet-400 bg-violet-500/10",
  "high-contrast": "text-cyan-400 bg-cyan-500/10",
};

function ThemeTypeBadge({ type }: { type: ThemeType }) {
  const Icon = TYPE_ICONS[type];
  const color = TYPE_COLORS[type];

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${color}`}
    >
      <Icon size={10} />
      {type}
    </span>
  );
}

// ─── Theme Switcher Component ────────────────────────────────────────────────

export function ThemeSwitcher() {
  const isOpen = useThemeSwitcherStore((s) => s.isOpen);
  const close = useThemeSwitcherStore((s) => s.close);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && <ThemeSwitcherInner onClose={close} />}
    </AnimatePresence>
  );
}

function ThemeSwitcherInner({ onClose }: { onClose: () => void }) {
  const themes = useThemeStore((s) => s.themes);
  const activeThemeId = useThemeStore((s) => s.activeThemeId);
  const setActiveTheme = useThemeStore((s) => s.setActiveTheme);

  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.max(0, themes.findIndex((t) => t.id === activeThemeId)),
  );
  const listRef = useRef<HTMLDivElement>(null);

  // Close on escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, themes.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (themes[selectedIndex]) {
            selectTheme(themes[selectedIndex].id);
          }
          break;
      }
    },
    [themes, selectedIndex],
  );

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function selectTheme(id: string) {
    const theme = themes.find((t) => t.id === id);
    if (theme) {
      setActiveTheme(id);
      applyTheme(theme);
    }
    onClose();
  }

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

      {/* Dialog */}
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.98 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="fixed top-[15%] left-1/2 -translate-x-1/2 w-[min(420px,calc(100vw-32px))] z-[101]"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        ref={(el) => el?.focus()}
      >
        <div className="bg-[#18181b]/95 backdrop-blur-xl border border-white/[0.1] rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 h-10 border-b border-white/[0.06]">
            <Palette size={14} className="text-violet-400" />
            <span className="text-sm text-zinc-300">Select Theme</span>
          </div>

          {/* Theme list */}
          <div ref={listRef} className="max-h-[min(320px,50vh)] overflow-y-auto py-1">
            {themes.length === 0 && (
              <div className="px-4 py-6 text-center text-zinc-600 text-xs">
                No themes available
              </div>
            )}

            {themes.map((theme, index) => {
              const isSelected = index === selectedIndex;
              const isActive = theme.id === activeThemeId;

              return (
                <button
                  key={theme.id}
                  onClick={() => selectTheme(theme.id)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={[
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    isSelected
                      ? "bg-violet-500/10 text-zinc-100"
                      : "text-zinc-400 hover:bg-white/[0.03]",
                  ].join(" ")}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm truncate">{theme.label}</span>
                      {isActive && (
                        <span className="text-[10px] text-violet-400 font-medium">
                          Active
                        </span>
                      )}
                    </div>
                  </div>
                  <ThemeTypeBadge type={theme.type} />
                </button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </>
  );
}
