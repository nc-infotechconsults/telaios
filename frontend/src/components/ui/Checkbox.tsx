import type { InputHTMLAttributes } from "react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "value"> {
  size?: "sm" | "md" | "lg";
  value?: string;
  isSelected?: boolean;
  onValueChange?: (checked: boolean) => void;
}

export function Checkbox({ size = "md", value, isSelected, onValueChange, children, className = "", ...rest }: CheckboxProps) {
  return (
    <label className={`inline-flex items-center gap-2 cursor-pointer ${className}`}>
      <input
        type="checkbox"
        checked={isSelected}
        value={value}
        onChange={(e) => onValueChange?.(e.target.checked)}
        className="h-4 w-4 rounded border-default-300 text-primary focus:ring-2 focus:ring-primary/20"
        {...rest}
      />
      {children && <span className="text-sm text-foreground">{children}</span>}
    </label>
  );
}
