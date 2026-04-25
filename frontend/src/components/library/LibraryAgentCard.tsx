import { Button, Chip, Tooltip } from "@heroui/react";
import type { AgentRole, LibraryAgent } from "../../types";

const ROLE_COLOR: Record<
  AgentRole,
  "warning" | "success" | "primary" | "secondary" | "danger" | "default"
> = {
  planner: "primary",
  coder: "success",
  reviewer: "warning",
  tester: "secondary",
  infra: "danger",
  knowledge: "default",
  custom: "default",
  "document-copilot": "default",
};

interface Props {
  agent: LibraryAgent;
  /** Show "Add to Project" button — omit for pages where adding is not applicable */
  onAddToProject?: () => void;
  adding?: boolean;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export default function LibraryAgentCard({
  agent,
  onAddToProject,
  adding,
  onView,
  onEdit,
  onDelete,
}: Props) {
  const isSystem = agent.agent_type === "system";

  return (
    <div className="flex flex-col gap-3 p-4 clay-card transition-shadow">
      {/* Header row */}
      <div className="flex items-start gap-2 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate text-sm">{agent.name}</p>
          {agent.published_by && (
            <p className="text-xs text-default-400 truncate">by {agent.published_by}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Chip size="sm" variant="flat" color={ROLE_COLOR[agent.role] ?? "default"}>
            {agent.role}
          </Chip>
          {isSystem && (
            <Chip size="sm" variant="flat" color="primary">
              system
            </Chip>
          )}
        </div>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-xs text-default-500 line-clamp-2">{agent.description}</p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 text-xs text-default-400">
        {agent.sub_agents.length > 0 && (
          <span>{agent.sub_agents.length} sub-agent{agent.sub_agents.length !== 1 ? "s" : ""}</span>
        )}
        {agent.mcp_servers.length > 0 && (
          <span>{agent.mcp_servers.length} MCP{agent.mcp_servers.length !== 1 ? "s" : ""}</span>
        )}
        {agent.skills.length > 0 && (
          <span>{agent.skills.length} skill{agent.skills.length !== 1 ? "s" : ""}</span>
        )}
        <span className="ml-auto">{agent.usage_count} use{agent.usage_count !== 1 ? "s" : ""}</span>
      </div>

      {/* Tags */}
      {agent.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.tags.slice(0, 5).map((tag) => (
            <Chip key={tag} size="sm" variant="flat" className="text-xs">
              {tag}
            </Chip>
          ))}
          {agent.tags.length > 5 && (
            <Chip size="sm" variant="flat" className="text-xs text-default-400">
              +{agent.tags.length - 5}
            </Chip>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center gap-1.5 pt-1 border-t border-divider">
        {onView && (
          <Button size="sm" variant="light" onPress={onView}>
            View
          </Button>
        )}
        {onEdit && (
          <Tooltip content="Edit agent">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="Edit agent"
              onPress={onEdit}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-4 h-4"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
              </svg>
            </Button>
          </Tooltip>
        )}
        {onDelete && !isSystem && (
          <Tooltip content="Delete agent" color="danger">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              color="danger"
              aria-label="Delete agent"
              onPress={onDelete}
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
          </Tooltip>
        )}
        {onAddToProject && (
          <Button
            size="sm"
            color="primary"
            className="ml-auto"
            isLoading={adding}
            onPress={onAddToProject}
          >
            Add to Project
          </Button>
        )}
      </div>
    </div>
  );
}
