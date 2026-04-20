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
    term.open(termRef.current);
    fit.fit();

    termInstance.current = term;
    fitAddon.current = fit;

    term.writeln("\x1b[33mConnecting to container shell…\x1b[0m");

    // ── WebSocket setup ─────────────────────────────────────────────────────
    const wsUrl = `${WS_BASE}/ws/environments/${envId}/docker/shell/${containerId}?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";
    ws.current = socket;

    socket.onopen = () => {
      term.clear();
      // Send initial size
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

    socket.onclose = (event) => {
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

    // Terminal resize → WebSocket resize message
    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
        );
      }
    });

    if (termRef.current) {
      resizeObserver.observe(termRef.current);
    }

    // Cleanup
    return () => {
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

      {/* Terminal */}
      <div
        ref={termRef}
        style={{ flex: 1, overflow: "hidden", padding: 4 }}
      />
    </div>
  );
}
