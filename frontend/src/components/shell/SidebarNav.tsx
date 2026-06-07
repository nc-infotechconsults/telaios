import { Icon } from "../Icon";

export interface SidebarNavItem<K extends string> {
  key: K;
  label: string;
  icon: string;
  badge?: string | null;
}

interface SidebarNavProps<K extends string> {
  items: ReadonlyArray<SidebarNavItem<K>>;
  selectedKey?: K;
  onSelect: (key: K) => void;
  ariaLabel: string;
  className?: string;
}

export function SidebarNav<K extends string>({
  items,
  selectedKey,
  onSelect,
  ariaLabel,
  className,
}: SidebarNavProps<K>) {
  return (
    <nav aria-label={ariaLabel} className={`flex flex-col gap-0.5 ${className ?? ""}`}>
      {items.map((item) => {
        const active = item.key === selectedKey;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            data-active={active || undefined}
            className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-muted hover:bg-default/50 hover:text-foreground data-[active=true]:bg-surface-secondary data-[active=true]:text-foreground"
          >
            <Icon name={item.icon} className="size-4 shrink-0" />
            <span className="flex-1 truncate text-start">{item.label}</span>
            {item.badge && (
              <span className="rounded-md bg-default px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
