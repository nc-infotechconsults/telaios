import type { ReactNode } from "react";

type ChipColor = "default" | "primary" | "secondary" | "success" | "warning" | "danger";
type ChipVariant = "solid" | "flat" | "bordered" | "dot";

interface Props {
  color?: ChipColor;
  size?: "sm" | "md" | "lg";
  variant?: ChipVariant;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
  startContent?: ReactNode;
  onClose?: () => void;
  onClick?: () => void;
  title?: string;
}

const colorSolid: Record<ChipColor, string> = {
  default:   "bg-default text-default-foreground",
  primary:   "bg-primary text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  success:   "bg-success text-white",
  warning:   "bg-warning text-white",
  danger:    "bg-danger text-white",
};

const colorFlat: Record<ChipColor, string> = {
  default:   "bg-[var(--fill-tertiary)] text-[var(--label-secondary)]",
  primary:   "bg-primary/15 text-primary",
  secondary: "bg-secondary/15 text-secondary",
  success:   "bg-success/15 text-success",
  warning:   "bg-warning/15 text-warning",
  danger:    "bg-danger/15 text-danger",
};

const colorBordered: Record<ChipColor, string> = {
  default:   "bg-transparent text-default-600 border border-default-300",
  primary:   "bg-transparent text-primary border border-primary/30",
  secondary: "bg-transparent text-secondary border border-secondary/30",
  success:   "bg-transparent text-success border border-success/30",
  warning:   "bg-transparent text-warning border border-warning/30",
  danger:    "bg-transparent text-danger border border-danger/30",
};

const sizeMap: Record<string, string> = {
  sm: "text-[11px] h-5 px-2",
  md: "text-[12px] h-6 px-2.5",
  lg: "text-[13px] h-7 px-3",
};

export function Chip({ color = "default", size = "sm", variant = "flat", className = "", style, children, startContent, onClose, onClick, title }: Props) {
  const colorClass = variant === "solid" ? colorSolid[color] : variant === "bordered" ? colorBordered[color] : colorFlat[color];

  const Wrapper = onClick ? "button" : "span";

  return (
    <Wrapper
      className={`apple-badge inline-flex items-center gap-1 ${colorClass} ${sizeMap[size] ?? sizeMap.sm} ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={style}
      onClick={onClick}
      title={title}
    >
      {startContent}
      {children}
      {onClose && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="ml-0.5 -mr-1 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
          aria-label="Remove"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </Wrapper>
  );
}
