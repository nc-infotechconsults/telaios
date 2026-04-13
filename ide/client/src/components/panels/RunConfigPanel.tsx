// ─── Run Configurations Panel ─────────────────────────────────────────────────
//
// Lists, creates, edits, and executes project run configurations (build, test,
// lint, etc.).  Each run creates a terminal session with the command output.
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from "react";
import {
  useRunConfigStore,
  type RunConfig,
} from "@/stores/runConfigStore";
import { useLayoutStore } from "@/stores/layoutStore";
import { api } from "@/lib/api";
import { notify } from "@/stores/notificationStore";
import {
  Play,
  Square,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  workspaceId: string;
}

// ─── Inline Edit Form ─────────────────────────────────────────────────────────

function ConfigForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<RunConfig>;
  onSave: (data: Omit<RunConfig, "id">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [command, setCommand] = useState(initial?.command ?? "");
  const [cwd, setCwd] = useState(initial?.cwd ?? "");

  const handleSubmit = useCallback(() => {
    if (!name.trim() || !command.trim()) return;
    onSave({
      name: name.trim(),
      command: command.trim(),
      cwd: cwd.trim() || undefined,
    });
  }, [name, command, cwd, onSave]);

  return (
    <div className="p-3 space-y-2 bg-white/[0.02] border border-white/[0.06] rounded-lg">
      <input
        type="text"
        placeholder="Name (e.g. Build)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full bg-white/[0.02] border border-white/10 hover:border-white/20 focus:!border-violet-500/50 transition-all rounded-md h-7 px-2 text-xs text-zinc-100 outline-none placeholder-zinc-600"
        autoFocus
      />
      <input
        type="text"
        placeholder="Command (e.g. bun run build)"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        className="w-full bg-white/[0.02] border border-white/10 hover:border-white/20 focus:!border-violet-500/50 transition-all rounded-md h-7 px-2 text-xs text-zinc-100 outline-none placeholder-zinc-600 font-mono"
      />
      <input
        type="text"
        placeholder="Working directory (optional, relative)"
        value={cwd}
        onChange={(e) => setCwd(e.target.value)}
        className="w-full bg-white/[0.02] border border-white/10 hover:border-white/20 focus:!border-violet-500/50 transition-all rounded-md h-7 px-2 text-xs text-zinc-100 outline-none placeholder-zinc-600"
      />
      <div className="flex items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim() || !command.trim()}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors disabled:opacity-30"
        >
          <Check size={12} />
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
        >
          <X size={12} />
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RunConfigPanel({ workspaceId }: Props) {
  const configs = useRunConfigStore((s) => s.configs);
  const runningConfigs = useRunConfigStore((s) => s.runningConfigs);
  const loadConfigs = useRunConfigStore((s) => s.loadConfigs);
  const addConfig = useRunConfigStore((s) => s.addConfig);
  const updateConfig = useRunConfigStore((s) => s.updateConfig);
  const removeConfig = useRunConfigStore((s) => s.removeConfig);
  const runConfig = useRunConfigStore((s) => s.runConfig);
  const storeWorkspaceId = useRunConfigStore((s) => s.workspaceId);

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);

  // Load configs when workspace changes
  useEffect(() => {
    if (workspaceId && workspaceId !== storeWorkspaceId) {
      loadConfigs(workspaceId);
    }
  }, [workspaceId, storeWorkspaceId, loadConfigs]);

  // ── Auto-detect from package.json ──────────────────────────────────────────

  const autoDetect = useCallback(async () => {
    if (!workspaceId) return;
    setDetecting(true);
    try {
      const file = await api.workspaces.readFile(workspaceId, "package.json");
      const pkg = JSON.parse(file.content) as { scripts?: Record<string, string> };
      if (!pkg.scripts) {
        notify({ title: "No scripts found", description: "package.json has no scripts section", type: "info" });
        return;
      }

      const scriptNames = Object.keys(pkg.scripts);
      const priority = ["dev", "build", "test", "lint", "start", "format", "check"];
      const toAdd = priority.filter((s) => scriptNames.includes(s));
      // Also add any remaining scripts not in priority list
      for (const s of scriptNames) {
        if (!toAdd.includes(s)) toAdd.push(s);
      }

      // Only add scripts that don't already exist as configs
      const existingNames = new Set(configs.map((c) => c.name.toLowerCase()));
      let added = 0;
      for (const scriptName of toAdd) {
        if (!existingNames.has(scriptName.toLowerCase())) {
          addConfig({
            name: scriptName.charAt(0).toUpperCase() + scriptName.slice(1),
            command: `bun run ${scriptName}`,
          });
          added++;
        }
      }

      notify({
        title: "Scripts detected",
        description: added > 0
          ? `Added ${added} configuration${added !== 1 ? "s" : ""} from package.json`
          : "All scripts already configured",
        type: "success",
      });
    } catch {
      notify({ title: "Detection failed", description: "Could not read package.json", type: "warning" });
    } finally {
      setDetecting(false);
    }
  }, [workspaceId, configs, addConfig]);

  // ── Run handler ────────────────────────────────────────────────────────────

  const handleRun = useCallback(
    (configId: string) => {
      runConfig(workspaceId, configId);
      // Also open the terminal panel so user sees output
      useLayoutStore.getState().showToolWindow("terminal");
    },
    [workspaceId, runConfig],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-xs text-zinc-400 font-medium">Run Configurations</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={autoDetect}
            disabled={detecting}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors disabled:opacity-30"
            title="Auto-detect from package.json"
          >
            {detecting ? <Loader2 size={11} className="animate-spin" /> : null}
            Detect
          </button>
          <button
            type="button"
            onClick={() => { setShowAdd(true); setEditingId(null); }}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
            title="Add Configuration"
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {/* Add form */}
        {showAdd && (
          <ConfigForm
            onSave={(data) => {
              addConfig(data);
              setShowAdd(false);
            }}
            onCancel={() => setShowAdd(false)}
          />
        )}

        {/* Config list */}
        {configs.length === 0 && !showAdd && (
          <p className="text-zinc-500 text-xs text-center py-8">
            No configurations yet.
            <br />
            Click "+" or "Detect" to add tasks.
          </p>
        )}

        {configs.map((config) => {
          const isRunning = runningConfigs.includes(config.id);
          const isEditing = editingId === config.id;

          if (isEditing) {
            return (
              <ConfigForm
                key={config.id}
                initial={config}
                onSave={(data) => {
                  updateConfig(config.id, data);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            );
          }

          return (
            <div
              key={config.id}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors group"
            >
              {/* Play / Stop button */}
              <button
                type="button"
                onClick={() => handleRun(config.id)}
                className={`shrink-0 p-1 rounded transition-colors ${
                  isRunning
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-emerald-400 hover:bg-emerald-500/10"
                }`}
                title={isRunning ? "Running..." : "Run"}
              >
                {isRunning ? (
                  <Square size={14} className="fill-current" />
                ) : (
                  <Play size={14} className="fill-current" />
                )}
              </button>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-xs text-zinc-200 font-medium truncate">
                  {config.name}
                </div>
                <div className="text-[11px] text-zinc-500 font-mono truncate">
                  {config.command}
                </div>
              </div>

              {/* Running indicator */}
              {isRunning && (
                <Loader2 size={12} className="animate-spin text-emerald-400 shrink-0" />
              )}

              {/* Actions */}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => { setEditingId(config.id); setShowAdd(false); }}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
                  title="Edit"
                >
                  <Pencil size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => removeConfig(config.id)}
                  className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
