import { Database } from "lucide-react";

export function DatabasePanel() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-4">
      <div className="w-12 h-12 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-center mb-4">
        <Database size={24} className="text-zinc-500" />
      </div>
      <h3 className="text-zinc-300 font-medium mb-2">Database</h3>
      <p className="text-zinc-500 text-sm max-w-[200px]">
        Connect to databases to explore schemas, run queries, and manage data.
      </p>
      <div className="mt-6 flex flex-wrap gap-2 justify-center">
        {["PostgreSQL", "MySQL", "MongoDB", "Redis", "SQLite"].map((db) => (
          <span
            key={db}
            className="px-2 py-1 text-xs bg-white/[0.02] text-zinc-500 rounded border border-white/5"
          >
            {db}
          </span>
        ))}
      </div>
    </div>
  );
}