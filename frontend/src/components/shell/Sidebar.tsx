import { useNavigate } from "react-router-dom";
import { useAppSettings } from "../../context/AppSettingsContext";
import { TelaiOSLogo } from "../common/TelaiOSLogo";
import { SidebarNav, type SidebarNavItem } from "./SidebarNav";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import type { ProjectView, WsView } from "../ProjectLayout";

const WS_NAV: ReadonlyArray<SidebarNavItem<WsView> & { href: string }> = [
  { key: "overview",  label: "Overview",  icon: "home",     href: "/" },
  { key: "projects",  label: "Projects",  icon: "layers",   href: "/projects-list" },
  { key: "library",   label: "Library",   icon: "cube",     href: "/library" },
  { key: "analytics", label: "Analytics", icon: "workflow", href: "/analytics" },
  { key: "agents",    label: "Agents",    icon: "bot",      href: "/agents" },
];

const WS_ADMIN_NAV: ReadonlyArray<SidebarNavItem<WsView> & { href: string }> = [
  { key: "people",   label: "People",    icon: "users",    href: "/people"   },
  { key: "audit",    label: "Audit Log", icon: "inbox",    href: "/audit"    },
  { key: "billing",  label: "Billing",   icon: "layers",   href: "/billing"  },
  { key: "security", label: "Security",  icon: "settings", href: "/security" },
  { key: "settings", label: "Settings",  icon: "settings", href: "/settings" },
];

const PROJECT_NAV: ReadonlyArray<SidebarNavItem<ProjectView>> = [
  { key: "dashboard",    label: "Dashboard",    icon: "home"     },
  { key: "conversation", label: "Conversation", icon: "chat"     },
  { key: "repositories", label: "Repositories", icon: "git"      },
  { key: "documents",    label: "Documents",    icon: "book"     },
  { key: "designs",      label: "Designs",      icon: "spark"    },
  { key: "agents",       label: "Agents",       icon: "bot"      },
  { key: "library",      label: "Library",      icon: "cube"     },
  { key: "plans",        label: "Plans",        icon: "workflow" },
];

const PROJECT_BOTTOM_NAV: ReadonlyArray<SidebarNavItem<ProjectView>> = [
  { key: "inbox",    label: "Inbox",    icon: "inbox"    },
  { key: "members",  label: "Members",  icon: "users"    },
  { key: "settings", label: "Settings", icon: "settings" },
];

export type SidebarMode =
  | { kind: "workspace"; wsView: WsView }
  | {
      kind: "project";
      projectId: string;
      projectName: string;
      view: ProjectView;
      onSelectView: (v: ProjectView) => void;
      projects: Array<{ id: string; name: string; color: string }>;
    };

interface SidebarProps {
  mode: SidebarMode;
}

export function Sidebar({ mode }: SidebarProps) {
  const { settings } = useAppSettings();
  const brand = settings.brand_name?.trim() || "TelaiOS";
  const navigate = useNavigate();

  return (
    <aside className="row-span-2 flex flex-col gap-1 overflow-hidden rounded-2xl bg-surface p-2.5 shadow-surface">
      <div className="mb-1 flex items-center gap-2.5 px-2 pt-1.5 pb-3.5 text-[13.5px] font-semibold tracking-tight">
        {settings.logo_url ? (
          <img src={settings.logo_url} alt={`${brand} logo`} className="h-5 w-auto" />
        ) : (
          <TelaiOSLogo size={26} />
        )}
        <span className="truncate text-foreground">{brand}</span>
        <span className="ms-auto text-[11px] font-medium text-muted">v2.4</span>
      </div>

      {mode.kind === "workspace" ? (
        <>
          <h2 className="px-2.5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
            Navigation
          </h2>
          <SidebarNav
            items={WS_NAV}
            selectedKey={mode.wsView}
            onSelect={(key) => {
              const item = WS_NAV.find((n) => n.key === key);
              if (item) navigate(item.href);
            }}
            ariaLabel="Workspace navigation"
          />
          <h2 className="px-2.5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
            Admin
          </h2>
          <SidebarNav
            items={WS_ADMIN_NAV}
            selectedKey={mode.wsView}
            onSelect={(key) => {
              const item = WS_ADMIN_NAV.find((n) => n.key === key);
              if (item) navigate(item.href);
            }}
            ariaLabel="Workspace admin"
          />
        </>
      ) : (
        <>
          <h2 className="truncate px-2.5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
            {mode.projectName}
          </h2>
          <SidebarNav
            items={PROJECT_NAV}
            selectedKey={mode.view}
            onSelect={mode.onSelectView}
            ariaLabel="Project navigation"
          />
          <h2 className="px-2.5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted">
            Projects
          </h2>
          <ul className="flex flex-col gap-0.5 px-0.5">
            {mode.projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/projects/${p.id}`)}
                  data-active={mode.projectId === p.id}
                  className="flex h-7 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] text-muted hover:bg-default/50 hover:text-foreground data-[active=true]:bg-surface-secondary data-[active=true]:text-foreground"
                >
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: p.color }}
                  />
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex h-7 w-full items-center gap-2.5 rounded-lg px-2.5 text-[12.5px] text-muted hover:bg-default/50 hover:text-foreground"
              >
                <span className="w-4 text-center text-muted">+</span>
                <span>All projects</span>
              </button>
            </li>
          </ul>
        </>
      )}

      <div className="flex-1" />

      {mode.kind === "project" && (
        <SidebarNav
          items={PROJECT_BOTTOM_NAV}
          selectedKey={mode.view}
          onSelect={mode.onSelectView}
          ariaLabel="Project bottom navigation"
          className="pt-2"
        />
      )}

      <div className="pt-2">
        <WorkspaceSwitcher />
      </div>
    </aside>
  );
}
