import { useState, useEffect, useRef } from "react";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  projectName: string;
}

interface Command {
  id: string;
  label: string;
  view?: string;
  icon: string;
  category: string;
}

const COMMANDS: Command[] = [
  { id: "dashboard",     label: "Go to Dashboard",      view: "dashboard",     icon: "fa-table-cells-large", category: "Navigation" },
  { id: "conversation",  label: "Open Conversation",    view: "conversation",  icon: "fa-comments",          category: "Navigation" },
  { id: "repositories",  label: "Repositories",         view: "repositories",  icon: "fa-code-branch",       category: "Navigation" },
  { id: "documents",     label: "Documents",            view: "documents",     icon: "fa-file-lines",        category: "Navigation" },
  { id: "designs",       label: "Designs",              view: "designs",       icon: "fa-pen-ruler",         category: "Navigation" },
  { id: "agents",        label: "Agents",               view: "agents",        icon: "fa-robot",             category: "Navigation" },
  { id: "inbox",         label: "Inbox",                view: "inbox",         icon: "fa-inbox",             category: "Navigation" },
  { id: "team",          label: "Team",                 view: "team",          icon: "fa-users",             category: "Navigation" },
  { id: "settings",      label: "Settings",             view: "settings",      icon: "fa-gear",              category: "Navigation" },
];

export default function CommandPalette({ isOpen, onClose, onNavigate, projectName }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") setSelected((s) => Math.min(s + 1, filtered.length - 1));
      if (e.key === "ArrowUp") setSelected((s) => Math.max(s - 1, 0));
      if (e.key === "Enter" && filtered[selected]) {
        const cmd = filtered[selected];
        if (cmd.view) onNavigate(cmd.view);
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const filtered = COMMANDS.filter(
    (c) => !query || c.label.toLowerCase().includes(query.toLowerCase()),
  );

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 92vw)",
          overflow: "hidden",
          boxShadow: "var(--shadow-glass-lg)",
        }}
      >
        {/* Search input */}
        <div
          style={{
            padding: "14px 16px",
            borderBottom: "0.5px solid var(--hairline)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--label-tertiary)" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            placeholder={`Search or ask TEOS about ${projectName}…`}
            aria-label="Command search"
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: 15,
              color: "var(--label-primary)",
              fontFamily: "inherit",
            }}
          />
          <kbd
            style={{
              fontSize: 11,
              padding: "2px 6px",
              borderRadius: 4,
              background: "var(--fill-tertiary)",
              color: "var(--label-secondary)",
              border: "0.5px solid var(--separator)",
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: "50vh", overflowY: "auto", padding: "6px 0" }} role="listbox" aria-label="Commands">
          {filtered.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: "var(--label-tertiary)", fontSize: 14 }}>
              No commands found
            </div>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                role="option"
                aria-selected={i === selected}
                onClick={() => {
                  if (cmd.view) onNavigate(cmd.view);
                  onClose();
                }}
                onMouseEnter={() => setSelected(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "9px 16px",
                  background: i === selected ? "var(--hover-glass)" : "none",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  color: "var(--label-primary)",
                  fontSize: 14,
                  borderLeft: i === selected ? "2px solid #0a84ff" : "2px solid transparent",
                }}
              >
                <i className={`fa-solid ${cmd.icon}`} aria-hidden="true" style={{ fontSize: 14, width: 20, textAlign: "center", color: i === selected ? "#0a84ff" : "var(--label-tertiary)" }} />
                <span style={{ flex: 1 }}>{cmd.label}</span>
                <span style={{ fontSize: 11, color: "var(--label-quaternary)" }}>{cmd.category}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "0.5px solid var(--hairline)",
            display: "flex",
            gap: 16,
            fontSize: 11,
            color: "var(--label-quaternary)",
          }}
        >
          <span><kbd style={{ fontFamily: "inherit" }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontFamily: "inherit" }}>↵</kbd> select</span>
          <span><kbd style={{ fontFamily: "inherit" }}>ESC</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
