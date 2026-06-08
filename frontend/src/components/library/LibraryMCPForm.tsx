import { useState } from "react";
import { Button, Input, Spinner, Textarea } from "../ui";
import { createLibraryMCP, updateLibraryMCP } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { LibraryMCP } from "../../types";

interface Props {
  initialData?: LibraryMCP;
  onSaved: (mcp: LibraryMCP) => void;
  onCancel: () => void;
}

type Transport = "stdio" | "streamable-http";

// ─── Form section wrapper ────────────────────────────────────────────────────

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {description && (
          <p className="text-[11px] text-default-400 mt-0.5">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

// ─── Transport segmented picker ──────────────────────────────────────────────

function TransportPicker({
  value,
  onChange,
  disabled,
}: {
  value: Transport;
  onChange: (t: Transport) => void;
  disabled?: boolean;
}) {
  const options: { id: Transport; label: string; sub: string; icon: string }[] = [
    { id: "stdio", label: "Local process", sub: "stdio", icon: "fa-terminal" },
    { id: "streamable-http", label: "Remote URL", sub: "streamable-http", icon: "fa-globe" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.id)}
            className={[
              "rounded-xl border px-3 py-2.5 text-left transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              active
                ? "border-primary bg-primary/10 text-foreground"
                : "border-divider bg-default-50/50 hover:border-default-300 hover:bg-default-50",
            ].join(" ")}
            aria-pressed={active}
          >
            <div className="flex items-center gap-2">
              <i
                className={`fa-solid ${opt.icon} text-sm ${active ? "text-primary" : "text-default-400"}`}
                aria-hidden="true"
              />
              <span className="text-sm font-medium">{opt.label}</span>
            </div>
            <p className="text-[11px] text-default-400 mt-0.5 font-mono">{opt.sub}</p>
          </button>
        );
      })}
    </div>
  );
}

// ─── Key-value editor (env vars / headers) ───────────────────────────────────

