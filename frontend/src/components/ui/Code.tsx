import type { ReactNode } from "react";

interface CodeProps {
  children: ReactNode;
  className?: string;
}

export function Code({ children, className = "" }: CodeProps) {
  return (
    <code className={`bg-default-100 text-default-600 rounded-md px-1.5 py-0.5 text-[13px] font-mono ${className}`}>
      {children}
    </code>
  );
}
