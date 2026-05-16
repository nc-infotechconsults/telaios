import type { ReactNode, InputHTMLAttributes } from "react";

interface SliderProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  value?: number;
  onChange?: (value: number) => void;
  minValue?: number;
  maxValue?: number;
  step?: number;
  defaultValue?: number;
  getValue?: (value: number) => string;
  marks?: { value: number; label: string }[];
  formatOptions?: Record<string, unknown>;
  classNames?: { label?: string };
  className?: string;
  isDisabled?: boolean;
  [key: string]: any;
}

export function Slider({
  label,
  size = "md",
  value,
  onChange,
  minValue = 0,
  maxValue = 100,
  step = 1,
  marks,
  classNames,
  className = "",
  ...rest
}: SliderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className={`text-[13px] font-semibold text-default-500 ${classNames?.label ?? ""}`}>{label}</label>}
      <input
        type="range"
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        min={minValue}
        max={maxValue}
        step={step}
        className={`w-full h-2 rounded-full appearance-none bg-default-200 accent-primary cursor-pointer ${className}`}
        {...rest}
      />
      {marks && (
        <div className="flex justify-between text-[11px] text-default-400 px-0.5">
          {marks.map((m) => (
            <span key={m.value} className="text-center">{m.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
