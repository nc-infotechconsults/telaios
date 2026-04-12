import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FileCode, 
  FolderPlus, 
  Trash2, 
  Copy, 
  Clipboard,
  Edit3,
  Files,
  Save,
  Undo,
  Redo,
  Scissors,
  Search,
  Replace,
  Menu,
  Eye,
  EyeOff,
  Terminal,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Keyboard,
  BookOpen,
  Info,
  X
} from "lucide-react";

interface MenuItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  onClick?: () => void;
}

interface MenuDefinition {
  id: string;
  label: string;
  items: MenuItem[];
}

interface Props {
  workspaceId: string;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onSave?: () => void;
  onSaveAll?: () => void;
  onCloseTab?: () => void;
  onToggleSidebar?: () => void;
  onToggleTerminal?: () => void;
}

// File menu items
function getFileItems(props: Props): MenuItem[] {
  return [
    { 
      id: "new-file", 
      label: "New File", 
      icon: FileCode, 
      shortcut: "Ctrl+N",
      onClick: () => props.onNewFile?.() 
    },
    { 
      id: "new-folder", 
      label: "New Folder", 
      icon: FolderPlus,
      onClick: () => props.onNewFolder?.() 
    },
    { id: "divider-1", label: "", divider: true, onClick: () => {} },
    { 
      id: "save", 
      label: "Save", 
      icon: Save, 
      shortcut: "Ctrl+S",
      onClick: () => props.onSave?.() 
    },
    { 
      id: "save-all", 
      label: "Save All", 
      icon: Save,
      shortcut: "Ctrl+Shift+S",
      onClick: () => props.onSaveAll?.() 
    },
    { id: "divider-2", label: "", divider: true, onClick: () => {} },
    { 
      id: "close-tab", 
      label: "Close Tab", 
      icon: X,
      shortcut: "Ctrl+W",
      onClick: () => props.onCloseTab?.() 
    },
  ];
}

// Edit menu items
const editItems: MenuItem[] = [
  { id: "undo", label: "Undo", icon: Undo, shortcut: "Ctrl+Z", onClick: () => {} },
  { id: "redo", label: "Redo", icon: Redo, shortcut: "Ctrl+Y", onClick: () => {} },
  { id: "divider-1", label: "", divider: true, onClick: () => {} },
  { id: "cut", label: "Cut", icon: Scissors, shortcut: "Ctrl+X", onClick: () => {} },
  { id: "copy", label: "Copy", icon: Copy, shortcut: "Ctrl+C", onClick: () => {} },
  { id: "paste", label: "Paste", icon: Clipboard, shortcut: "Ctrl+V", onClick: () => {} },
  { id: "divider-2", label: "", divider: true, onClick: () => {} },
  { id: "find", label: "Find", icon: Search, shortcut: "Ctrl+F", onClick: () => {} },
  { id: "replace", label: "Replace", icon: Replace, shortcut: "Ctrl+H", onClick: () => {} },
];

// View menu items
function getViewItems(props: Props): MenuItem[] {
  return [
    { 
      id: "toggle-sidebar", 
      label: "Toggle Sidebar", 
      icon: Files,
      shortcut: "Ctrl+B",
      onClick: () => props.onToggleSidebar?.() 
    },
    { 
      id: "toggle-terminal", 
      label: "Toggle Terminal", 
      icon: Terminal,
      shortcut: "Ctrl+`",
      onClick: () => props.onToggleTerminal?.() 
    },
    { id: "divider-1", label: "", divider: true, onClick: () => {} },
    { id: "zoom-in", label: "Zoom In", icon: ZoomIn, shortcut: "Ctrl+=", onClick: () => {} },
    { id: "zoom-out", label: "Zoom Out", icon: ZoomOut, shortcut: "Ctrl+-", onClick: () => {} },
    { id: "reset-zoom", label: "Reset Zoom", icon: Maximize2, shortcut: "Ctrl+0", onClick: () => {} },
  ];
}

// Help menu items
const helpItems: MenuItem[] = [
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard, shortcut: "Ctrl+K Ctrl+S", onClick: () => {} },
  { id: "docs", label: "Documentation", icon: BookOpen, onClick: () => {} },
  { id: "divider-1", label: "", divider: true, onClick: () => {} },
  { id: "about", label: "About", icon: Info, onClick: () => {} },
];

