import { Children, isValidElement, cloneElement } from "react";
import type { ReactNode, ReactElement, SelectHTMLAttributes } from "react";

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

  // React strips the `key` prop before passing it to components, so SelectItem
  // never receives it. We inject the element's React key as the `value` prop
  // here so callers can use the HeroUI pattern <SelectItem key="id"> without
  // also specifying value=.
  const processedChildren = Children.map(children, (child) => {
    if (isValidElement(child) && child.key != null) {
      const existingValue = (child.props as any).value;
      if (existingValue == null) {
        return cloneElement(child as ReactElement<any>, { value: child.key });
      }
    }
    return child;
  });

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-[13px] font-semibold" style={{ color: "var(--label-secondary)" }}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        disabled={isDisabled || isLoading}
        value={value}
        onChange={(e) => onSelectionChange?.([e.target.value])}
        className={`apple-input w-full px-3 ${sizeClass} cursor-pointer appearance-none ${isLoading ? "opacity-50" : ""} ${className}`}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {processedChildren}
      </select>
      {description && (
        <p className="text-[13px]" style={{ color: "var(--label-tertiary)" }}>{description}</p>
      )}
    </div>
  );
}

export function SelectItem({ value, children, textValue }: { value?: string; children: ReactNode; textValue?: string; [key: string]: any }) {
  return <option value={value}>{textValue ?? children}</option>;
}
