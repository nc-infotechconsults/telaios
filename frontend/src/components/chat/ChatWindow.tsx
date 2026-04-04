import { useEffect, useRef } from "react";
import type { Message } from "../../types";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: Message[];
  streamingText?: string;
  isStreaming?: boolean;
  /** When true, the component manages its own scroll container */
  selfScroll?: boolean;
}

export default function ChatWindow({ messages, streamingText, isStreaming, selfScroll }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const isEmpty = messages.length === 0 && !isStreaming && !streamingText;

  const content = (
    <>
      {isEmpty && (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center mt-12">
          <div className="text-4xl" aria-hidden="true">🤖</div>
          <p className="text-default-500 text-sm max-w-xs">
            Hi! I'm your planning agent. Describe what you want to build and I'll help you create an execution plan.
          </p>
        </div>
      )}

      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}

      {streamingText && (
        <div className="flex justify-start mb-3" aria-live="polite" aria-atomic="false">
          <div className="max-w-[80%] flex flex-col gap-1 items-start">
            <span className="text-xs text-default-400 px-1" aria-hidden="true">Planning Agent</span>
            <div className="px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm bg-default-100 whitespace-pre-wrap leading-relaxed">
              {streamingText}
              <span
                className="inline-block w-1.5 h-3.5 ml-0.5 bg-foreground opacity-70 animate-pulse"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </>
  );

  if (selfScroll) {
    return (
      <div
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        className="flex-1 overflow-y-auto px-2 py-3 space-y-1"
      >
        {content}
      </div>
    );
  }

  return (
    <div role="log" aria-label="Chat messages" aria-live="polite" className="space-y-1">
      {content}
    </div>
  );
}
