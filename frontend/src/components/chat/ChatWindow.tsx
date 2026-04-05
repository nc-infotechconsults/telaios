import { useEffect, useRef } from "react";
import type { ChatItem, AgentProfile, Repository } from "../../types";
import MessageBubble from "./MessageBubble";
import PlanDraftCard from "../plan/PlanDraftCard";

interface Props {
  items: ChatItem[];
  streamingText?: string;
  isStreaming?: boolean;
  /** When true, the component manages its own scroll container */
  selfScroll?: boolean;
  agentProfiles?: AgentProfile[];
  repositories?: Repository[];
  /** Called when the user clicks Confirm or Request Changes on a plan card. */
  onPlanAction?: (planId: string, action: "confirm" | "request-changes") => void;
}

export default function ChatWindow({
  items,
  streamingText,
  isStreaming,
  selfScroll,
  agentProfiles = [],
  repositories = [],
  onPlanAction,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, streamingText]);

  const isEmpty = items.length === 0 && !isStreaming && !streamingText;

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

      {items.map((item) => {
        if ("type" in item && item.type === "plan-draft") {
          return (
            <div key={item.id} className="mb-4">
              <PlanDraftCard
                plan={item.plan}
                tasks={item.tasks}
                agentProfiles={agentProfiles}
                repositories={repositories}
                version={item.version}
                onConfirm={() => onPlanAction?.(item.id, "confirm")}
                onRequestChanges={() => onPlanAction?.(item.id, "request-changes")}
              />
            </div>
          );
        }
        // Remaining items are Message (discriminated out via the type check above)
        const msg = item as import("../../types").Message;
        return <MessageBubble key={msg.id} message={msg} />;
      })}

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

