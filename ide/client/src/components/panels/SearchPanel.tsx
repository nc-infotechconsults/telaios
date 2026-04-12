import { useState, useCallback } from "react";
import { Input } from "@heroui/react";
import { addToast } from "@heroui/toast";
import { api } from "@/lib/api";
import { useEditorStore } from "@/stores/editorStore";
import { motion } from "framer-motion";
import { Search as SearchIcon, FileText, Loader2 } from "lucide-react";

interface SearchResult {
  path: string;
  line: number;
  preview: string;
}

interface Props {
  workspaceId: string;
}

export function SearchPanel({ workspaceId }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const openTab = useEditorStore((s) => s.openTab);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await api.workspaces.search(workspaceId, query);
      setResults(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Search failed";
      addToast({ title: "Search failed", description: msg, color: "danger" });
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, query]);

  function handleResultClick(result: SearchResult) {
    openTab(workspaceId, result.path);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-white/5">
        <Input
          placeholder="Search files..."
          value={query}
          onValueChange={setQuery}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          startContent={
            loading ? (
              <Loader2 size={14} className="animate-spin text-zinc-500" />
            ) : (
              <SearchIcon size={14} className="text-zinc-500" />
            )
          }
          variant="bordered"
          classNames={{
            input: "bg-transparent text-zinc-100 text-sm",
            inputWrapper:
              "bg-white/[0.02] border-white/10 hover:border-white/20 focus-within:!border-violet-500/50 transition-all h-9",
          }}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {results.length === 0 && query && !loading && (
          <p className="text-zinc-500 text-xs text-center py-8">
            No results found
          </p>
        )}

        {results.map((result, idx) => (
          <motion.button
            key={`${result.path}:${result.line}:${idx}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.03 }}
            onClick={() => handleResultClick(result)}
            className="w-full text-left p-2 rounded-lg hover:bg-white/[0.04] group transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <FileText size={14} className="text-violet-400 shrink-0" />
              <span className="text-zinc-200 text-sm font-medium truncate">
                {result.path}
              </span>
              <span className="text-zinc-600 text-xs shrink-0">
                :{result.line}
              </span>
            </div>
            <p className="text-zinc-500 text-xs font-mono truncate pl-6 group-hover:text-zinc-400">
              {result.preview}
            </p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}