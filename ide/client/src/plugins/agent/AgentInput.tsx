// ─── Agent Input ──────────────────────────────────────────────────────────────
//
// Multi-line textarea with Ctrl+Enter to send.
// Shows context chips for attached file/selection.
// Stop button during streaming.
// ──────────────────────────────────────────────────────────────────────────────

import { useRef, useState, useCallback } from "react";
import { Send, Square, Paperclip, X } from "lucide-react";
import { useAgentStore } from "./agentStore";
import type { AgentContext } from "./agentStore";

interface Props {
  /** Pre-attached context from editor action */
  initialContext?: AgentContext;
}

export function AgentInput({ initialContext }: Props) {
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const isConnected = useAgentStore((s) => s.connectionStatus === "connected");
  const hasSession = useAgentStore((s) => s.activeSessionId !== null);
  const onSend = useAgentStore((s) => s.sendPrompt);
  const onStop = useAgentStore((s) => s.abort);

  const [text, setText] = useState("");
  const [context, setContext] = useState<AgentContext | undefined>(initialContext);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const disabled = !isConnected || !hasSession || isStreaming;
  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(text.trim(), context);
    setText("");
    setContext(undefined);
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [canSend, text, context, onSend]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    // Auto-grow
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function clearContext() {
    setContext(undefined);
  }

  return (
    <div className="border-t border-white/[0.05] p-2 flex flex-col gap-1.5 shrink-0">
      {/* Context chip */}
      {context?.filePath && (
        <div className="flex items-center gap-1 flex-wrap px-1">
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] text-violet-300 max-w-full">
            <Paperclip size={9} />
            <span className="truncate max-w-[180px]">{context.filePath}</span>
            {context.selectedText && (
              <span className="text-violet-500 shrink-0">• selection</span>
            )}
            <button
              onClick={clearContext}
              className="ml-0.5 text-violet-500 hover:text-violet-300 transition-colors"
            >
              <X size={9} />
            </button>
          </div>
        </div>
      )}

      {/* Textarea row */}
      <div className="flex items-end gap-1.5">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            !isConnected
              ? "Agent not connected…"
              : !hasSession
              ? "Create a session to start…"
              : isStreaming
              ? "Agent is thinking…"
              : "Ask the agent… (Ctrl+Enter to send)"
          }
          disabled={disabled}
          rows={1}
          className="
            flex-1 resize-none overflow-hidden rounded-lg px-3 py-2
            text-[12px] text-zinc-200 bg-white/[0.04] border border-white/[0.08]
            placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/40
            focus:ring-1 focus:ring-violet-500/10 transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
            min-h-[34px] max-h-[160px]
          "
        />

        {/* Send / Stop button */}
        {isStreaming ? (
          <button
            onClick={onStop}
            className="
              h-[34px] w-[34px] flex items-center justify-center rounded-lg
              bg-red-600/20 border border-red-500/30 text-red-400
              hover:bg-red-600/30 transition-colors shrink-0
            "
            title="Stop generation"
          >
            <Square size={13} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="
              h-[34px] w-[34px] flex items-center justify-center rounded-lg
              bg-violet-600/20 border border-violet-500/30 text-violet-400
              hover:bg-violet-600/30 hover:text-violet-300 transition-colors shrink-0
              disabled:opacity-30 disabled:cursor-not-allowed
            "
            title="Send (Ctrl+Enter)"
          >
            <Send size={13} />
          </button>
        )}
      </div>

      {/* Hint */}
      <p className="text-[9px] text-zinc-700 px-1">
        Ctrl+Enter to send
      </p>
    </div>
  );
}
