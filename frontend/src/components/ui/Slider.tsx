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
  const sliderId: string | undefined = rest.id ?? (typeof label === "string" ? `slider-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label htmlFor={sliderId} className={`text-[13px] font-semibold ${classNames?.label ?? ""}`} style={{ color: "var(--label-secondary)" }}>{label}</label>}
      <input
        type="range"
        id={sliderId}
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
        min={minValue}
        max={maxValue}
        step={step}
        className={`w-full h-2 rounded-full appearance-none cursor-pointer ${className}`}
        style={{ background: "var(--fill-secondary)", accentColor: "var(--color-blue)" }}
        {...rest}
      />
      {marks && (
        <div className="flex justify-between text-[11px] px-0.5" style={{ color: "var(--label-tertiary)" }}>
          {marks.map((m) => (
            <span key={m.value} className="text-center">{m.label}</span>
          ))}
        </div>
      )}
    </div>
  );
}
