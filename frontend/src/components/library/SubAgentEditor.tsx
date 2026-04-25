import { Button, Input } from "@heroui/react";
import type { SubAgentEntry } from "../../types";

interface Props {
  value: SubAgentEntry[];
  onChange: (entries: SubAgentEntry[]) => void;
}

const EMPTY: SubAgentEntry = { agent_id: "", tool_name: "", tool_description: "" };

/**
 * Inline editor for an array of sub-agent entries.
 * Each entry has agent_id, tool_name, and tool_description.
 */
export default function SubAgentEditor({ value, onChange }: Props) {
  const update = (index: number, patch: Partial<SubAgentEntry>) => {
    onChange(value.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };

  const add = () => onChange([...value, { ...EMPTY }]);

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 && (
        <p className="text-xs text-default-400 italic">No sub-agents configured.</p>
      )}

      {value.map((entry, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 p-3 rounded-lg border border-divider bg-default-50"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-default-500">Sub-agent #{i + 1}</span>
            <Button
              isIconOnly
              size="sm"
              variant="light"
              color="danger"
              aria-label={`Remove sub-agent ${i + 1}`}
              onPress={() => remove(i)}
            >
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
            </Button>
          </div>

          <Input
            size="sm"
            label="Agent ID"
            placeholder="UUID of the project agent"
            value={entry.agent_id}
            onValueChange={(v) => update(i, { agent_id: v })}
          />
          <Input
            size="sm"
            label="Tool name"
            placeholder="e.g. run_code_agent"
            value={entry.tool_name}
            onValueChange={(v) => update(i, { tool_name: v })}
          />
          <Input
            size="sm"
            label="Tool description"
            placeholder="What this sub-agent does…"
            value={entry.tool_description}
            onValueChange={(v) => update(i, { tool_description: v })}
          />
        </div>
      ))}

      <Button size="sm" variant="flat" onPress={add}>
        + Add Sub-Agent
      </Button>
    </div>
  );
}
