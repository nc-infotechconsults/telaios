import type { Message } from "../../types";

const ROLE_LABEL: Record<Message["role"], string> = {
  user: "You",
  assistant: "Planning Agent",
  system: "System",
};

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center my-1">
        <span className="text-xs text-default-400 italic px-3 py-1 bg-default-50 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <span className="text-xs text-default-400 px-1" aria-hidden="true">{ROLE_LABEL[message.role]}</span>
        <div
          role="article"
          aria-label={`${ROLE_LABEL[message.role]}: ${message.content}`}
          className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm"
              : "bg-default-100 text-foreground rounded-tl-sm"
          }`}
        >
          {message.content}
        </div>
      </div>
    </div>
  );
}
