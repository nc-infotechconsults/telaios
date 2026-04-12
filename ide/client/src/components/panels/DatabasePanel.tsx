import { useState, useEffect } from "react";
import {
  Database, Plus, RefreshCw, ChevronRight, ChevronDown,
  Table2, Eye, Loader2, Pencil, Trash2, Play, X,
  CheckCircle2, AlertCircle, Link2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useDbStore } from "@/stores/dbStore";
import { useEditorStore } from "@/stores/editorStore";
import type { DbConnection, DbTable, DbColumn, DbSchemaGroup, DbDriverType } from "@/types";

// ─── Shared input style ───────────────────────────────────────────────────────

const INPUT =
  "w-full px-2.5 py-1.5 text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

// ─── Column Row ───────────────────────────────────────────────────────────────

function ColumnRow({ col }: { col: DbColumn }) {
  return (
    <div className="flex items-center gap-1 py-0.5 pl-12 pr-2 text-[11px] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.02] rounded">
      {col.isPrimaryKey ? (
        <span className="text-yellow-500/80 font-bold text-[10px] w-[22px]">PK</span>
      ) : col.isForeignKey ? (
        <span className="text-cyan-500/80 font-bold text-[10px] w-[22px]">FK</span>
      ) : (
        <span className="w-[22px]" />
      )}
      <span className="flex-1 truncate">{col.name}</span>
      <span className="text-zinc-600 text-[10px] truncate max-w-[60px]">{col.type}</span>
      {!col.nullable && <span className="text-[9px] text-zinc-700 shrink-0">NN</span>}
    </div>
  );
}

// ─── Table Row ────────────────────────────────────────────────────────────────

function TableRow({ table }: { table: DbTable }) {
  const [open, setOpen] = useState(false);
  const isView = table.type === "view";

  return (
    <div>
      <button
        className="w-full flex items-center gap-1.5 py-0.5 pl-8 pr-2 text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02] rounded group"
        onClick={() => setOpen((o) => !o)}
      >
        {open
          ? <ChevronDown size={10} className="shrink-0 text-zinc-500" />
          : <ChevronRight size={10} className="shrink-0 text-zinc-500" />
        }
        {isView
          ? <Eye size={11} className="shrink-0 text-cyan-600" />
          : <Table2 size={11} className="shrink-0 text-zinc-500 group-hover:text-zinc-400" />
        }
        <span className="flex-1 text-left truncate">{table.name}</span>
        <span className="text-zinc-600 text-[10px] shrink-0">{table.columns.length}</span>
      </button>

      {open && table.columns.map((col) => (
        <ColumnRow key={col.name} col={col} />
      ))}
    </div>
  );
}

// ─── Schema Row ───────────────────────────────────────────────────────────────

function SchemaRow({ schema, connectionId }: { schema: DbSchemaGroup; connectionId: string }) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        className="w-full flex items-center gap-1.5 py-0.5 pl-4 pr-2 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02] rounded"
        onClick={() => setOpen((o) => !o)}
      >
        {open
          ? <ChevronDown size={10} className="shrink-0 text-zinc-500" />
          : <ChevronRight size={10} className="shrink-0 text-zinc-500" />
        }
        <span className="flex-1 text-left truncate">{schema.name}</span>
        <span className="text-zinc-600 text-[10px] shrink-0">{schema.tables.length}</span>
      </button>

      {open && schema.tables.map((table) => (
        <TableRow key={`${table.schema}.${table.name}`} table={table} />
      ))}
    </div>
  );
}

// ─── Connection Modal ─────────────────────────────────────────────────────────

interface ConnectionForm {
  name: string;
  driver: DbDriverType;
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  ssl: boolean;
  filePath: string;
}

const EMPTY_FORM: ConnectionForm = {
  name: "",
  driver: "postgresql",
  host: "localhost",
  port: "5432",
  user: "",
  password: "",
  database: "",
  ssl: false,
  filePath: "",
};

