import type { ReactNode, HTMLAttributes } from "react";

interface TableProps extends HTMLAttributes<HTMLDivElement> {
  "aria-label"?: string;
  removeWrapper?: boolean;
  classNames?: { th?: string; tr?: string };
  children: ReactNode;
}

export function Table({ "aria-label": ariaLabel, removeWrapper, classNames, children, className = "", ...rest }: TableProps) {
  const content = (
    <table className="w-full" aria-label={ariaLabel}>
      {children}
    </table>
  );

  if (removeWrapper) return content;

  return (
    <div className={`apple-card overflow-hidden ${className}`} {...rest}>
      {content}
    </div>
  );
}

export function TableHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <thead className={className}>{children}</thead>;
}

interface TableColumnProps {
  children: ReactNode;
  className?: string;
}

export function TableColumn({ children, className = "" }: TableColumnProps) {
  return <th className={`apple-table-th text-left ${className}`}>{children}</th>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
}

export function TableRow({ children, className = "", ...rest }: TableRowProps) {
  return (
    <tr className={`apple-list-item border-b border-divider last:border-b-0 ${className}`} {...rest}>
      {children}
    </tr>
  );
}

export function TableCell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-sm ${className}`}>{children}</td>;
}
