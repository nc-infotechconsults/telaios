import { ListBox } from "@heroui/react";
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
    <ListBox
      aria-label={ariaLabel}
      className={className}
      selectionMode="single"
      selectedKeys={selectedKey ? new Set([selectedKey]) : new Set()}
      onAction={(key) => onSelect(String(key) as K)}
    >
      {items.map((item) => (
        <ListBox.Item key={item.key} id={item.key} textValue={item.label}>
          <Icon name={item.icon} className="size-4 shrink-0 text-muted" />
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge && (
            <span className="ms-auto rounded-md bg-default px-1.5 py-0.5 text-[10.5px] font-medium text-muted">
              {item.badge}
            </span>
          )}
        </ListBox.Item>
      ))}
    </ListBox>
  );
}
