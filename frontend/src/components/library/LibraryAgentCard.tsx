import { Button, Chip, Tooltip } from "../ui";
import type { AgentRole, LibraryAgent } from "../../types";

const ROLE_COLOR: Record<
  AgentRole,
  "warning" | "success" | "primary" | "secondary" | "danger" | "default"
> = {
  orchestrator: "warning",
  planner: "primary",
  coder: "success",
  reviewer: "warning",
  tester: "secondary",
  infra: "danger",
  knowledge: "default",
  custom: "default",
  "document-copilot": "default",
  designer: "default",
};

interface Props {
  agent: LibraryAgent;
  /** Show "Add to Project" button — omit for pages where adding is not applicable */
  onAddToProject?: () => void;
  adding?: boolean;
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onClone?: () => void;
}

export default function LibraryAgentCard({
  agent,
  onAddToProject,
  adding,
  onView,
  onEdit,
  onDelete,
  onClone,
}: Props) {
  const isSystem = agent.agent_type === "system";
  const isBase = agent.is_base;

  return (
    <div className="flex flex-col gap-3 p-4 apple-card transition-shadow">
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
          {isBase && (
            <Chip size="sm" variant="flat" color="warning">
              Base
            </Chip>
          )}
          {isSystem && !isBase && (
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
        {onClone && (
          <Tooltip content="Clone agent">
            <Button
              isIconOnly
              size="sm"
              variant="light"
              aria-label="Clone agent"
              onPress={onClone}
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
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </Button>
          </Tooltip>
        )}
        {onEdit && !isBase && (
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
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
            </Button>
          </Tooltip>
        )}
        {onDelete && !isBase && (
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
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
