import type { ReactNode } from "react";

interface TabsProps {
  children: ReactNode;
  "aria-label"?: string;
  selectedKey?: string;
  onSelectionChange?: (key: string) => void;
  variant?: string;
  size?: string;
  className?: string;
  classNames?: { tabList?: string; panel?: string };
}

export function Tabs({
  children,
  "aria-label": ariaLabel,
  selectedKey,
  onSelectionChange,
  variant: _variant,
  size: _size,
  className = "",
  classNames,
}: TabsProps) {
  const tabs = Array.isArray(children) ? children : [children];
  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={ariaLabel ?? "Tabs"}
        className={`apple-tab-bar flex border-b border-divider overflow-x-auto ${classNames?.tabList ?? ""}`}
      >
        {tabs.map((tab: any) => {
          const key = tab?.props?.key ?? tab?.key;
          const title = tab?.props?.title ?? key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={selectedKey === key}
              onClick={() => onSelectionChange?.(key)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                selectedKey === key
                  ? "border-primary text-primary"
                  : "border-transparent text-default-500 hover:text-foreground"
              }`}
            >
              {title}
            </button>
          );
        })}
      </div>
      <div className={classNames?.panel ?? "pt-4"}>
        {tabs.find((t: any) => (t?.props?.key ?? t?.key) === selectedKey) || tabs[0]}
      </div>
    </div>
  );
}

export function Tab({ children }: { children?: ReactNode; key?: string; title?: ReactNode }) {
  return <>{children}</>;
}
