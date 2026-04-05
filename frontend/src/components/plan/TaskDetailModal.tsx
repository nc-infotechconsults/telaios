import ReactMarkdown from "react-markdown";
import type { ReactNode } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, Chip, Divider } from "@heroui/react";
import type { Task, AgentProfile, Repository } from "../../types";
import { formatStatus } from "../../lib/statusLabels";

const STATUS_COLOR: Record<Task["status"], "default" | "primary" | "warning" | "success" | "danger"> = {
  pending: "default",
  ready: "primary",
  in_progress: "warning",
  done: "success",
  failed: "danger",
};

const TYPE_COLOR: Record<Task["type"], "default" | "primary" | "secondary" | "warning"> = {
  code: "primary",
  test: "secondary",
  review: "warning",
  general: "default",
};

const DRIVER_COLOR: Record<AgentProfile["agent_type"], "primary" | "secondary" | "success"> = {
  langgraph: "primary",
  opencode: "secondary",
  "github-copilot": "success",
};

interface Props {
  task: Task | null;
  tasks: Task[];
  agentProfiles: AgentProfile[];
  repositories: Repository[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (task: Task) => void;
}

type C = { children?: ReactNode; className?: string; href?: string };

/** Renders task description / result as styled markdown */
function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }: C) => <h1 className="text-base font-bold mt-3 mb-1 text-foreground">{children}</h1>,
        h2: ({ children }: C) => <h2 className="text-sm font-bold mt-2.5 mb-1 text-foreground">{children}</h2>,
        h3: ({ children }: C) => <h3 className="text-sm font-semibold mt-2 mb-0.5 text-foreground">{children}</h3>,
        p: ({ children }: C) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }: C) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }: C) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }: C) => <li className="leading-relaxed">{children}</li>,
        code: ({ children, className }: C) =>
          className ? (
            <code className="block bg-default-100 rounded p-2 text-xs font-mono overflow-x-auto mb-2">
              {children}
            </code>
          ) : (
            <code className="bg-default-100 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
          ),
        pre: ({ children }: C) => <pre className="mb-2">{children}</pre>,
        blockquote: ({ children }: C) => (
          <blockquote className="border-l-2 border-default-300 pl-3 italic text-default-500 mb-2">
            {children}
          </blockquote>
        ),
        strong: ({ children }: C) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }: C) => <em className="italic">{children}</em>,
        hr: () => <hr className="border-divider my-3" />,
        a: ({ children, href }: C) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80">
            {children}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export default function TaskDetailModal({
  task,
  tasks,
  agentProfiles,
  repositories,
  isOpen,
  onOpenChange,
  onNavigate,
}: Props) {
  if (!task) return null;

  const profile = agentProfiles.find((p) => p.id === task.agent_profile_id);
  const repos = (task.repository_ids ?? [])
    .map((rid) => repositories.find((r) => r.id === rid))
    .filter(Boolean) as Repository[];
  const depTasks = (task.depends_on_task_ids ?? [])
    .map((id) => tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[];
  const unlocksTasks = tasks.filter((t) => (t.depends_on_task_ids ?? []).includes(task.id));

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="lg" scrollBehavior="inside">
      <ModalContent>
        {() => (
          <>
            <ModalHeader className="flex items-center gap-3 pb-2">
              <span className="flex-1 text-base font-semibold leading-snug">{task.title}</span>
              <Chip size="sm" color={STATUS_COLOR[task.status]} variant="flat" className="shrink-0">
                {formatStatus(task.status)}
              </Chip>
            </ModalHeader>

            <ModalBody className="pb-6 space-y-4">
              {/* Description — markdown */}
              {task.description && (
                <div className="text-sm text-default-600">
                  <Markdown>{task.description}</Markdown>
                </div>
              )}

              <Divider />

              {/* Meta grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-default-400 mb-1 uppercase tracking-wide">Type</p>
                  <Chip size="sm" color={TYPE_COLOR[task.type]} variant="bordered">{task.type}</Chip>
                </div>
                <div>
                  <p className="text-[11px] text-default-400 mb-1 uppercase tracking-wide">Execution order</p>
                  <span className="text-sm font-mono text-foreground">#{task.execution_order}</span>
                </div>
              </div>

              {/* Agent */}
              {profile && (
                <div>
                  <p className="text-[11px] text-default-400 mb-1.5 uppercase tracking-wide">Agent</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Chip size="sm" color={DRIVER_COLOR[profile.agent_type]} variant="flat">
                      {profile.agent_type}
                    </Chip>
                    <Chip size="sm" variant="bordered">{profile.name}</Chip>
                  </div>
                </div>
              )}

              {/* Repositories */}
              {repos.length > 0 && (
                <div>
                  <p className="text-[11px] text-default-400 mb-1.5 uppercase tracking-wide">Repositories</p>
                  <div className="flex flex-wrap gap-1.5">
                    {repos.map((r) => (
                      <Chip key={r.id} size="sm" variant="bordered" color="primary">📁 {r.name}</Chip>
                    ))}
                  </div>
                </div>
              )}

              {/* Depends on */}
              {depTasks.length > 0 && (
                <div>
                  <p className="text-[11px] text-default-400 mb-1.5 uppercase tracking-wide">Depends on</p>
                  <div className="flex flex-wrap gap-1.5">
                    {depTasks.map((dep) => (
                      <button
                        key={dep.id}
                        type="button"
                        onClick={() => onNavigate?.(dep)}
                        className="text-xs px-2.5 py-1 rounded-full bg-default-100 hover:bg-default-200 text-foreground transition-colors"
                      >
                        ⛓ {dep.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Unlocks */}
              {unlocksTasks.length > 0 && (
                <div>
                  <p className="text-[11px] text-default-400 mb-1.5 uppercase tracking-wide">Unlocks</p>
                  <div className="flex flex-wrap gap-1.5">
                    {unlocksTasks.map((dep) => (
                      <button
                        key={dep.id}
                        type="button"
                        onClick={() => onNavigate?.(dep)}
                        className="text-xs px-2.5 py-1 rounded-full bg-default-100 hover:bg-default-200 text-foreground transition-colors"
                      >
                        ↗ {dep.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Result — markdown */}
              {task.result && (
                <div>
                  <p className="text-[11px] text-default-400 mb-1.5 uppercase tracking-wide">Result</p>
                  <div className="text-sm text-default-600 bg-default-50 rounded-lg p-3">
                    <Markdown>{task.result}</Markdown>
                  </div>
                </div>
              )}

              {/* Instance */}
              {task.assigned_instance_id && (
                <div>
                  <p className="text-[11px] text-default-400 mb-1 uppercase tracking-wide">Agent instance</p>
                  <code className="text-xs bg-default-100 px-2 py-0.5 rounded">
                    {task.assigned_instance_id}
                  </code>
                </div>
              )}
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
