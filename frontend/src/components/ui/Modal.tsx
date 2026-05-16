import { createContext, useContext, useEffect, type ReactNode } from "react";

const ModalCloseContext = createContext<() => void>(() => {});

interface ModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onClose?: () => void;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "full";
  children: ReactNode;
  scrollBehavior?: string;
  isDismissable?: boolean;
  hideCloseButton?: boolean;
  classNames?: { base?: string; body?: string };
  [key: string]: any;
}

const sizeWidth: Record<string, string> = {
  sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg", xl: "max-w-xl",
  "2xl": "max-w-2xl", "3xl": "max-w-3xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl", full: "max-w-full",
};

export function Modal({ isOpen, onOpenChange, onClose, size = "md", children, scrollBehavior, isDismissable, hideCloseButton, classNames, ...rest }: ModalProps) {
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onOpenChange]);

  if (!isOpen) return null;

  const close = () => onOpenChange(false);

  return (
    <ModalCloseContext.Provider value={close}>
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <div className="absolute inset-0 bg-black/40 animate-[fadeIn_200ms_ease]" onClick={close} aria-hidden="true" />
        <div className={`relative apple-glass-card w-full ${sizeWidth[size] ?? "max-w-md"} p-0 overflow-hidden animate-[fadeIn_200ms_ease]`}>
          {children}
        </div>
      </div>
    </ModalCloseContext.Provider>
  );
}

function useModalClose() {
  return useContext(ModalCloseContext);
}

export function ModalContent({ children }: { children: ReactNode | ((onClose: () => void) => ReactNode) }) {
  const onClose = useModalClose();
  return <>{typeof children === "function" ? (children as (onClose: () => void) => ReactNode)(onClose) : children}</>;
}

export function ModalHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 pt-5 pb-2 text-lg font-semibold text-foreground ${className}`}>{children}</div>;
}

export function ModalBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-3 text-sm text-default-600 ${className}`}>{children}</div>;
}

export function ModalFooter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 pb-5 pt-2 flex justify-end gap-2 ${className}`}>{children}</div>;
}
