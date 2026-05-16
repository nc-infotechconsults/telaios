import type { ReactNode, ChangeEvent, InputHTMLAttributes } from "react";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "onChange"> {
  label?: ReactNode;
  size?: "sm" | "md" | "lg";
  isInvalid?: boolean;
  isRequired?: boolean;
  isDisabled?: boolean;
  description?: ReactNode;
  errorMessage?: string;
  onValueChange?: (value: string) => void;
  [key: string]: any;
}

export function Input({ label, size = "md", isInvalid, isRequired, isDisabled, description, errorMessage, onValueChange, className = "", id, onChange, startContent, isClearable, onClear, ...rest }: InputProps & { startContent?: any; isClearable?: any; onClear?: any }) {
  const inputId = id ?? (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const sizeClass = size === "sm" ? "h-9 text-[13px]" : size === "lg" ? "h-12 text-[17px]" : "h-[44px] text-[15px]";

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onValueChange?.(e.target.value);
    onChange?.(e);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-semibold text-default-500">
          {label}
          {isRequired && <span className="text-danger ml-0.5" aria-hidden="true"> *</span>}
        </label>
      )}
      <input
        id={inputId}
        required={isRequired}
        disabled={isDisabled}
        className={`apple-input w-full px-3 ${sizeClass} ${isInvalid ? "!border-danger" : ""} ${className}`}
        onChange={handleChange}
        {...rest}
      />
      {errorMessage && (
        <p className="text-[13px] text-danger">{errorMessage}</p>
      )}
      {description && (
        <p className="text-[13px] text-default-400">{description}</p>
      )}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  size?: "sm" | "md" | "lg";
  isInvalid?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  description?: ReactNode;
  errorMessage?: string;
  minRows?: number;
  maxRows?: number;
  onValueChange?: (value: string) => void;
  classNames?: { input?: string };
  [key: string]: any;
}

export function Textarea({
  label,
  size = "md",
  isInvalid,
  isDisabled,
  isRequired,
  description,
  errorMessage,
  minRows = 3,
  maxRows,
  onValueChange,
  classNames,
  className = "",
  id,
  onChange,
  ...rest
}: TextareaProps) {
  const inputId = id ?? (typeof label === "string" ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onValueChange?.(e.target.value);
    onChange?.(e);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-semibold text-default-500">
          {label}
          {isRequired && <span className="text-danger ml-0.5" aria-hidden="true"> *</span>}
        </label>
      )}
      <textarea
        id={inputId}
        rows={minRows}
        disabled={isDisabled}
        className={`apple-input w-full px-3 py-2 text-[15px] resize-y ${classNames?.input ?? ""} ${isInvalid ? "!border-danger" : ""} ${className}`}
        onChange={handleChange}
        {...rest}
      />
      {errorMessage && (
        <p className="text-[13px] text-danger">{errorMessage}</p>
      )}
      {description && (
        <p className="text-[13px] text-default-400">{description}</p>
      )}
    </div>
  );
}
