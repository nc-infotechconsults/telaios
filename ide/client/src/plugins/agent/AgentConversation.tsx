// ─── Agent Conversation ───────────────────────────────────────────────────────
//
// Scrollable message list. Auto-scrolls to bottom on new content.
// User messages compact; assistant messages rendered as markdown.
// ──────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useCallback } from "react";
import { User, Bot } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { ToolCallCard } from "./ToolCallCard";
import { useAgentStore } from "./agentStore";
import type { AgentMessage, AgentPart } from "./agentStore";
import { useEditorStore } from "@/stores/editorStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { getMonacoEditor } from "@/stores/monacoInstanceStore";

// ── Markdown component map ─────────────────────────────────────────────────────

const REMARK_PLUGINS = [remarkGfm];

// ── File reference detection ──────────────────────────────────────────────────
//
// Matches patterns like:
//   src/index.ts   ./lib/api.ts   components/App.tsx:42   package.json
//   server/routes/auth.ts:10:5
//
// Must contain at least one `/` or start with `./` AND end with a file extension.
// Optional `:lineNumber` or `:line:col` suffix.

const FILE_REF_REGEX =
  /(?:^|(?<=[\s(`'"]))((\.\/|[a-zA-Z][\w.-]*\/)[^\s)`'"]*\.\w+(?::\d+(?::\d+)?)?)(?=$|[\s),.`'"!?;])/g;

/**
 * Parse a file reference like "src/index.ts:42:5" into path + line + column.
 */
function parseFileRef(ref: string): { path: string; line?: number; column?: number } {
  // Match trailing :line or :line:col
  const match = ref.match(/^(.+?):(\d+)(?::(\d+))?$/);
  if (match) {
    return {
      path: match[1],
      line: parseInt(match[2], 10),
      column: match[3] ? parseInt(match[3], 10) : undefined,
    };
  }
  return { path: ref };
}

/**
 * Open a file in the editor and optionally navigate to a line.
 */
function openFileReference(ref: string): void {
  const workspaceId = useWorkspaceStore.getState().activeWorkspace?.id;
  if (!workspaceId) return;

  const { path, line, column } = parseFileRef(ref);

  useEditorStore.getState().openFile(workspaceId, path).then(() => {
    if (line) {
      // Small delay to let Monaco mount/switch to the new model
      setTimeout(() => {
        const editor = getMonacoEditor();
        if (!editor) return;
        const pos = { lineNumber: line, column: column ?? 1 };
        editor.setPosition(pos);
        editor.revealLineInCenter(line);
        // Brief highlight via selection of the target line
        editor.setSelection({
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: (editor.getModel()?.getLineMaxColumn(line) ?? 1),
        });
        editor.focus();
      }, 100);
    }
  }).catch(() => {
    // File may not exist — silently ignore
  });
}

/**
 * Splits text into alternating plain-text and file-reference segments.
 */
function linkifyFileReferences(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  FILE_REF_REGEX.lastIndex = 0;

  while ((match = FILE_REF_REGEX.exec(text)) !== null) {
    const ref = match[1];
    const start = match.index + (match[0].length - ref.length);

    // Push preceding text
    if (start > lastIndex) {
      parts.push(text.slice(lastIndex, start));
    }

    // Push clickable file reference
    parts.push(
      <button
        key={`fref-${start}`}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openFileReference(ref);
        }}
        className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 decoration-cyan-500/40 hover:decoration-cyan-400/60 transition-colors cursor-pointer font-mono text-[inherit]"
        title={`Open ${ref}`}
      >
        {ref}
      </button>,
    );

    lastIndex = start + ref.length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/**
 * Recursively walk React children and linkify file references in string nodes.
 */
function linkifyChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      const linked = linkifyFileReferences(child);
      return linked.length === 1 && typeof linked[0] === "string"
        ? child
        : <>{linked}</>;
    }
    // Don't linkify inside code/pre elements or buttons
    if (React.isValidElement(child)) {
      const type = child.type;
      if (type === "code" || type === "pre" || type === "button" || type === "a") {
        return child;
      }
      // Recurse into children
      const props = child.props as { children?: React.ReactNode };
      if (props.children) {
        return React.cloneElement(child, {}, linkifyChildren(props.children));
      }
    }
    return child;
  });
}

