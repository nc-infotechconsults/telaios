import { useState } from "react";
import { Button, Input, Select, SelectItem, Spinner, Textarea } from "@heroui/react";
import { createLibraryMCP, updateLibraryMCP } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { LibraryMCP } from "../../types";

interface Props {
  initialData?: LibraryMCP;
  onSaved: (mcp: LibraryMCP) => void;
  onCancel: () => void;
}

type Transport = "stdio" | "streamable-http";

/** Key-value pair editor for env / header fields */
function KVEditor({
  value,
  onChange,
  placeholder,
}: {
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  placeholder?: string;
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
        <div key={i} className="flex gap-1.5 items-center">
          <Input size="sm" placeholder="KEY" value={k} onValueChange={(nk) => update(i, nk, v)} className="flex-1" />
          <span className="text-default-400 text-xs">=</span>
          <Input size="sm" placeholder={placeholder ?? "value"} value={v} onValueChange={(nv) => update(i, k, nv)} className="flex-1" />
          <Button isIconOnly size="sm" variant="light" color="danger" aria-label="Remove" onPress={() => remove(i)}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </Button>
        </div>
      ))}
      <Button size="sm" variant="flat" onPress={add} className="self-start text-xs">+ Add</Button>
    </div>
  );
}

/**
 * Create / edit form for a LibraryMCP catalog entry.
 * Supports both stdio and streamable-http transports.
 */
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
    <div className="flex flex-col gap-4">
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

      <Select
        label="Transport"
        selectedKeys={new Set([transport])}
        onSelectionChange={(keys) => {
          const t = Array.from(keys)[0] as Transport;
          setTransport(t);
        }}
        isDisabled={saving || isEdit}
        description={isEdit ? "Transport cannot be changed after creation." : undefined}
      >
        <SelectItem key="stdio">stdio (local process)</SelectItem>
        <SelectItem key="streamable-http">streamable-http (remote URL)</SelectItem>
      </Select>

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
          />

          <Input
            label="Args (space-separated)"
            placeholder="e.g. -y @modelcontextprotocol/server-filesystem /tmp"
            value={argsRaw}
            onValueChange={setArgsRaw}
            isDisabled={saving}
            classNames={{ input: "font-mono" }}
          />

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">Env vars</p>
            <KVEditor value={env} onChange={setEnv} />
          </div>
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
          />

          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium text-foreground">Headers</p>
            <KVEditor value={headers} onChange={setHeaders} placeholder="header value" />
          </div>
        </>
      )}

      <div className="flex gap-3">
        <Input
          label="Tags"
          placeholder="Comma-separated, e.g. files, filesystem"
          value={tagsRaw}
          onValueChange={setTagsRaw}
          isDisabled={saving}
          className="flex-1"
        />
        <Input
          label="Version"
          placeholder="1.0.0"
          value={version}
          onValueChange={setVersion}
          isDisabled={saving}
          className="w-32"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
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
