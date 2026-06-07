import { Avatar, Button, Chip, Dropdown, Kbd } from "@heroui/react";
import { useAuth } from "../../context/AuthContext";

interface TopbarProps {
  breadcrumbTitle: string;
  breadcrumbColor?: string;
  viewLabel: string;
  extraTag?: string;
  onOpenCommandPalette: () => void;
}

export function Topbar({
  breadcrumbTitle,
  breadcrumbColor,
  viewLabel,
  extraTag,
  onOpenCommandPalette,
}: TopbarProps) {
  const { user, logout } = useAuth();
  const initials =
    user?.display_name?.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() ?? "U";

  return (
    <header className="col-start-2 flex h-14 items-center gap-2.5 rounded-2xl bg-surface px-4 shadow-surface">
      <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
        {breadcrumbColor && (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: breadcrumbColor }}
          />
        )}
        <b className="truncate font-semibold text-foreground">{breadcrumbTitle}</b>
        <span className="text-muted/60">/</span>
        <span className="truncate">{viewLabel}</span>
        {extraTag && (
          <Chip size="sm" variant="secondary" className="ms-1">
            {extraTag}
          </Chip>
        )}
      </div>

      <div className="flex-1" />

      <Button
        variant="tertiary"
        size="sm"
        onPress={onOpenCommandPalette}
        className="hidden gap-2 md:inline-flex"
        aria-label="Open command palette"
      >
        <i className="fa-solid fa-magnifying-glass text-muted" aria-hidden />
        <span className="text-muted">Search or ask TEOS…</span>
        <Kbd className="ms-2" variant="light">
          <Kbd.Abbr keyValue="command" />
          <Kbd.Content>K</Kbd.Content>
        </Kbd>
      </Button>

      <Button isIconOnly size="sm" variant="tertiary" aria-label="Notifications">
        <i className="fa-solid fa-bell text-muted" aria-hidden />
      </Button>

      <Dropdown>
        <Button isIconOnly size="sm" variant="tertiary" aria-label="User menu">
          <Avatar size="sm" className="bg-accent text-accent-foreground">
            <Avatar.Fallback>{initials}</Avatar.Fallback>
          </Avatar>
        </Button>
        <Dropdown.Menu
          aria-label="User actions"
          onAction={(key) => {
            if (key === "logout") logout();
          }}
        >
          <Dropdown.Item id="profile" textValue="Profile">
            Profile
          </Dropdown.Item>
          <Dropdown.Item id="logout" textValue="Sign out" variant="danger">
            Sign out
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    </header>
  );
}
