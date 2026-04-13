// ─── HeaderToolbar ─────────────────────────────────────────────────────────────
//
// JetBrains New UI-style header toolbar. Replaces TopMenu.tsx.
//
// Layout:
//  ┌──────────────────────────────────────────────────────────────────┐
//  │ [Logo] [File Edit View Help]  <-- Search Everywhere -->  [VCS] │
//  └──────────────────────────────────────────────────────────────────┘
//
// Key differences from TopMenu:
//   - Menu actions dispatch through CommandRegistry instead of inline handlers
//   - Center "Search Everywhere" widget opens Command Palette (Task 13)
//   - Right side shows VCS branch (future)
//   - Same glassmorphism visual style as existing TopMenu
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { commandRegistry } from "@/core/commands";
import { keybindingService } from "@/core/keybindings";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import {
  Menu,
  Search,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  /** Command ID to execute — if set, shortcut label is pulled from keybinding service */
  commandId?: string;
  /** Explicit shortcut label (fallback if no keybinding) */
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

interface MenuDefinition {
  id: string;
  label: string;
  items: MenuItem[];
}

// ─── Menu Definitions ─────────────────────────────────────────────────────────
// Menus reference command IDs. Actions are executed through the command registry.
// Commands will be registered in Task 8/9 (THE CUTOVER). Until then, menu items
// gracefully fall through (commandRegistry.execute warns on unknown commands).

const FILE_MENU: MenuItem[] = [
  { id: "new-file",   label: "New File",   commandId: "file.newFile",  shortcut: "Ctrl+N"       },
  { id: "new-folder", label: "New Folder", commandId: "file.newFolder"                           },
  { id: "div-1", label: "", divider: true },
  { id: "save",       label: "Save",       commandId: "file.save",     shortcut: "Ctrl+S"       },
  { id: "save-all",   label: "Save All",   commandId: "file.saveAll",  shortcut: "Ctrl+Shift+S" },
  { id: "div-2", label: "", divider: true },
  { id: "close-tab",  label: "Close Tab",  commandId: "file.closeTab", shortcut: "Ctrl+W"       },
];

const EDIT_MENU: MenuItem[] = [
  { id: "undo",    label: "Undo",    commandId: "edit.undo",    shortcut: "Ctrl+Z" },
  { id: "redo",    label: "Redo",    commandId: "edit.redo",    shortcut: "Ctrl+Y" },
  { id: "div-1", label: "", divider: true },
  { id: "cut",     label: "Cut",     commandId: "edit.cut",     shortcut: "Ctrl+X" },
  { id: "copy",    label: "Copy",    commandId: "edit.copy",    shortcut: "Ctrl+C" },
  { id: "paste",   label: "Paste",   commandId: "edit.paste",   shortcut: "Ctrl+V" },
  { id: "div-2", label: "", divider: true },
  { id: "find",    label: "Find",    commandId: "edit.find",    shortcut: "Ctrl+F" },
  { id: "replace", label: "Replace", commandId: "edit.replace", shortcut: "Ctrl+H" },
];

const VIEW_MENU: MenuItem[] = [
  { id: "toggle-sidebar",  label: "Toggle Sidebar",  commandId: "view.toggleSidebar",  shortcut: "Ctrl+B" },
  { id: "toggle-terminal", label: "Toggle Terminal",  commandId: "view.toggleTerminal", shortcut: "Ctrl+`" },
  { id: "div-1", label: "", divider: true },
  { id: "command-palette",  label: "Command Palette", commandId: "commandPalette.open", shortcut: "Ctrl+Shift+P" },
  { id: "div-2", label: "", divider: true },
  { id: "zoom-in",    label: "Zoom In",    commandId: "view.zoomIn",    shortcut: "Ctrl+=" },
  { id: "zoom-out",   label: "Zoom Out",   commandId: "view.zoomOut",   shortcut: "Ctrl+-" },
  { id: "reset-zoom", label: "Reset Zoom", commandId: "view.resetZoom", shortcut: "Ctrl+0" },
];

const HELP_MENU: MenuItem[] = [
  { id: "shortcuts", label: "Keyboard Shortcuts", commandId: "help.shortcuts", shortcut: "Ctrl+K Ctrl+S" },
  { id: "docs",      label: "Documentation",      commandId: "help.docs"                                },
  { id: "div-1", label: "", divider: true },
  { id: "about",     label: "About",              commandId: "help.about"                               },
];

const MENUS: MenuDefinition[] = [
  { id: "file", label: "File", items: FILE_MENU },
  { id: "edit", label: "Edit", items: EDIT_MENU },
  { id: "view", label: "View", items: VIEW_MENU },
  { id: "help", label: "Help", items: HELP_MENU },
];

// ─── DropdownMenu ─────────────────────────────────────────────────────────────

interface DropdownMenuProps {
  items: MenuItem[];
  onClose: () => void;
}

function DropdownMenu({ items, onClose }: DropdownMenuProps) {
  const handleClick = useCallback(
    (item: MenuItem) => {
      if (item.commandId) {
        commandRegistry.execute(item.commandId);
      }
      onClose();
    },
    [onClose]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.1 }}
      className="absolute top-full left-0 mt-1 min-w-[220px] py-1 bg-[#1a1a1d]/95 backdrop-blur-xl border border-white/[0.08] rounded-lg shadow-2xl z-50"
    >
      {items.map((item) => {
        if (item.divider) {
          return <div key={item.id} className="my-1 h-px bg-white/[0.08]" />;
        }

        // Get shortcut label from keybinding service if a command is registered
        const shortcutLabel =
          item.commandId
            ? keybindingService.getLabel(item.commandId) ?? item.shortcut
            : item.shortcut;

        return (
          <button
            key={item.id}
            onClick={() => handleClick(item)}
            disabled={item.disabled}
            className={[
              "w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors",
              item.disabled
                ? "text-zinc-600 cursor-not-allowed"
                : item.danger
                  ? "text-red-400 hover:bg-red-500/20"
                  : "text-zinc-300 hover:bg-white/[0.06] hover:text-white",
            ].join(" ")}
          >
            {item.icon && (
              <item.icon size={14} className="text-zinc-500 shrink-0" />
            )}
            <span className="flex-1">{item.label}</span>
            {shortcutLabel && (
              <span className="text-zinc-600 text-[10px] ml-4 shrink-0">
                {shortcutLabel}
              </span>
            )}
          </button>
        );
      })}
    </motion.div>
  );
}

