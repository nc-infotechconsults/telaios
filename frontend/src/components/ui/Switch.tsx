interface Props {
  isSelected?: boolean;
  onValueChange?: (checked: boolean) => void;
  size?: "sm" | "md" | "lg";
  color?: string;
  className?: string;
  label?: string;
  children?: React.ReactNode;
  "aria-label"?: string;
}

export function Switch({ isSelected, onValueChange, size = "md", color, className = "", label, children, "aria-label": ariaLabel }: Props) {
  const trackW = size === "sm" ? "w-9" : size === "lg" ? "w-14" : "w-[51px]";
  const trackH = size === "sm" ? "h-5" : size === "lg" ? "h-8" : "h-[31px]";
  const thumbSize = size === "sm" ? "w-4 h-4" : size === "lg" ? "w-7 h-7" : "w-[27px] h-[27px]";
  const thumbX = isSelected ? (size === "sm" ? "translate-x-4" : size === "lg" ? "translate-x-6" : "translate-x-[20px]") : "translate-x-0";
  const trackBg = isSelected ? (color === "primary" ? "bg-primary" : color === "secondary" ? "bg-secondary" : "bg-success") : "bg-default-200";

  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer ${className}`} aria-label={ariaLabel}>
      <div className="relative">
        <div className={`${trackW} ${trackH} rounded-full transition-colors duration-200 ${trackBg}`} />
        <div className={`absolute top-[2px] left-[2px] ${thumbSize} rounded-full bg-white shadow-md transition-transform duration-200 ${thumbX}`} />
      </div>
      {label && <span className="text-sm text-foreground">{label}</span>}
      {children}
      <input
        type="checkbox"
        role="switch"
        checked={isSelected}
        onChange={(e) => onValueChange?.(e.target.checked)}
        className="sr-only"
      />
    </label>
  );
}
