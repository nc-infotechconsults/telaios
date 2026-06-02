import { useEffect } from "react";
import { createPortal } from "react-dom";

interface AppModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  width?: number;
  children: React.ReactNode;
}

export function AppModal({ isOpen, onClose, title, subtitle, width = 440, children }: AppModalProps) {
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
        className="card"
        style={{
          width: "100%", maxWidth: width,
          padding: 24,
          boxShadow: "var(--shadow-sm)",
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 4px", color: "var(--fg)" }}>{title}</h2>
        {subtitle && (
          <p style={{ fontSize: 12.5, color: "var(--fg-3)", marginBottom: 20 }}>{subtitle}</p>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
