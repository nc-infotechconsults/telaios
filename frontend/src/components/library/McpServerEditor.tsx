import { useEffect, useState } from "react";
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
  Switch,
} from "../ui";
import { discoverMcpTools, listLibraryMCPs } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { LibraryMCP, McpServer, McpToolConfig, McpToolPermission } from "../../types";
import { McpToolBody } from "../McpToolBody";

interface Props {
  value: McpServer[];
  onChange: (entries: McpServer[]) => void;
}

const EMPTY_STDIO: McpServer = {
  name: "",
  transport: "stdio",
  command: "",
  args: [],
  env: {},
};

const EMPTY_HTTP: McpServer = {
  name: "",
  transport: "streamable-http",
  url: "",
  headers: {},
};

const PERMISSION_OPTIONS: { value: McpToolPermission; label: string }[] = [
  { value: "read", label: "read" },
  { value: "write", label: "write" },
  { value: "execute", label: "execute" },
  { value: "require-confirmation", label: "confirm" },
];

/** Reusable trash icon */
function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-4 h-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

/** Expand/collapse chevron */
function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

/** Key-value env editor */
function EnvEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
}) {
  const pairs = Object.entries(value);

  const update = (index: number, key: string, val: string) => {
    const next = [...pairs];
    next[index] = [key, val];
    onChange(Object.fromEntries(next));
  };

  const add = () => onChange({ ...value, "": "" });

  const remove = (index: number) => {
    const next = pairs.filter((_, i) => i !== index);
    onChange(Object.fromEntries(next));
  };

  return (
    <div className="flex flex-col gap-1.5">
      {pairs.map(([k, v], i) => (
        <div key={i} className="flex gap-1 items-center">
          <Input
            size="sm"
            placeholder="KEY"
            value={k}
            onValueChange={(newKey) => update(i, newKey, v)}
            className="flex-1"
          />
          <span className="text-default-400 text-xs">=</span>
          <Input
            size="sm"
            placeholder="value"
            value={v}
            onValueChange={(newVal) => update(i, k, newVal)}
            className="flex-1"
          />
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color="danger"
            aria-label="Remove env var"
            onPress={() => remove(i)}
          >
            <TrashIcon />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="flat" onPress={add} className="self-start text-xs">
        + Add env var
      </Button>
    </div>
  );
}

/** Per-tool config row */
function ToolRow({
  tool,
  onChange,
  onRemove,
}: {
  tool: McpToolConfig;
  onChange: (patch: Partial<McpToolConfig>) => void;
  onRemove: () => void;
}) {
  const togglePermission = (perm: McpToolPermission) => {
    const current = tool.permissions ?? [];
    const next = current.includes(perm)
      ? current.filter((p) => p !== perm)
      : [...current, perm];
    onChange({ permissions: next });
  };

  return (
    <div className="rounded-xl border border-divider bg-background/40 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Switch
          size="sm"
          isSelected={tool.allowed}
          onValueChange={(v) => onChange({ allowed: v })}
          aria-label={`${tool.allowed ? "Allow" : "Deny"} ${tool.name}`}
          color={tool.allowed ? "success" : "danger"}
        />
        <span className="font-mono text-xs font-semibold flex-1 truncate">{tool.name}</span>
        <Chip
          size="sm"
          variant="flat"
          color={tool.allowed ? "success" : "danger"}
          className="shrink-0 h-5 text-[10px]"
        >
          {tool.allowed ? "allowed" : "blocked"}
        </Chip>
        <Button
          isIconOnly
          size="sm"
          variant="light"
          color="danger"
          aria-label="Remove tool"
          onPress={onRemove}
        >
          <TrashIcon />
        </Button>
      </div>

      {/* Body: description + input schema + behavior */}
      <McpToolBody tool={tool} />

      {/* Permissions */}
      <div className="flex flex-wrap gap-1 pt-1 border-t border-divider">
        {PERMISSION_OPTIONS.map(({ value, label }) => {
          const active = (tool.permissions ?? []).includes(value);
          return (
            <Chip
              key={value}
              size="sm"
              variant={active ? "solid" : "bordered"}
              color={active ? "primary" : "default"}
              className="cursor-pointer select-none"
              onClick={() => togglePermission(value)}
            >
              {label}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}

/** Tools panel for a single McpServer entry */
function ToolsPanel({
  entry,
  onUpdate,
}: {
  entry: McpServer;
  onUpdate: (patch: Partial<McpServer>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [newToolName, setNewToolName] = useState("");

  const tools = entry.tools ?? [];

  const setTools = (next: McpToolConfig[]) => onUpdate({ tools: next });

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const discovered = await discoverMcpTools({
        transport: entry.transport,
        url: entry.url,
        headers: entry.headers,
        command: entry.transport === "stdio" ? entry.command : undefined,
        args: entry.transport === "stdio" ? entry.args : undefined,
        env: entry.transport === "stdio" ? entry.env : undefined,
      });
      if (discovered.length === 0) {
        toast.error("No tools returned", "The server returned an empty tools list.");
        return;
      }
      // Merge: preserve existing config for known tools, add new ones
      const existingMap = new Map(tools.map((t) => [t.name, t]));
      const merged: McpToolConfig[] = discovered.map((d) =>
        existingMap.get(d.name) ?? { name: d.name, description: d.description, inputSchema: d.inputSchema, annotations: d.annotations, allowed: true },
      );
      setTools(merged);
      toast.success(`${discovered.length} tools discovered`);
    } catch {
      toast.error("Failed to discover tools");
    } finally {
      setDiscovering(false);
    }
  };

  const addManual = () => {
    const trimmed = newToolName.trim();
    if (!trimmed || tools.some((t) => t.name === trimmed)) return;
    setTools([...tools, { name: trimmed, allowed: true }]);
    setNewToolName("");
  };

  const updateTool = (index: number, patch: Partial<McpToolConfig>) => {
    setTools(tools.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  };

  const removeTool = (index: number) => {
    setTools(tools.filter((_, i) => i !== index));
  };

  const toolCount = tools.length;
  const blockedCount = tools.filter((t) => !t.allowed).length;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="flex items-center gap-1.5 text-xs text-default-500 hover:text-default-700 transition-colors self-start"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronIcon open={open} />
        <span>
          Tools
          {toolCount > 0 && (
            <span className="ml-1 text-default-400">
              ({toolCount - blockedCount} allowed{blockedCount > 0 ? `, ${blockedCount} blocked` : ""})
            </span>
          )}
          {toolCount === 0 && <span className="ml-1 text-default-400">(all)</span>}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 mt-1 pl-2 border-l-2 border-divider">
          {tools.map((tool, i) => (
            <ToolRow
              key={i}
              tool={tool}
              onChange={(patch) => updateTool(i, patch)}
              onRemove={() => removeTool(i)}
            />
          ))}

          <div className="flex gap-2 flex-wrap">
            {(entry.transport === "streamable-http" || entry.transport === "stdio") && (
              <Button
                size="sm"
                variant="flat"
                onPress={handleDiscover}
                isLoading={discovering}
                isDisabled={entry.transport === "streamable-http" ? !entry.url : !entry.command}
              >
                {discovering ? "Discovering…" : "Fetch tools"}
              </Button>
            )}
            {toolCount > 0 && (
              <Button size="sm" variant="light" color="danger" onPress={() => setTools([])}>
                Clear all
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Input
              size="sm"
              placeholder="Tool name (e.g. read_file)"
              value={newToolName}
              onValueChange={setNewToolName}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }}
              aria-label="Add tool name manually"
              className="flex-1"
            />
            <Button
              size="sm"
              variant="flat"
              onPress={addManual}
              isDisabled={!newToolName.trim()}
              className="shrink-0"
            >
              + Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Library-picker modal */
function LibraryPickerModal({
  isOpen,
  onClose,
  onPick,
}: {
  isOpen: boolean;
  onClose: () => void;
  onPick: (mcp: LibraryMCP) => void;
}) {
  const [items, setItems] = useState<LibraryMCP[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [q, setQ] = useState("");

  const load = () => {
    if (fetched) return;
    setLoading(true);
    listLibraryMCPs()
      .then((data) => {
        setItems(data);
        setFetched(true);
      })
      .catch(() => toast.error("Failed to load library MCPs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const filtered = items.filter(
    (m) =>
      !q ||
      m.name.toLowerCase().includes(q.toLowerCase()) ||
      m.description.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      size="lg"
      scrollBehavior="inside"
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader>Pick from Library</ModalHeader>
            <ModalBody className="pb-6 flex flex-col gap-3">
              <Input
                placeholder="Search…"
                value={q}
                onValueChange={setQ}
                isClearable
                onClear={() => setQ("")}
                autoFocus
              />
              {loading ? (
                <div className="flex justify-center py-8">
                  <Spinner />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-default-400 text-center py-8">
                  {fetched ? "No MCP servers found." : "Loading…"}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {filtered.map((mcp) => (
                    <button
                      key={mcp.id}
                      onClick={() => {
                        onPick(mcp);
                        onClose();
                      }}
                      className="flex flex-col gap-0.5 p-3 rounded-lg border border-divider hover:bg-default-100 text-left transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{mcp.name}</span>
                        <Chip size="sm" variant="flat" className="font-mono text-xs">
                          {mcp.transport === "stdio" ? (mcp.command ?? "stdio") : mcp.url ?? "http"}
                        </Chip>
                        <Chip size="sm" variant="bordered" className="text-xs">
                          {mcp.transport}
                        </Chip>
                      </div>
                      {mcp.description && (
                        <p className="text-xs text-default-500">{mcp.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

/**
 * Inline editor for an array of McpServer entries.
 * Supports both stdio and streamable-http transports.
 * Includes tool-level access control (allow/deny + permission tags).
 * Includes "Add from Library" picker that respects the library item's transport.
 */
export default function McpServerEditor({ value, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const update = (index: number, patch: Partial<McpServer>) =>
    onChange(value.map((e, i) => (i === index ? { ...e, ...patch } : e)));

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  const addCustomStdio = () => onChange([...value, { ...EMPTY_STDIO }]);
  const addCustomHttp = () => onChange([...value, { ...EMPTY_HTTP }]);

  const addFromLibrary = (mcp: LibraryMCP) => {
    const base = { name: mcp.name, tools: [] as McpToolConfig[] };
    const entry: McpServer =
      mcp.transport === "streamable-http"
        ? {
            ...base,
            transport: "streamable-http",
            url: mcp.url ?? "",
            headers: { ...mcp.headers },
          }
        : {
            ...base,
            transport: "stdio",
            command: mcp.command ?? "",
            args: [...mcp.args],
            env: { ...mcp.env },
          };
    onChange([...value, entry]);
  };

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 && (
        <p className="text-xs text-default-400 italic">No MCP servers configured.</p>
      )}

      {value.map((entry, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 p-3 rounded-lg border border-divider bg-default-50"
        >
          {/* Header row */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-default-500">
              MCP #{i + 1}
              <span className="ml-1.5 font-normal text-default-400">({entry.transport})</span>
            </span>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              color="danger"
              aria-label={`Remove MCP server ${i + 1}`}
              onPress={() => remove(i)}
            >
              <TrashIcon />
            </Button>
          </div>

          {/* Name + transport */}
          <div className="flex gap-2">
            <Input
              size="sm"
              label="Name"
              placeholder="e.g. filesystem"
              value={entry.name}
              onValueChange={(v) => update(i, { name: v })}
              className="flex-1"
            />
            <Select
              size="sm"
              label="Transport"
              selectedKeys={Array.from(new Set([entry.transport]))}
              onSelectionChange={(keys) => {
                const t = Array.from(keys)[0] as McpServer["transport"];
                if (t === "stdio") {
                  update(i, { transport: "stdio", command: entry.command ?? "", args: entry.args ?? [], env: entry.env ?? {}, url: undefined, headers: undefined });
                } else {
                  update(i, { transport: "streamable-http", url: entry.url ?? "", headers: entry.headers ?? {}, command: undefined, args: undefined, env: undefined });
                }
              }}
              className="w-44"
            >
              <SelectItem key="stdio">stdio</SelectItem>
              <SelectItem key="streamable-http">streamable-http</SelectItem>
            </Select>
          </div>

          {/* Transport-specific fields */}
          {entry.transport === "stdio" && (
            <>
              <Input
                size="sm"
                label="Command"
                placeholder="e.g. npx"
                value={entry.command ?? ""}
                onValueChange={(v) => update(i, { command: v })}
              />
              <Input
                size="sm"
                label="Args (space-separated)"
                placeholder="e.g. -y @modelcontextprotocol/server-filesystem /tmp"
                value={(entry.args ?? []).join(" ")}
                onValueChange={(v) =>
                  update(i, { args: v.split(/\s+/).filter(Boolean) })
                }
              />
              <div className="flex flex-col gap-1">
                <p className="text-xs text-default-500">Env vars</p>
                <EnvEditor
                  value={entry.env ?? {}}
                  onChange={(env) => update(i, { env })}
                />
              </div>
            </>
          )}

          {entry.transport === "streamable-http" && (
            <>
              <Input
                size="sm"
                label="URL"
                placeholder="https://…/mcp"
                value={entry.url ?? ""}
                onValueChange={(v) => update(i, { url: v })}
              />
              <div className="flex flex-col gap-1">
                <p className="text-xs text-default-500">Headers</p>
                <EnvEditor
                  value={entry.headers ?? {}}
                  onChange={(headers) => update(i, { headers })}
                />
              </div>
            </>
          )}

          {/* Tool access control */}
          <ToolsPanel entry={entry} onUpdate={(patch) => update(i, patch)} />
        </div>
      ))}

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="flat" onPress={() => setPickerOpen(true)}>
          + From Library
        </Button>
        <Button size="sm" variant="flat" onPress={addCustomStdio}>
          + Custom stdio
        </Button>
        <Button size="sm" variant="flat" onPress={addCustomHttp}>
          + Custom HTTP
        </Button>
      </div>

      <LibraryPickerModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addFromLibrary}
      />
    </div>
  );
}
