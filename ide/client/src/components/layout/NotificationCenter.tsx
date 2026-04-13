// ─── Notification Center ──────────────────────────────────────────────────────
//
// Dropdown panel showing notification history.
// Triggered from the bell icon in the status bar.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import {
  useNotificationStore,
  type Notification,
  type NotificationType,
} from "@/stores/notificationStore";
import {
  Bell,
  BellDot,
  Check,
  CheckCheck,
  Trash2,
  Info,
  CircleCheck,
  AlertTriangle,
  CircleX,
} from "lucide-react";

// ── Icon / color mapping ─────────────────────────────────────────────────────

const TYPE_ICON: Record<NotificationType, typeof Info> = {
  info: Info,
  success: CircleCheck,
  warning: AlertTriangle,
  error: CircleX,
};

const TYPE_COLOR: Record<NotificationType, string> = {
  info: "text-blue-400",
  success: "text-emerald-400",
  warning: "text-amber-400",
  error: "text-red-400",
};

const TYPE_BORDER: Record<NotificationType, string> = {
  info: "border-l-blue-400",
  success: "border-l-emerald-400",
  warning: "border-l-amber-400",
  error: "border-l-red-400",
};

// ── Time formatting ──────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clear = useNotificationStore((s) => s.clear);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);

  const BellIcon = unreadCount > 0 ? BellDot : Bell;

  return (
    <span className="relative inline-flex items-center" ref={panelRef}>
      {/* Bell trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center gap-1 hover:text-zinc-200 transition-colors"
        title={`${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`}
      >
        <BellIcon size={13} className={unreadCount > 0 ? "text-violet-400" : undefined} />
        {unreadCount > 0 && (
          <span className="text-[10px] font-semibold text-violet-300">{unreadCount}</span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-80 max-h-96 bg-zinc-900/95 backdrop-blur-lg border border-white/10 rounded-lg shadow-xl overflow-hidden z-[100] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
            <span className="text-xs font-semibold text-zinc-200">Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead()}
                  className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Mark all read"
                >
                  <CheckCheck size={13} />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => clear()}
                  className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Clear all"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-xs text-zinc-500">
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onMarkRead={() => markRead(n.id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </span>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function NotificationRow({
  notification: n,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: () => void;
}) {
  const Icon = TYPE_ICON[n.type];

  return (
    <div
      className={`group flex items-start gap-2 px-3 py-2 border-l-2 hover:bg-white/[0.04] transition-colors ${
        n.read ? "border-l-transparent opacity-60" : TYPE_BORDER[n.type]
      }`}
    >
      <Icon size={14} className={`mt-0.5 shrink-0 ${TYPE_COLOR[n.type]}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-200 font-medium truncate">{n.title}</div>
        {n.description && (
          <div className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{n.description}</div>
        )}
        <div className="text-[10px] text-zinc-500 mt-1">{timeAgo(n.timestamp)}</div>
      </div>
      {!n.read && (
        <button
          onClick={onMarkRead}
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition-all shrink-0"
          title="Mark read"
        >
          <Check size={12} />
        </button>
      )}
    </div>
  );
}
