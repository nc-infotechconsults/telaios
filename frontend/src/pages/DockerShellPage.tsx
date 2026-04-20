/**
 * DockerShellPage
 *
 * Full-screen xterm.js terminal connected to the Docker container shell via
 * WebSocket.  Opened in a new browser tab by DockerContainerDetail when the
 * user clicks "Shell".
 *
 * URL:  /environments/:envId/docker/shell/:containerId?token=<jwt>
 *
 * The JWT token is passed as a query-param because browsers cannot send
 * custom headers on WebSocket upgrade requests.
 */
import { useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

const WS_BASE =
  import.meta.env.VITE_WS_URL ??
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host.replace(/:\d+$/, ":3000")}`;

export default function DockerShellPage() {
  const { envId, containerId } = useParams<{ envId: string; containerId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const termRef = useRef<HTMLDivElement>(null);
  const termInstance = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!termRef.current || !envId || !containerId) return;

    let disposed = false;
    let rafId = 0;

    // ── Terminal setup ──────────────────────────────────────────────────────
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 14,
      theme: {
        background: "#1a1b26",
        foreground: "#c0caf5",
        cursor: "#c0caf5",
        selectionBackground: "#283457",
        black: "#15161e",
        red: "#f7768e",
        green: "#9ece6a",
        yellow: "#e0af68",
        blue: "#7aa2f7",
        magenta: "#bb9af7",
        cyan: "#7dcfff",
        white: "#a9b1d6",
      },
    });

    const fit = new FitAddon();
    term.loadAddon(fit);

    termInstance.current = term;
    fitAddon.current = fit;

    // ── WebSocket setup ─────────────────────────────────────────────────────
    // Start connecting immediately; xterm buffers writes before open() is called.
    const wsUrl = `${WS_BASE}/ws/environments/${envId}/docker/shell/${containerId}?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";
    ws.current = socket;

    socket.onopen = () => {
      // Send initial terminal size (uses xterm defaults 80×24 if open() not yet called)
      socket.send(
        JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
      );
    };

    socket.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
      } else {
        term.write(event.data as string);
      }
    };

    socket.onclose = (event: CloseEvent) => {
      term.writeln(`\r\n\x1b[31mConnection closed (${event.code})\x1b[0m`);
    };

    socket.onerror = () => {
      term.writeln("\r\n\x1b[31mWebSocket error — check the console.\x1b[0m");
    };

    // Terminal → WebSocket (stdin)
    const dataDisposable = term.onData((data: string) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    // ResizeObserver — attached only after terminal.open() succeeds
    const resizeObserver = new ResizeObserver(() => {
      try { fit.fit(); } catch { /* element not yet laid out */ }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
        );
      }
    });

    // ── Defer term.open() until element has computed layout dimensions ───────
    // term.open() on a zero-size element crashes xterm's viewport renderer.
    // requestAnimationFrame fires after the browser has performed layout,
    // guaranteeing the flex container has non-zero dimensions.
    const tryOpen = () => {
      if (disposed || !termRef.current) return;
      try {
        term.open(termRef.current);
        fit.fit();
        // Re-send accurate size after fit
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
          );
        }
        // Only start observing after the terminal is successfully opened
        resizeObserver.observe(termRef.current);
      } catch {
        // Layout not ready yet — retry on next frame
        rafId = requestAnimationFrame(tryOpen);
      }
    };
    rafId = requestAnimationFrame(tryOpen);

    // Cleanup
    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      dataDisposable.dispose();
      resizeObserver.disconnect();
      socket.close();
      term.dispose();
      termInstance.current = null;
      fitAddon.current = null;
      ws.current = null;
    };
  }, [envId, containerId, token]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#1a1b26",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          padding: "6px 12px",
          background: "#16161e",
          borderBottom: "1px solid #292e42",
          fontSize: 12,
          color: "#565f89",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ color: "#7aa2f7" }}>●</span>
        <span>
          Shell — container <code style={{ color: "#9ece6a" }}>{containerId?.slice(0, 12)}</code>
        </span>
      </div>

      {/* Terminal — flex:1 fills remaining height after title bar */}
      <div
        ref={termRef}
        style={{ flex: 1, overflow: "hidden", padding: 4 }}
      />
    </div>
  );
}
