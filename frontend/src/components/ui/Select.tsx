import type { ReactNode, ChangeEvent, SelectHTMLAttributes } from "react";

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size" | "children" | "value" | "onChange"> {
  label?: ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
  selectedKeys?: string | string[];
  onSelectionChange?: (keys: string | string[]) => void;
  isDisabled?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  description?: ReactNode;
  [key: string]: any;
}

export function Select({
  label,
  size = "md",
  className = "",
  id,
  children,
  selectedKeys,
  onSelectionChange,
  isDisabled,
  isLoading,
  placeholder,
  description,
  ...rest
}: SelectProps) {
  const selectId = id ?? (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const sizeClass = size === "sm" ? "h-9 text-[13px]" : size === "lg" ? "h-12 text-[17px]" : "h-[44px] text-[15px]";
  const value = Array.isArray(selectedKeys) ? selectedKeys[0] : selectedKeys;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-[13px] font-semibold text-default-500">
          {label}
        </label>
      )}
      <select
        id={selectId}
        disabled={isDisabled || isLoading}
        value={value}
        onChange={(e) => onSelectionChange?.(e.target.value)}
        className={`apple-input w-full px-3 ${sizeClass} cursor-pointer appearance-none ${isLoading ? "opacity-50" : ""} ${className}`}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      {description && (
        <p className="text-[13px] text-default-400">{description}</p>
      )}
    </div>
  );
}

export function SelectItem({ value, children, key, textValue, ...rest }: { value?: string; children: ReactNode; key?: string; textValue?: string; [key: string]: any }) {
  return <option value={value ?? key}>{children}</option>;
}