const markdownComponents: Components = {
  // Code blocks and inline code
  code({ node, className, children, ...props }) {
    const match = /language-(\w+)/.exec(className ?? "");
    const lang = match?.[1] ?? "";
    // react-markdown passes inline code without a node parent of type "pre"
    const isInline = !className;

    if (isInline) {
      // Check if inline code looks like a file path — make it clickable
      const text = String(children).replace(/\n$/, "");
      FILE_REF_REGEX.lastIndex = 0;
      const isFilePath = FILE_REF_REGEX.test(text);

      if (isFilePath) {
        return (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openFileReference(text);
            }}
            className="px-1.5 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-[11px] text-cyan-300 font-mono hover:bg-cyan-500/20 hover:text-cyan-200 transition-colors cursor-pointer"
            title={`Open ${text}`}
          >
            {text}
          </button>
        );
      }

      return (
        <code
          className="px-1.5 py-0.5 bg-black/40 border border-white/[0.06] rounded text-[11px] text-violet-300 font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }

    // Block code: extract filename from language string (e.g. "typescript src/index.ts")
    const langParts = (className ?? "").replace("language-", "").split(/\s+/);
    const displayLang = langParts[0] || "";
    const codeFilePath = langParts[1] || "";

    return (
      <div className="my-2 rounded-lg border border-white/[0.07] overflow-hidden">
        {(displayLang || codeFilePath) && (
          <div className="px-3 py-1 bg-white/[0.03] border-b border-white/[0.06] text-[9px] text-zinc-500 uppercase tracking-wide font-mono flex items-center gap-2">
            {displayLang && <span>{displayLang}</span>}
            {codeFilePath && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  openFileReference(codeFilePath);
                }}
                className="text-cyan-500 hover:text-cyan-400 normal-case transition-colors cursor-pointer"
                title={`Open ${codeFilePath}`}
              >
                {codeFilePath}
              </button>
            )}
          </div>
        )}
        <pre className="p-3 overflow-x-auto bg-black/40 text-[11px] text-zinc-300 leading-relaxed">
          <code className={className}>{children}</code>
        </pre>
      </div>
    );
  },

  // Paragraphs — linkify file references in text
  p({ children }) {
    return (
      <p className="leading-relaxed text-zinc-300 text-[12px]">
        {linkifyChildren(children)}
      </p>
    );
  },

  // Headings — linkify file references
  h1({ children }) {
    return <h1 className="text-[14px] font-semibold text-zinc-100 mt-3 mb-1">{linkifyChildren(children)}</h1>;
  },
  h2({ children }) {
    return <h2 className="text-[13px] font-semibold text-zinc-100 mt-3 mb-1">{linkifyChildren(children)}</h2>;
  },
  h3({ children }) {
    return <h3 className="text-[12px] font-semibold text-zinc-200 mt-2 mb-0.5">{linkifyChildren(children)}</h3>;
  },

  // Lists — linkify file references
  ul({ children }) {
    return <ul className="list-disc list-inside text-zinc-300 text-[12px] space-y-0.5 my-1 pl-2">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="list-decimal list-inside text-zinc-300 text-[12px] space-y-0.5 my-1 pl-2">{children}</ol>;
  },
  li({ children }) {
    return <li className="leading-relaxed">{linkifyChildren(children)}</li>;
  },

  // Blockquote
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-violet-500/40 pl-3 my-2 text-zinc-400 italic text-[12px]">
        {children}
      </blockquote>
    );
  },

  // Horizontal rule
  hr() {
    return <hr className="border-white/[0.08] my-3" />;
  },

  // Strong / em
  strong({ children }) {
    return <strong className="font-semibold text-zinc-100">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic text-zinc-400">{children}</em>;
  },

  // Links
  a({ children, href }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
      >
        {children}
      </a>
    );
  },

  // Tables (GFM)
  table({ children }) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="text-[11px] border-collapse w-full">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="border-b border-white/[0.1]">{children}</thead>;
  },
  th({ children }) {
    return <th className="px-2 py-1 text-left text-zinc-300 font-medium">{children}</th>;
  },
  td({ children }) {
    return <td className="px-2 py-1 text-zinc-400 border-t border-white/[0.04]">{children}</td>;
  },
};

