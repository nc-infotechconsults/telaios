import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { Message } from "../../types";

const ROLE_LABEL: Record<Message["role"], string> = {
  user: "You",
  assistant: "Planning Agent",
  system: "System",
};

type El<K extends keyof React.JSX.IntrinsicElements> = React.ComponentPropsWithoutRef<K>;

const MD_COMPONENTS: Components = {
  p: ({ children }: El<"p">) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }: El<"strong">) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }: El<"em">) => <em className="italic">{children}</em>,
  ul: ({ children }: El<"ul">) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }: El<"ol">) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }: El<"li">) => <li className="ml-2">{children}</li>,
  code: ({ children, className }: El<"code">) => {
    const isBlock = Boolean(className?.startsWith("language-"));
    return isBlock ? (
      <code className="block bg-default-200 rounded-lg px-3 py-2 my-2 text-xs font-mono overflow-x-auto whitespace-pre">
        {children}
      </code>
    ) : (
      <code className="bg-default-200 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
    );
  },
  pre: ({ children }: El<"pre">) => <pre className="my-2 overflow-x-auto">{children}</pre>,
  blockquote: ({ children }: El<"blockquote">) => (
    <blockquote className="border-l-4 border-default-300 pl-3 my-2 text-default-500 italic">
      {children}
    </blockquote>
  ),
  h1: ({ children }: El<"h1">) => <h1 className="text-base font-bold mb-1 mt-2">{children}</h1>,
  h2: ({ children }: El<"h2">) => <h2 className="text-sm font-bold mb-1 mt-2">{children}</h2>,
  h3: ({ children }: El<"h3">) => <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>,
  a: ({ href, children }: El<"a">) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  hr: () => <hr className="border-default-300 my-3" />,
};

interface Props {
  message: Message;
  /** When true the content is rendered as plain streaming text (no markdown). */
  isStreaming?: boolean;
}

export default function MessageBubble({ message, isStreaming }: Props) {
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
          aria-label={`${ROLE_LABEL[message.role]}: message`}
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm whitespace-pre-wrap"
              : "bg-default-100 text-foreground rounded-tl-sm"
          }`}
        >
          {isUser || isStreaming ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
              {message.content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
