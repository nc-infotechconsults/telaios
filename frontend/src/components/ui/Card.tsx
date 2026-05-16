import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  isPressable?: boolean;
  onPress?: () => void;
}

export function Card({ children, className = "", isPressable, onPress, onClick, ...rest }: CardProps) {
  if (isPressable) {
    return (
      <button
        type="button"
        onClick={onPress ?? onClick}
        className={`apple-card w-full text-left ${className}`}
      >
        {children}
      </button>
    );
  }
  return <div className={`apple-card ${className}`} onClick={onPress ?? onClick} {...rest}>{children}</div>;
}

export function CardHeader({ children, className = "", ...rest }: CardProps) {
  return <div className={`px-5 pt-5 pb-2 ${className}`} {...rest}>{children}</div>;
}

export function CardBody({ children, className = "", ...rest }: CardProps) {
  return <div className={`px-5 py-3 ${className}`} {...rest}>{children}</div>;
}

export function CardFooter({ children, className = "", ...rest }: CardProps) {
  return <div className={`px-5 pb-5 pt-2 ${className}`} {...rest}>{children}</div>;
}