// ── Message content renderer ──────────────────────────────────────────────────

const MessageContent = React.memo(function MessageContent({ parts }: { parts: AgentPart[] }) {
  const rendered: React.ReactNode[] = [];
  let i = 0;

  while (i < parts.length) {
    const part = parts[i];

    if (part.type === "text" && part.content) {
      rendered.push(
        <div key={part.id} className="flex flex-col gap-1.5">
          <Markdown
            remarkPlugins={REMARK_PLUGINS}
            components={markdownComponents}
          >
            {part.content}
          </Markdown>
        </div>,
      );
    } else if (part.type === "thinking" && part.content) {
      rendered.push(
        <details key={part.id} className="text-[11px] text-zinc-600 group">
          <summary className="cursor-pointer list-none flex items-center gap-1 hover:text-zinc-500 transition-colors select-none mb-1">
            <span className="text-[9px]">▶</span>
            <span className="group-open:hidden">Thinking…</span>
            <span className="hidden group-open:inline">Thinking</span>
          </summary>
          <p className="italic pl-2 border-l border-white/[0.06] text-zinc-500 text-[11px] leading-relaxed">
            {part.content}
          </p>
        </details>,
      );
    } else if (part.type === "tool-call") {
      // Look ahead for the matching tool-result
      const resultPart = parts[i + 1]?.type === "tool-result" ? parts[i + 1] : undefined;
      rendered.push(
        <ToolCallCard key={part.id} part={part} resultPart={resultPart} />,
      );
      if (resultPart) i++;
    } else if (part.type === "error") {
      rendered.push(
        <div
          key={part.id}
          className="text-[11px] text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2"
        >
          {part.content}
        </div>,
      );
    }

    i++;
  }

  return <div className="flex flex-col gap-2.5">{rendered}</div>;
});

// ── Streaming cursor ──────────────────────────────────────────────────────────

function StreamingCursor() {
  return (
    <span className="inline-block w-0.5 h-3.5 bg-violet-400 animate-pulse ml-0.5 rounded-full align-middle" />
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({
  message,
  isLastMessage,
  isStreaming,
}: {
  message: AgentMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";
  const showCursor = isLastMessage && isStreaming && !isUser;

  // Get plain text for user messages
  const userText = message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.content)
    .join("");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5
          ${
            isUser
              ? "bg-zinc-700/80"
              : "bg-gradient-to-br from-violet-600/30 to-indigo-600/30 border border-violet-500/20"
          }`}
      >
        {isUser ? (
          <User size={12} className="text-zinc-400" />
        ) : (
          <Bot size={12} className="text-violet-400" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isUser ? "flex flex-col items-end" : ""}`}>
        {isUser ? (
          <div className="text-[12px] text-zinc-300 bg-zinc-800/80 border border-white/[0.06] rounded-xl px-3 py-2 max-w-[88%] leading-relaxed whitespace-pre-wrap">
            {userText}
          </div>
        ) : (
          <div className="border-l-2 border-violet-500/20 pl-3">
            <MessageContent parts={message.parts} />
            {showCursor && <StreamingCursor />}
          </div>
        )}
      </div>
    </motion.div>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

export function AgentConversation() {
  const messages = useAgentStore((s) => s.messages);
  const isStreaming = useAgentStore((s) => s.isStreaming);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Force update scroll during streaming
  const lastMsgPartsCount = messages[messages.length - 1]?.parts.length ?? 0;
  
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isStreaming, lastMsgPartsCount]);

  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 500);
    return () => clearInterval(interval);
  }, [isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <div className="flex flex-col gap-2">
          <Bot size={28} className="text-zinc-700 mx-auto" />
          <p className="text-xs text-zinc-600">Start a conversation with the agent</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-5">
        {messages.map((msg, idx) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLastMessage={idx === messages.length - 1}
            isStreaming={isStreaming}
          />
        ))}
      <div ref={bottomRef} />
    </div>
  );
}
