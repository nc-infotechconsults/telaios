import type { ReactNode } from "react";

type ButtonVariant = "solid" | "light" | "flat" | "ghost" | "bordered";
type ButtonColor = "default" | "primary" | "secondary" | "success" | "warning" | "danger";

interface Props {
  variant?: ButtonVariant;
  color?: ButtonColor;
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  isDisabled?: boolean;
  isIconOnly?: boolean;
  onPress?: (e?: any) => void;
  onClose?: () => void;
  onClick?: (e?: any) => void;
  as?: "button" | "a";
  href?: string;
  target?: string;
  rel?: string;
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
  title?: string;
  style?: React.CSSProperties;
  startContent?: ReactNode;
  [key: string]: any;
}

const colorMap: Record<ButtonColor, { bg: string; text: string; hover: string }> = {
  default:  { bg: "bg-[var(--fill-tertiary)]", text: "text-[var(--label-primary)]", hover: "hover:bg-[var(--fill-secondary)]" },
  primary:  { bg: "bg-primary", text: "text-primary-foreground", hover: "hover:opacity-90" },
  secondary:{ bg: "bg-[var(--fill-tertiary)]", text: "text-[var(--label-primary)]", hover: "hover:bg-[var(--fill-secondary)]" },
  success:  { bg: "bg-success", text: "text-white", hover: "hover:opacity-90" },
  warning:  { bg: "bg-warning", text: "text-white", hover: "hover:opacity-90" },
  danger:   { bg: "bg-danger", text: "text-white", hover: "hover:opacity-90" },
};

const sizeMap: Record<string, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-[44px] px-4 text-[15px]",
  lg: "h-[50px] px-5 text-[17px]",
};

export function Button({
  variant = "solid",
  color = "default",
  size = "md",
  isLoading,
  isDisabled,
  isIconOnly,
  onPress,
  onClose,
  onClick,
  as = "button",
  href,
  target,
  rel,
  className = "",
  children,
  style,
  ...rest
}: Props) {
  const disabled = isDisabled || isLoading;
  const c = colorMap[color] ?? colorMap.default;
  const sz = isIconOnly ? (size === "sm" ? "h-9 w-9 px-0" : size === "lg" ? "h-[50px] w-[50px] px-0" : "h-[44px] w-[44px] px-0") : (sizeMap[size] ?? sizeMap.md);

  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-[14px] transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";

  const variantClass = (() => {
    if (variant === "flat" || variant === "light") return `bg-transparent ${c.text}`;
    if (variant === "bordered") return `bg-transparent ${c.text} border border-current/20`;
    if (variant === "ghost") return `bg-transparent ${c.text} hover:bg-default-100`;
    return `${c.bg} ${c.text} ${c.hover}`;
  })();

  const handleClick = onPress ?? onClick ?? onClose;

  if (as === "a") {
    return (
      <a
        href={href}
        target={target}
        rel={rel}
        className={`${base} ${variantClass} ${sz} ${className}`}
        style={style}
      >
        {isLoading && <SpinnerSm />}
        {children}
      </a>
    );
  }

  return (
    <button
      className={`apple-btn ${base} ${variantClass} ${sz} ${className}`}
      disabled={disabled}
      onClick={handleClick}
      style={style}
      {...rest}
    >
      {isLoading && <SpinnerSm />}
      {children}
    </button>
  );
}

function SpinnerSm() {
  return (
    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