// ─── SearchWidget ─────────────────────────────────────────────────────────────
// JetBrains "Search Everywhere" compact widget — opens the command palette.

function SearchWidget() {
  const shortcutLabel =
    keybindingService.getLabel("commandPalette.open") ?? "Ctrl+Shift+P";

  return (
    <button
      onClick={() => commandRegistry.execute("commandPalette.open")}
      className={[
        "flex items-center gap-2 px-3 py-1 h-6 rounded-md",
        "bg-white/[0.04] border border-white/[0.06]",
        "text-zinc-500 text-[11px]",
        "hover:bg-white/[0.06] hover:text-zinc-400 hover:border-white/[0.08]",
        "transition-all duration-200 min-w-[180px] max-w-[280px]",
      ].join(" ")}
    >
      <Search size={12} className="shrink-0" />
      <span className="flex-1 text-left truncate">Search Everywhere</span>
      <kbd className="text-[9px] text-zinc-600 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06] shrink-0">
        {shortcutLabel}
      </kbd>
    </button>
  );
}

// ─── HeaderToolbar ────────────────────────────────────────────────────────────

export function HeaderToolbar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { isTablet } = useBreakpoint();

  // On tablet viewports (640-1023px), show a compact hamburger layout.
  // On desktop/wide (≥1024px), show the full menu bar.
  // Note: On phone (<640px), IDEShell renders MobileShell instead,
  // so HeaderToolbar is never mounted at that breakpoint.
  const isCompact = isTablet;

  // Close menu on click outside
  useEffect(() => {
    if (!openMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openMenu]);

  // Close on Escape
  useEffect(() => {
    if (!openMenu) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [openMenu]);

  return (
    <div
      ref={menuRef}
      className="flex items-center h-9 bg-[#111113]/80 backdrop-blur-md border-b border-white/[0.05] px-2 shrink-0 z-50"
    >
      {/* ── Left: Logo + Menu Bar ── */}
      <div className="flex items-center gap-0.5 min-w-0">
        {/* Logo */}
        <div className="flex items-center gap-1.5 px-2 mr-1 shrink-0">
          <div className="w-4 h-4 rounded bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
            <span className="text-[8px] font-bold text-white">AI</span>
          </div>
          {!isCompact && (
            <span className="text-xs font-medium text-zinc-300">IDE</span>
          )}
        </div>

        {/* Desktop: Full menu bar */}
        {!isCompact && (
          <div className="flex items-center">
            {MENUS.map((menu) => (
              <div key={menu.id} className="relative">
                <button
                  onClick={() =>
                    setOpenMenu(openMenu === menu.id ? null : menu.id)
                  }
                  onMouseEnter={() => {
                    if (openMenu) setOpenMenu(menu.id);
                  }}
                  className={[
                    "px-2.5 py-1 text-xs rounded transition-colors",
                    openMenu === menu.id
                      ? "bg-white/[0.08] text-white"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]",
                  ].join(" ")}
                >
                  {menu.label}
                </button>

                <AnimatePresence>
                  {openMenu === menu.id && (
                    <DropdownMenu
                      items={menu.items}
                      onClose={() => setOpenMenu(null)}
                    />
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}

        {/* Tablet: Hamburger */}
        {isCompact && (
          <button
            onClick={() =>
              setOpenMenu(openMenu === "mobile" ? null : "mobile")
            }
            className="p-2 text-zinc-400 hover:text-zinc-200"
          >
            <Menu size={18} />
          </button>
        )}
      </div>

      {/* ── Center: Search Widget ── */}
      <div className="flex-1 flex justify-center px-4">
        {!isCompact && <SearchWidget />}
      </div>

      {/* ── Right: VCS / future widgets ── */}
      <div className="flex items-center gap-1.5 shrink-0">
      </div>

      {/* ── Tablet dropdown ── */}
      <AnimatePresence>
        {isCompact && openMenu === "mobile" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-full left-0 right-0 mt-1 py-2 bg-[#1a1a1d]/95 backdrop-blur-xl border border-white/[0.08] rounded-lg shadow-2xl z-50 max-h-[70vh] overflow-y-auto"
          >
            {/* Mobile search bar */}
            <div className="px-3 pb-2 mb-1 border-b border-white/[0.06]">
              <button
                onClick={() => {
                  commandRegistry.execute("commandPalette.open");
                  setOpenMenu(null);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-md bg-white/[0.04] border border-white/[0.06] text-zinc-500 text-xs"
              >
                <Search size={12} />
                <span>Search Everywhere</span>
              </button>
            </div>

            {MENUS.map((menu, menuIdx) => (
              <div key={menu.id}>
                {/* Menu section header */}
                <div className="px-4 py-1 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
                  {menu.label}
                </div>
                {menu.items.map((item) => {
                  if (item.divider) return null; // Skip dividers in mobile flat list
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.commandId) {
                          commandRegistry.execute(item.commandId);
                        }
                        setOpenMenu(null);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-xs text-left text-zinc-300 hover:bg-white/[0.04]"
                    >
                      {item.icon && (
                        <item.icon size={14} className="text-zinc-500" />
                      )}
                      <span className="flex-1">{item.label}</span>
                      {item.shortcut && (
                        <span className="text-zinc-600 text-[10px]">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
                {menuIdx < MENUS.length - 1 && (
                  <div className="my-1 h-px bg-white/[0.06]" />
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
