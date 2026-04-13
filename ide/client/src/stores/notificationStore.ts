// ─── Notification Store ────────────────────────────────────────────────────────
//
// Manages notification history and bridges to @heroui/toast for transient toasts.
//
// Usage:
//   import { notify } from "@/stores/notificationStore";
//   notify({ title: "File saved", type: "success" });
//
// The notify() helper:
//  1. Appends to the notification history (max 100, FIFO)
//  2. Increments unreadCount
//  3. Calls addToast() from @heroui/toast so a transient toast appears
// ──────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { addToast } from "@heroui/toast";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  title: string;
  description?: string;
  type: NotificationType;
  timestamp: number;
  read: boolean;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;

  /** Add a notification (also fires a toast). */
  addNotification: (opts: Omit<Notification, "id" | "timestamp" | "read">) => void;
  /** Mark a single notification as read. */
  markRead: (id: string) => void;
  /** Mark all notifications as read. */
  markAllRead: () => void;
  /** Clear all notification history. */
  clear: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_NOTIFICATIONS = 100;
let _nextId = 1;

// ── Toast color mapping ──────────────────────────────────────────────────────

const TOAST_COLORS: Record<NotificationType, "default" | "success" | "warning" | "danger"> = {
  info: "default",
  success: "success",
  warning: "warning",
  error: "danger",
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],
  unreadCount: 0,

  addNotification(opts) {
    const notification: Notification = {
      ...opts,
      id: `notif-${_nextId++}`,
      timestamp: Date.now(),
      read: false,
    };

    set((s) => {
      const updated = [notification, ...s.notifications].slice(0, MAX_NOTIFICATIONS);
      return {
        notifications: updated,
        unreadCount: s.unreadCount + 1,
      };
    });

    // Fire transient toast
    try {
      addToast({
        title: opts.title,
        description: opts.description,
        color: TOAST_COLORS[opts.type],
      });
    } catch {
      // Toast provider may not be mounted (e.g. in tests)
    }
  },

  markRead(id) {
    set((s) => {
      let decremented = false;
      const updated = s.notifications.map((n) => {
        if (n.id === id && !n.read) {
          decremented = true;
          return { ...n, read: true };
        }
        return n;
      });
      return {
        notifications: updated,
        unreadCount: decremented ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
      };
    });
  },

  markAllRead() {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  clear() {
    set({ notifications: [], unreadCount: 0 });
  },
}));

// ── Public Helper ─────────────────────────────────────────────────────────────

/**
 * Fire a notification. Adds to history and shows a transient toast.
 *
 * Replaces direct `addToast()` calls across the codebase.
 */
export function notify(opts: Omit<Notification, "id" | "timestamp" | "read">): void {
  useNotificationStore.getState().addNotification(opts);
}
