import type { ReactNode } from "react";

interface Props {
  content: ReactNode;
  children: ReactNode;
  color?: string;
  placement?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function Tooltip({ content, children, color }: Props) {
  // Simple wrapper — full tooltip would need more state management
  // For now, render children as-is
  return <>{children}</>;
}
