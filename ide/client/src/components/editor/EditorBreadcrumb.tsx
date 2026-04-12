import { ChevronRight } from "lucide-react";

interface Props {
  path: string;
}

export function EditorBreadcrumb({ path }: Props) {
  const parts = path.split("/").filter(Boolean);

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-500 bg-white/[0.01] backdrop-blur-md border-b border-white/[0.05] overflow-x-auto whitespace-nowrap shrink-0 z-10 shadow-sm">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1.5 group">
          {i > 0 && <ChevronRight size={14} strokeWidth={1.5} className="text-zinc-600 group-hover:text-cyan-500/50 transition-colors" />}
          <span
            className={
              i === parts.length - 1 ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] tracking-wide" : "text-zinc-400 hover:text-zinc-300 transition-colors cursor-default"
            }
          >
            {part}
          </span>
        </span>
      ))}
    </div>
  );
}