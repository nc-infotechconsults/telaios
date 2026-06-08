import { useEffect } from "react";
import { createPortal } from "react-dom";

interface AppModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  /**
   * Optional footer rendered in a non-scrolling region pinned to the bottom of
   * the modal card. When omitted, the modal body extends to the bottom and any
   * action buttons placed inside `children` can use `position: sticky` (via the
   * `modal-actions` class) to remain visible while the body scrolls.
   */
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function AppModal({
  isOpen,
  onClose,
  title,
  subtitle,
  width = 440,
  footer,
  children,
}: AppModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        className="card app-modal-card"
        style={{
          width: "100%", maxWidth: width,
          padding: 0,
          boxShadow: "var(--shadow-sm)",
          maxHeight: "calc(100vh - 80px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "20px 24px 12px", flexShrink: 0 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "var(--fg)" }}>{title}</h2>
          {subtitle && (
            <p style={{ fontSize: 12.5, color: "var(--fg-3)", margin: 0 }}>{subtitle}</p>
          )}
        </div>
        <div className="app-modal-body" style={{ padding: "8px 24px 16px", overflowY: "auto", flex: 1, minHeight: 0 }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              padding: "12px 24px 16px",
              flexShrink: 0,
              borderTop: "0.5px solid var(--border)",
              background: "var(--surface)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
