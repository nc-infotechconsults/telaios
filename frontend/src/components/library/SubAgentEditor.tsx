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
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
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
