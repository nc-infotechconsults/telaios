import { useLayoutEffect, useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface MenuItem {
  id: string;
  label: string;
  icon?: React.ElementType;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
  onClick: () => void;
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  // null = not yet measured (hidden); set synchronously before first paint
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null);

  // Filter visible items for keyboard nav
  const visibleItems = items.filter(item => !item.divider);

  // Measure the menu's intrinsic size and clamp it inside the viewport.
  // useLayoutEffect fires before the browser paints — no visible jump.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;

    setPosition({
      x: Math.max(pad, x + width  > vw ? vw - width  - pad : x),
      y: Math.max(pad, y + height > vh ? vh - height - pad : y),
    });
  }, [x, y]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Close on escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, visibleItems.length - 1));
      setSubmenuIndex(null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      setSubmenuIndex(null);
    } else if (e.key === "Enter" && visibleItems[selectedIndex]) {
      e.preventDefault();
      const item = visibleItems[selectedIndex];
      if (!item.disabled) {
        item.onClick();
        onClose();
      }
    } else if (e.key === "ArrowRight" && submenuIndex !== null) {
      // Could open submenu here
    }
  }, [visibleItems, selectedIndex, submenuIndex, onClose]);

  return (
    <AnimatePresence>
      <motion.div
        ref={menuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.1 }}
        className="fixed z-50 min-w-[180px] py-1 bg-[#1a1a1d]/95 backdrop-blur-xl border border-white/[0.08] rounded-lg shadow-2xl overflow-hidden"
        style={{
          left: position?.x ?? x,
          top: position?.y ?? y,
          // Stay invisible until the clamped position is computed (before first paint)
          visibility: position ? "visible" : "hidden",
        }}
        onKeyDown={handleKeyDown}
      >
        {items.map((item, index) => {
          if (item.divider) {
            return (
              <div 
                key={item.id} 
                className="my-1 h-px bg-white/[0.08]" 
              />
            );
          }

          const itemIndex = visibleItems.findIndex(i => i.id === item.id);
          const isSelected = itemIndex === selectedIndex;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (!item.disabled) {
                  item.onClick();
                  onClose();
                }
              }}
              onMouseEnter={() => {
                setSelectedIndex(itemIndex);
                setSubmenuIndex(null);
              }}
              className={[
                "w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors",
                item.disabled 
                  ? "text-zinc-600 cursor-not-allowed" 
                  : item.danger
                    ? "text-red-400 hover:bg-red-500/20"
                    : isSelected
                      ? "bg-white/[0.08] text-white"
                      : "text-zinc-300 hover:bg-white/[0.04] hover:text-white"
              ].join(" ")}
            >
              {item.icon && (
                <item.icon size={14} className={item.danger ? "text-red-400" : "text-zinc-400"} />
              )}
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="text-zinc-500 text-[10px]">{item.shortcut}</span>
              )}
            </button>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}