function KVEditor({
  label,
  description,
  pairs,
  onChange,
  valuePlaceholder,
  disabled,
}: {
  label: string;
  description?: string;
  pairs: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  valuePlaceholder?: string;
  disabled?: boolean;
}) {
  const entries = Object.entries(pairs);

  const update = (index: number, key: string, val: string) => {
    const next = [...entries];
    next[index] = [key, val];
    onChange(Object.fromEntries(next));
  };

  const add = () => onChange({ ...pairs, "": "" });

  const remove = (index: number) => {
    const next = entries.filter((_, i) => i !== index);
    onChange(Object.fromEntries(next));
  };

  return (
    <div className="rounded-xl border border-divider bg-default-50/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{label}</p>
          {description && (
            <p className="text-[11px] text-default-400 mt-0.5">{description}</p>
          )}
        </div>
        <Button
          size="sm"
          variant="flat"
          onPress={add}
          isDisabled={disabled}
          className="h-7 px-2.5 text-[11px] shrink-0"
        >
          <i className="fa-solid fa-plus" aria-hidden="true" /> Add
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-[11px] text-default-400 italic px-1 py-1">
          None — click <b>Add</b> to define one.
        </p>
      ) : (
        <div className="space-y-1.5">
          {entries.map(([k, v], i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_1fr_28px] gap-1.5 items-center">
              <Input
                size="sm"
                placeholder="KEY"
                value={k}
                onValueChange={(nk) => update(i, nk, v)}
                isDisabled={disabled}
                classNames={{ input: "font-mono text-xs" }}
                aria-label="Key"
              />
              <span className="text-default-300 text-xs">=</span>
              <Input
                size="sm"
                placeholder={valuePlaceholder ?? "value"}
                value={v}
                onValueChange={(nv) => update(i, k, nv)}
                isDisabled={disabled}
                classNames={{ input: "font-mono text-xs" }}
                aria-label="Value"
              />
              <Button
                isIconOnly
                size="sm"
                variant="light"
                color="danger"
                aria-label="Remove entry"
                onPress={() => remove(i)}
                isDisabled={disabled}
                className="h-7 w-7 min-w-7"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Form ─────────────────────────────────────────────────────────────────────

export default function LibraryMCPForm({ initialData, onSaved, onCancel }: Props) {
  const isEdit = !!initialData;

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [transport, setTransport] = useState<Transport>(initialData?.transport ?? "stdio");
  // stdio fields
  const [command, setCommand] = useState(initialData?.command ?? "");
  const [argsRaw, setArgsRaw] = useState((initialData?.args ?? []).join(" "));
  const [env, setEnv] = useState<Record<string, string>>(initialData?.env ?? {});
  // http fields
  const [url, setUrl] = useState(initialData?.url ?? "");
  const [headers, setHeaders] = useState<Record<string, string>>(initialData?.headers ?? {});
  // shared
  const [tagsRaw, setTagsRaw] = useState((initialData?.tags ?? []).join(", "));
  const [version, setVersion] = useState(initialData?.version ?? "1.0.0");
  const [saving, setSaving] = useState(false);

  const toSlug = (s: string) =>
    s.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");

  const isStdio = transport === "stdio";
  const canSave = !!name.trim() && (isStdio ? !!command.trim() : !!url.trim());

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

      const base = {
        name: name.trim(),
        ...(!isEdit ? { slug: toSlug(name) } : {}),
        description: description.trim(),
        tags,
        version: version.trim() || "1.0.0",
      };

      const transportFields = isStdio
        ? {
            transport: "stdio" as const,
            command: command.trim(),
            args: argsRaw.split(/\s+/).filter(Boolean),
            env,
          }
        : {
            transport: "streamable-http" as const,
            url: url.trim(),
            headers,
          };

      const payload = { ...base, ...transportFields };

      const saved = isEdit
        ? await updateLibraryMCP(initialData.id, payload)
        : await createLibraryMCP(payload as Parameters<typeof createLibraryMCP>[0]);

      toast.success(isEdit ? "MCP server updated" : "MCP server created", saved.name);
      onSaved(saved);
    } catch {
      toast.error(isEdit ? "Failed to update MCP server" : "Failed to create MCP server");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Identity ──────────────────────────────────────────────────────── */}
      <FormSection
        title="Identity"
        description="How this server appears in the workspace library."
      >
        <Input
          autoFocus
          isRequired
          label="Name"
          placeholder="e.g. Filesystem MCP"
          value={name}
          onValueChange={setName}
          isDisabled={saving}
        />
        <Textarea
          label="Description"
          placeholder="What does this MCP server provide?"
          value={description}
          onValueChange={setDescription}
          isDisabled={saving}
          minRows={2}
        />
      </FormSection>

      {/* ── Connection ────────────────────────────────────────────────────── */}
      <FormSection
        title="Connection"
        description={
          isEdit
            ? "Transport cannot be changed after creation."
            : "How agents will reach this server at runtime."
        }
      >
        <div>
          <p className="text-xs text-default-600 mb-1.5">Transport</p>
          <TransportPicker
            value={transport}
            onChange={setTransport}
            disabled={saving || isEdit}
          />
        </div>

        {isStdio ? (
          <>
            <Input
              isRequired
              label="Command"
              placeholder="e.g. npx"
              value={command}
              onValueChange={setCommand}
              isDisabled={saving}
              classNames={{ input: "font-mono" }}
              description="Executable spawned for this server."
            />
            <Input
              label="Arguments"
              placeholder="-y @modelcontextprotocol/server-filesystem /tmp"
              value={argsRaw}
              onValueChange={setArgsRaw}
              isDisabled={saving}
              classNames={{ input: "font-mono" }}
              description="Space-separated arguments appended to the command."
            />
            <KVEditor
              label="Environment variables"
              description="Passed to the spawned process."
              pairs={env}
              onChange={setEnv}
              disabled={saving}
            />
          </>
        ) : (
          <>
            <Input
              isRequired
              label="URL"
              placeholder="https://my-mcp-server.example.com/mcp"
              value={url}
              onValueChange={setUrl}
              isDisabled={saving}
              classNames={{ input: "font-mono" }}
              description="HTTPS endpoint exposing the MCP streamable-http transport."
            />
            <KVEditor
              label="HTTP headers"
              description="Sent with every request (e.g. Authorization: Bearer …)."
              pairs={headers}
              onChange={setHeaders}
              valuePlaceholder="header value"
              disabled={saving}
            />
          </>
        )}
      </FormSection>

      {/* ── Metadata ──────────────────────────────────────────────────────── */}
      <FormSection
        title="Catalog metadata"
        description="Helps people find and version this entry in the library."
      >
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <Input
            label="Tags"
            placeholder="files, filesystem, local"
            value={tagsRaw}
            onValueChange={setTagsRaw}
            isDisabled={saving}
            description="Comma-separated."
          />
          <Input
            label="Version"
            placeholder="1.0.0"
            value={version}
            onValueChange={setVersion}
            isDisabled={saving}
          />
        </div>
      </FormSection>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="modal-actions" data-align="end">
        <Button variant="light" onPress={onCancel} isDisabled={saving}>
          Cancel
        </Button>
        <Button
          color="primary"
          onPress={handleSave}
          isLoading={saving}
          isDisabled={!canSave}
        >
          {isEdit ? "Save changes" : "Create MCP server"}
        </Button>
      </div>

      {saving && (
        <div className="flex justify-center">
          <Spinner size="sm" />
        </div>
      )}
    </div>
  );
}
