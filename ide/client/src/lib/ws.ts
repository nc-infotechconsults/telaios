import type { WsMessage } from "@/types";

type MessageHandler = (msg: WsMessage) => void;
type StatusHandler = (connected: boolean) => void;

class WsManager {
  private ws: WebSocket | null = null;
  private workspaceId: string | null = null;
  private handlers = new Set<MessageHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;

  connect(workspaceId: string) {
    if (
      this.workspaceId === workspaceId &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      return;
    }
    this.disconnect();
    this.workspaceId = workspaceId;
    this.destroyed = false;
    this._open();
  }

  private _open() {
    if (this.destroyed || !this.workspaceId) return;

    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${location.host}/ws/${this.workspaceId}`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener("open", () => {
      this._notifyStatus(true);
      this._startHeartbeat();
    });

    this.ws.addEventListener("message", (evt) => {
      try {
        const msg = JSON.parse(evt.data) as WsMessage;
        for (const h of this.handlers) h(msg);
      } catch {
        // ignore malformed
      }
    });

    this.ws.addEventListener("close", () => {
      this._notifyStatus(false);
      this._stopHeartbeat();
      this._scheduleReconnect();
    });

    this.ws.addEventListener("error", () => {
      this.ws?.close();
    });
  }

  private _scheduleReconnect() {
    if (this.destroyed) return;
    this.reconnectTimer = setTimeout(() => this._open(), 3000);
  }

  private _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "ping", payload: {} });
    }, 30_000);
  }

  private _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _notifyStatus(connected: boolean) {
    for (const h of this.statusHandlers) h(connected);
  }

  send(msg: Partial<WsMessage>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ workspaceId: this.workspaceId, ...msg }));
    }
  }

  onMessage(fn: MessageHandler): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  onStatus(fn: StatusHandler): () => void {
    this.statusHandlers.add(fn);
    return () => this.statusHandlers.delete(fn);
  }

  disconnect() {
    this._stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.workspaceId = null;
    this.destroyed = true;
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/** Singleton WebSocket manager — one connection per active workspace */
export const ws = new WsManager();