export function TopMenu(props: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const MENUS: MenuDefinition[] = [
    { id: "file", label: "File", items: getFileItems(props) },
    { id: "edit", label: "Edit", items: editItems },
    { id: "view", label: "View", items: getViewItems(props) },
    { id: "help", label: "Help", items: helpItems },
  ];

  // Check for mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === "n" && props.onNewFile) {
          e.preventDefault();
          props.onNewFile();
        } else if (key === "s" && e.shiftKey && props.onSaveAll) {
          e.preventDefault();
          props.onSaveAll();
        } else if (key === "s" && props.onSave) {
          e.preventDefault();
          props.onSave();
        } else if (key === "b" && props.onToggleSidebar) {
          e.preventDefault();
          props.onToggleSidebar();
        } else if (key === "`" && props.onToggleTerminal) {
          e.preventDefault();
          props.onToggleTerminal();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [props]);

  return (
    <div 
      ref={menuRef}
      className="flex items-center h-9 bg-[#111113]/80 backdrop-blur-md border-b border-white/[0.05] px-2 gap-0.5 shrink-0"
    >
      {/* Logo / App name */}
      <div className="flex items-center gap-1.5 px-2 mr-2">
        <div className="w-4 h-4 rounded bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
          <span className="text-[8px] font-bold text-white">AI</span>
        </div>
        {!isMobile && (
          <span className="text-xs font-medium text-zinc-300">IDE</span>
        )}
      </div>

      {/* Menu items */}
      {isMobile ? (
        <button
          onClick={() => setOpenMenu(openMenu === "mobile" ? null : "mobile")}
          className="ml-auto p-2 text-zinc-400 hover:text-zinc-200"
        >
          <Menu size={18} />
        </button>
      ) : (
        <div className="flex items-center">
          {MENUS.map((menu) => (
            <div key={menu.id} className="relative">
              <button
                onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
                onMouseEnter={() => openMenu && setOpenMenu(menu.id)}
                className={[
                  "px-2.5 py-1 text-xs rounded transition-colors",
                  openMenu === menu.id
                    ? "bg-white/[0.08] text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                ].join(" ")}
              >
                {menu.label}
              </button>
              
              <AnimatePresence>
                {openMenu === menu.id && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.1 }}
                    className="absolute top-full left-0 mt-1 min-w-[200px] py-1 bg-[#1a1a1d]/95 backdrop-blur-xl border border-white/[0.08] rounded-lg shadow-2xl z-50"
                  >
                    {menu.items.map((item) => {
                      if (item.divider) {
                        return (
                          <div 
                            key={item.id} 
                            className="my-1 h-px bg-white/[0.08]" 
                          />
                        );
                      }
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            item.onClick?.();
                            setOpenMenu(null);
                          }}
                          disabled={item.disabled}
                          className={[
                            "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors",
                            item.disabled 
                              ? "text-zinc-600 cursor-not-allowed" 
                              : item.danger
                                ? "text-red-400 hover:bg-red-500/20"
                                : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
                          ].join(" ")}
                        >
                          {item.icon && (
                            <item.icon size={14} className="text-zinc-400" />
                          )}
                          <span className="flex-1">{item.label}</span>
                          {item.shortcut && (
                            <span className="text-zinc-500 text-[10px]">{item.shortcut}</span>
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      {/* Mobile dropdown */}
      <AnimatePresence>
        {isMobile && openMenu === "mobile" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-full left-0 right-0 mt-1 py-2 bg-[#1a1a1d]/95 backdrop-blur-xl border border-white/[0.08] rounded-lg shadow-2xl z-50"
          >
            {MENUS.flatMap(menu => [
              ...menu.items.map((item) => {
                if (item.divider) {
                  return (
                    <div 
                      key={item.id} 
                      className="my-1 h-px bg-white/[0.08]" 
                    />
                  );
                }
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      item.onClick?.();
                      setOpenMenu(null);
                    }}
                    className={[
                      "w-full flex items-center gap-2 px-4 py-2 text-xs text-left text-zinc-300 hover:bg-white/[0.04]"
                    ].join(" ")}
                  >
                    {item.icon && <item.icon size={14} className="text-zinc-400" />}
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && (
                      <span className="text-zinc-500 text-[10px]">{item.shortcut}</span>
                    )}
                  </button>
                );
              }),
              <div key={`divider-${menu.id}`} className="my-2 h-px bg-white/[0.08]" />
            ])}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}