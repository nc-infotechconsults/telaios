import { RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

interface Props {
  title: string;
  onRefresh?: () => void;
  onCollapse?: () => void;
  isRefreshing?: boolean;
}

export function PanelHeader({ title, onRefresh, onCollapse, isRefreshing }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-400 bg-white/[0.01] backdrop-blur-md border-b border-white/[0.05] shrink-0 z-10">
      <div className="flex items-center gap-2">
        <span className="drop-shadow-[0_0_8px_rgba(255,255,255,0.1)]">{title}</span>
      </div>
      
      <div className="flex items-center gap-1">
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refresh"
            className={`p-1 hover:text-cyan-400 transition-colors rounded hover:bg-white/[0.04] ${isRefreshing ? "animate-spin text-cyan-500" : ""}`}
          >
            <RefreshCw size={14} strokeWidth={2} />
          </button>
        )}
        
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Collapse"
            className="p-1 hover:text-zinc-200 transition-colors rounded hover:bg-white/[0.04]"
          >
            <ChevronLeft size={14} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}