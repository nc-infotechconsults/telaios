import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useAppSettings } from "../../context/AppSettingsContext";

/**
 * Compact workspace reference button at the bottom of the sidebar.
 * Single-workspace UX: clicking it returns to the workspace overview (/).
 * Not a dropdown — actual navigation between management console and project
 * details lives in the upper sidebar section in project context.
 */
export function WorkspaceSwitcher() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useAppSettings();
  const brand = settings.brand_name?.trim() || "TelaiOS";
  const initials = brand.slice(0, 1).toUpperCase();

  return (
    <button
      type="button"
      onClick={() => navigate("/")}
      aria-label={`Open ${brand} workspace overview`}
      className="flex w-full items-center gap-2.5 rounded-xl bg-surface-secondary px-2 py-2 text-left hover:bg-default/50"
    >
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[12px] font-semibold text-accent-soft-foreground">
        {initials}
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[12.5px] font-semibold text-foreground">{brand}</span>
        <span className="truncate text-[11px] text-muted">
          {user?.display_name ?? user?.email ?? "—"}
        </span>
      </div>
    </button>
  );
}