function ConnectionModal({
  initial,
  workspaceId,
  onClose,
}: {
  initial?: DbConnection;
  workspaceId: string;
  onClose: () => void;
}) {
  const addConnection = useDbStore((s) => s.addConnection);
  const updateConnection = useDbStore((s) => s.updateConnection);
  const testConnection = useDbStore((s) => s.testConnection);

  const [form, setForm] = useState<ConnectionForm>(() =>
    initial
      ? {
          name: initial.name,
          driver: initial.driver,
          host: initial.host ?? "localhost",
          port: String(initial.port ?? 5432),
          user: initial.user ?? "",
          password: "",
          database: initial.database ?? "",
          ssl: initial.ssl ?? false,
          filePath: initial.filePath ?? "",
        }
      : { ...EMPTY_FORM },
  );

  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  function field<K extends keyof ConnectionForm>(k: K, v: ConnectionForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setTestResult(null);
  }

  function buildPayload() {
    const base = { name: form.name, driver: form.driver } as Omit<DbConnection, "id"> & { password?: string };
    if (form.driver === "postgresql") {
      return {
        ...base,
        host: form.host,
        port: Number(form.port) || 5432,
        user: form.user,
        password: form.password || undefined,
        database: form.database,
        ssl: form.ssl,
      };
    }
    return { ...base, filePath: form.filePath };
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    const result = await testConnection(workspaceId, buildPayload());
    setTestResult(result);
    setTesting(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (initial) {
        await updateConnection(workspaceId, initial.id, buildPayload());
      } else {
        await addConnection(workspaceId, buildPayload());
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        className="w-[420px] bg-[#18181b] border border-white/[0.08] rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">
            {initial ? "Edit Connection" : "New Connection"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Driver */}
        <Field label="Driver">
          <div className="flex gap-2">
            {(["postgresql", "sqlite"] as DbDriverType[]).map((d) => (
              <button
                key={d}
                onClick={() => field("driver", d)}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-all duration-150 ${
                  form.driver === d
                    ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
                    : "bg-white/[0.02] border-white/[0.08] text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {d === "postgresql" ? "PostgreSQL" : "SQLite"}
              </button>
            ))}
          </div>
        </Field>

        {/* Name */}
        <Field label="Name">
          <input
            className={INPUT}
            value={form.name}
            placeholder="My Database"
            onChange={(e) => field("name", e.target.value)}
          />
        </Field>

        {form.driver === "postgresql" ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Field label="Host">
                  <input
                    className={INPUT}
                    value={form.host}
                    placeholder="localhost"
                    onChange={(e) => field("host", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Port">
                <input
                  className={INPUT}
                  value={form.port}
                  placeholder="5432"
                  onChange={(e) => field("port", e.target.value)}
                />
              </Field>
            </div>
            <Field label="Database">
              <input
                className={INPUT}
                value={form.database}
                placeholder="mydb"
                onChange={(e) => field("database", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="User">
                <input
                  className={INPUT}
                  value={form.user}
                  placeholder="postgres"
                  onChange={(e) => field("user", e.target.value)}
                />
              </Field>
              <Field label="Password">
                <input
                  className={INPUT}
                  type="password"
                  value={form.password}
                  placeholder="••••••••"
                  onChange={(e) => field("password", e.target.value)}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-violet-500"
                checked={form.ssl}
                onChange={(e) => field("ssl", e.target.checked)}
              />
              Use SSL
            </label>
          </>
        ) : (
          <Field label="File Path">
            <input
              className={INPUT}
              value={form.filePath}
              placeholder="/path/to/database.db"
              onChange={(e) => field("filePath", e.target.value)}
            />
          </Field>
        )}

        {/* Test result banner */}
        {testResult && (
          <div
            className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
              testResult.ok
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}
          >
            {testResult.ok
              ? <CheckCircle2 size={13} />
              : <AlertCircle size={13} />
            }
            {testResult.ok ? "Connection successful" : (testResult.error ?? "Connection failed")}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-lg disabled:opacity-50 transition-colors"
          >
            {testing ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
            Test
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.name}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {initial ? "Save" : "Add"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Connection Row ───────────────────────────────────────────────────────────

function ConnectionRow({ conn, workspaceId }: { conn: DbConnection; workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const loadSchema = useDbStore((s) => s.loadSchema);
  const schemaCache = useDbStore((s) => s.schemaCache);
  const schemaLoading = useDbStore((s) => s.schemaLoading);
  const deleteConnection = useDbStore((s) => s.deleteConnection);
  const openQueryConsole = useEditorStore((s) => s.openQueryConsole);

  const schema = schemaCache[conn.id];
  const loading = schemaLoading[conn.id];

  function handleToggle() {
    setOpen((o) => !o);
    if (!open && !schema) {
      loadSchema(workspaceId, conn.id);
    }
  }

  function handleOpenConsole(e: React.MouseEvent) {
    e.stopPropagation();
    openQueryConsole(conn.id, conn.name);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (confirm(`Delete connection "${conn.name}"?`)) {
      deleteConnection(workspaceId, conn.id);
    }
  }

  return (
    <>
      <div
        className="group flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-white/[0.03] cursor-pointer select-none"
        onClick={handleToggle}
      >
        <span className="shrink-0">
          {open
            ? <ChevronDown size={12} className="text-zinc-500" />
            : <ChevronRight size={12} className="text-zinc-500" />
          }
        </span>
        <Database size={13} className="text-violet-400 shrink-0" />
        <span className="flex-1 text-xs text-zinc-300 truncate">{conn.name}</span>
        <span className="text-[10px] text-zinc-600 shrink-0">
          {conn.driver === "postgresql" ? "PG" : "SQLite"}
        </span>

        {/* Hover actions */}
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <button
            onClick={handleOpenConsole}
            className="p-1 text-zinc-500 hover:text-cyan-400 rounded transition-colors"
            title="Open Query Console"
          >
            <Play size={11} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors"
            title="Edit Connection"
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors"
            title="Delete Connection"
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Schema tree */}
      {open && (
        <div className="pb-1">
          {loading && (
            <div className="flex items-center gap-1.5 pl-8 py-1 text-xs text-zinc-500">
              <Loader2 size={11} className="animate-spin" /> Loading schema...
            </div>
          )}
          {schema?.schemas.map((s) => (
            <SchemaRow key={s.name} schema={s} connectionId={conn.id} />
          ))}
          {schema && schema.schemas.length === 0 && (
            <p className="pl-8 py-1 text-xs text-zinc-600">No schemas found</p>
          )}
          {!loading && !schema && (
            <button
              className="pl-8 py-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              onClick={() => loadSchema(workspaceId, conn.id)}
            >
              Load schema
            </button>
          )}
        </div>
      )}

      {/* Edit modal */}
      <AnimatePresence>
        {editing && (
          <ConnectionModal
            initial={conn}
            workspaceId={workspaceId}
            onClose={() => setEditing(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── DatabasePanel ────────────────────────────────────────────────────────────

export function DatabasePanel({ workspaceId }: { workspaceId: string }) {
  const connections = useDbStore((s) => s.connections);
  const loadConnections = useDbStore((s) => s.loadConnections);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadConnections(workspaceId);
  }, [workspaceId, loadConnections]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadConnections(workspaceId);
    setRefreshing(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-white/[0.05] shrink-0">
        <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider flex-1">
          Connections
        </span>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-1 text-zinc-500 hover:text-zinc-300 rounded transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
        </button>
        <button
          onClick={() => setAdding(true)}
          className="p-1 text-zinc-500 hover:text-violet-400 rounded transition-colors"
          title="New Connection"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center px-4">
            <Database size={28} className="text-zinc-700 mb-3" />
            <p className="text-xs text-zinc-500 mb-4">No connections yet.</p>
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600/80 hover:bg-violet-500 text-white rounded-lg transition-colors"
            >
              <Plus size={12} /> Add Connection
            </button>
          </div>
        ) : (
          connections.map((conn) => (
            <ConnectionRow key={conn.id} conn={conn} workspaceId={workspaceId} />
          ))
        )}
      </div>

      {/* Add modal */}
      <AnimatePresence>
        {adding && (
          <ConnectionModal
            workspaceId={workspaceId}
            onClose={() => setAdding(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
