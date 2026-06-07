import { Avatar, Button, Dropdown } from "@heroui/react";
import { useAuth } from "../../context/AuthContext";
import { useAppSettings } from "../../context/AppSettingsContext";

export function WorkspaceSwitcher() {
  const { user } = useAuth();
  const { settings } = useAppSettings();
  const brand = settings.brand_name?.trim() || "TelaiOS";
  const initials = brand.slice(0, 1).toUpperCase();

  return (
    <Dropdown>
      <Button
        variant="tertiary"
        className="h-auto w-full justify-start gap-2.5 rounded-xl bg-surface-secondary px-2 py-2 text-left"
      >
        <Avatar size="sm" className="bg-accent-soft text-accent-soft-foreground">
          <Avatar.Fallback>{initials}</Avatar.Fallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[12.5px] font-semibold text-foreground">{brand}</span>
          <span className="truncate text-[11px] text-muted">
            {user?.display_name ?? user?.email ?? "—"}
          </span>
        </div>
      </Button>
      <Dropdown.Menu aria-label="Switch workspace">
        <Dropdown.Item id="current" textValue={brand}>
          {brand}
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  );
}
