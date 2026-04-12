import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useEditorStore } from "@/stores/editorStore";

interface Props {
  workspaceId: string;
}

export function Terminal({ workspaceId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const togglePanel = useEditorStore((s) => s.togglePanel);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background: "#0d0d0f",
        foreground: "#e4e4e7",
        cursor: "#a1a1aa",
        black: "#18181b",
        brightBlack: "#3f3f46",
        white: "#e4e4e7",
        brightWhite: "#f4f4f5",
      },
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
    });

    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Open a dedicated terminal WebSocket session
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const { cols, rows } = term; // set by fit.fit() above
    const socket = new WebSocket(
      `${protocol}://${location.host}/ws/${workspaceId}/terminal?cols=${cols}&rows=${rows}`,
    );
    // Receive binary frames as ArrayBuffer (not Blob)
    socket.binaryType = "arraybuffer";
    wsRef.current = socket;

    socket.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data));
      } else {
        // string — e.g. error messages sent before close
        term.write(e.data as string);
      }
    };

    socket.onerror = () => {
      term.write(
        "\r\n\x1b[31mTerminal connection error. Is the container running?\x1b[0m\r\n",
      );
    };

    socket.onclose = (e) => {
      if (e.code !== 1000) {
        term.write("\r\n\x1b[33mTerminal disconnected.\x1b[0m\r\n");
      }
    };

    term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "terminal:data", payload: { data } }));
      }
    });

    const ro = new ResizeObserver(() => {
      fit.fit();
      if (socket.readyState === WebSocket.OPEN) {
        const { cols, rows } = term;
        socket.send(
          JSON.stringify({
            type: "terminal:resize",
            payload: { cols, rows },
          }),
        );
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      socket.close();
      term.dispose();
    };
  }, [workspaceId]);

  return (
    <div className="flex flex-col h-full bg-[#0d0d0f]">
      <div ref={containerRef} className="flex-1 p-1 overflow-hidden" />
    </div>
  );
}
