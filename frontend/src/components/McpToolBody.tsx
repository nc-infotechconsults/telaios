import { Chip } from "@heroui/react";
import type { McpToolConfig } from "../types";

type PropDef = { type?: unknown; description?: string };

const ANNOTATION_BADGES: {
  key: keyof NonNullable<McpToolConfig["annotations"]>;
  label: string;
  color: "default" | "primary" | "success" | "warning" | "danger";
}[] = [
  { key: "readOnlyHint", label: "read-only", color: "success" },
  { key: "destructiveHint", label: "destructive", color: "danger" },
  { key: "idempotentHint", label: "idempotent", color: "primary" },
  { key: "openWorldHint", label: "open-world", color: "default" },
];

/**
 * Shared read-only body for an MCP tool card.
 * Renders description, input schema, and annotation badges.
 */
export function McpToolBody({ tool }: { tool: McpToolConfig }) {
  const props =
    tool.inputSchema &&
    typeof tool.inputSchema.properties === "object" &&
    tool.inputSchema.properties !== null
      ? (tool.inputSchema.properties as Record<string, PropDef>)
      : null;

  const required = new Set<string>(
    Array.isArray(tool.inputSchema?.required)
      ? (tool.inputSchema!.required as string[])
      : []
  );

  const entries = props ? Object.entries(props) : [];
  const ann = tool.annotations;
  const activeBadges = ann ? ANNOTATION_BADGES.filter(({ key }) => ann[key]) : [];

  return (
    <div className="space-y-2.5">
      {/* Description */}
      {tool.description && (
        <p className="text-xs text-default-600 leading-relaxed">{tool.description}</p>
      )}

      {/* Input parameters */}
      {entries.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-default-400">
            Input
          </p>
          <div className="rounded-lg border border-divider overflow-hidden divide-y divide-divider">
            {entries.map(([name, def]) => (
              <div key={name} className="px-3 py-2 bg-default-50/40 dark:bg-default-100/20">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-[11px] font-semibold text-default-800 dark:text-default-200">
                    {name}
                  </span>
                  {def.type != null && (
                    <Chip
                      size="sm"
                      variant="flat"
                      color="primary"
                      className="h-4 min-w-0 px-1.5 text-[10px]"
                    >
                      {String(def.type)}
                    </Chip>
                  )}
                  {required.has(name) && (
                    <Chip
                      size="sm"
                      variant="flat"
                      color="warning"
                      className="h-4 min-w-0 px-1.5 text-[10px]"
                    >
                      required
                    </Chip>
                  )}
                </div>
                {def.description && (
                  <p className="text-[11px] text-default-400 leading-snug mt-0.5">
                    {def.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Behavior annotations */}
      {activeBadges.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-default-400">
            Behavior
          </p>
          <div className="flex flex-wrap gap-1">
            {activeBadges.map(({ key, label, color }) => (
              <Chip key={key} size="sm" variant="flat" color={color} className="h-5 text-[10px]">
                {label}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
