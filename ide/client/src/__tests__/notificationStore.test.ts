// ─── Notification Store Tests ─────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useNotificationStore, notify } from "@/stores/notificationStore";

// ── Mock @heroui/toast so addToast doesn't throw in test env ─────────────────
vi.mock("@heroui/toast", () => ({
  addToast: vi.fn(),
}));

// ── Reset store between tests ────────────────────────────────────────────────

function resetStore() {
  useNotificationStore.setState({
    notifications: [],
    unreadCount: 0,
  });
}

beforeEach(() => {
  resetStore();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("notificationStore", () => {
  describe("addNotification", () => {
    it("should add a notification to the list", () => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "Hello", type: "info" });

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe("Hello");
      expect(notifications[0].type).toBe("info");
      expect(notifications[0].read).toBe(false);
    });

    it("should prepend new notifications (newest first)", () => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "First", type: "info" });
      addNotification({ title: "Second", type: "success" });

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].title).toBe("Second");
      expect(notifications[1].title).toBe("First");
    });

    it("should increment unreadCount", () => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "A", type: "info" });
      addNotification({ title: "B", type: "warning" });

      expect(useNotificationStore.getState().unreadCount).toBe(2);
    });

    it("should include optional description", () => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "Error", description: "Something went wrong", type: "error" });

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].description).toBe("Something went wrong");
    });

    it("should assign unique IDs", () => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "A", type: "info" });
      addNotification({ title: "B", type: "info" });

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].id).not.toBe(notifications[1].id);
    });

    it("should set timestamp", () => {
      const before = Date.now();
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "Timed", type: "info" });
      const after = Date.now();

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(notifications[0].timestamp).toBeLessThanOrEqual(after);
    });

    it("should call addToast from @heroui/toast", async () => {
      const { addToast } = await import("@heroui/toast");
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "Toast test", type: "success" });

      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Toast test",
          color: "success",
        }),
      );
    });
  });

  describe("FIFO eviction", () => {
    it("should evict oldest notifications when exceeding max (100)", () => {
      const { addNotification } = useNotificationStore.getState();

      // Add 105 notifications
      for (let i = 0; i < 105; i++) {
        addNotification({ title: `Notif ${i}`, type: "info" });
      }

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(100);
      // Newest should be first
      expect(notifications[0].title).toBe("Notif 104");
      // Oldest surviving should be Notif 5 (0-4 evicted)
      expect(notifications[99].title).toBe("Notif 5");
    });
  });

  describe("markRead", () => {
    it("should mark a specific notification as read", () => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "Read me", type: "info" });

      const id = useNotificationStore.getState().notifications[0].id;
      useNotificationStore.getState().markRead(id);

      const { notifications, unreadCount } = useNotificationStore.getState();
      expect(notifications[0].read).toBe(true);
      expect(unreadCount).toBe(0);
    });

    it("should not decrement unreadCount if already read", () => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "A", type: "info" });
      addNotification({ title: "B", type: "info" });

      const id = useNotificationStore.getState().notifications[0].id;
      useNotificationStore.getState().markRead(id);
      expect(useNotificationStore.getState().unreadCount).toBe(1);

      // Mark the same one again — should not change unreadCount
      useNotificationStore.getState().markRead(id);
      expect(useNotificationStore.getState().unreadCount).toBe(1);
    });

    it("should be a no-op for non-existent IDs", () => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "A", type: "info" });

      useNotificationStore.getState().markRead("non-existent-id");
      expect(useNotificationStore.getState().unreadCount).toBe(1);
    });
  });

  describe("markAllRead", () => {
    it("should mark all notifications as read and reset unreadCount", () => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "A", type: "info" });
      addNotification({ title: "B", type: "warning" });
      addNotification({ title: "C", type: "error" });

      useNotificationStore.getState().markAllRead();

      const { notifications, unreadCount } = useNotificationStore.getState();
      expect(unreadCount).toBe(0);
      expect(notifications.every((n) => n.read)).toBe(true);
    });

    it("should be safe to call when there are no notifications", () => {
      useNotificationStore.getState().markAllRead();
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  describe("clear", () => {
    it("should remove all notifications and reset unreadCount", () => {
      const { addNotification } = useNotificationStore.getState();
      addNotification({ title: "A", type: "info" });
      addNotification({ title: "B", type: "success" });

      useNotificationStore.getState().clear();

      const { notifications, unreadCount } = useNotificationStore.getState();
      expect(notifications).toHaveLength(0);
      expect(unreadCount).toBe(0);
    });
  });

  describe("notify() convenience function", () => {
    it("should add a notification via the store", () => {
      notify({ title: "Quick notify", type: "warning" });

      const { notifications } = useNotificationStore.getState();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe("Quick notify");
      expect(notifications[0].type).toBe("warning");
    });

    it("should support description", () => {
      notify({ title: "With desc", description: "Details here", type: "error" });

      const { notifications } = useNotificationStore.getState();
      expect(notifications[0].description).toBe("Details here");
    });
  });
});
