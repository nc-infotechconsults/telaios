import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import type { ReactNode } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter,
  Chip, Divider, Button, Spinner,
} from "@heroui/react";
import type { Task, AgentProfile, Repository, TaskArtifact, ArtifactType } from "../../types";
import { formatStatus } from "../../lib/statusLabels";
import { getTaskArtifacts } from "../../lib/api";
import DiffViewer from "./DiffViewer";
import TestResultViewer from "./TestResultViewer";
import ReviewViewer from "./ReviewViewer";

const STATUS_COLOR: Record<Task["status"], "default" | "primary" | "warning" | "success" | "danger"> = {
  pending: "default",
  ready: "primary",
  in_progress: "warning",
  done: "success",
  failed: "danger",
  cancelled: "default",
  skipped: "default",
};

const TYPE_COLOR: Record<Task["type"], "default" | "primary" | "secondary" | "warning"> = {
  code: "primary",
  test: "secondary",
  review: "warning",
  general: "default",
  knowledge: "secondary",
  infra: "warning",
};

const DRIVER_COLOR: Record<AgentProfile["agent_type"], "primary" | "secondary" | "success"> = {
  langgraph: "primary",
  opencode: "secondary",
  "github-copilot": "success",
};

const ARTIFACT_ICON: Record<ArtifactType, string> = {
  diff: "±",
  test_result: "✓",
  review: "◎",
  log: "≡",
  file: "□",
  link: "↗",
};

interface Props {
  task: Task | null;
  tasks: Task[];
  agentProfiles: AgentProfile[];
  repositories: Repository[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (task: Task) => void;
  onRetry?: (task: Task) => void;
  onCancel?: (task: Task) => void;
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

function formatDuration(startedAt?: string | null, completedAt?: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTimestamp(iso?: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Renders a single artifact by type */
function ArtifactCard({ artifact }: { artifact: TaskArtifact }) {
  const [expanded, setExpanded] = useState(false);

  if (artifact.type === "diff") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-default-400 uppercase tracking-wide flex items-center gap-1.5">
          <span>{ARTIFACT_ICON.diff}</span> {artifact.title}
        </p>
        <DiffViewer content={artifact.content} />
      </div>
    );
  }

  if (artifact.type === "test_result") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-default-400 uppercase tracking-wide flex items-center gap-1.5">
          <span>{ARTIFACT_ICON.test_result}</span> {artifact.title}
        </p>
        <TestResultViewer content={artifact.content} />
      </div>
    );
  }

  if (artifact.type === "review") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-default-400 uppercase tracking-wide flex items-center gap-1.5">
          <span>{ARTIFACT_ICON.review}</span> {artifact.title}
        </p>
        <ReviewViewer content={artifact.content} />
      </div>
    );
  }

  if (artifact.type === "log") {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[11px] text-default-400 uppercase tracking-wide flex items-center gap-1.5 hover:text-default-600 transition-colors w-fit"
        >
          <span>{ARTIFACT_ICON.log}</span>
          <span>{artifact.title}</span>
          <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${expanded ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        {expanded && (
          <pre className="text-xs text-default-500 bg-default-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-64 font-mono">
            {artifact.content || "(empty)"}
          </pre>
        )}
      </div>
    );
  }

  if (artifact.type === "link") {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-default-400">{ARTIFACT_ICON.link}</span>
        <a
          href={artifact.content}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary underline hover:opacity-80 truncate"
        >
          {artifact.title || artifact.content}
        </a>
      </div>
    );
  }

  // file / fallback
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-default-400 uppercase tracking-wide flex items-center gap-1.5">
        <span>{ARTIFACT_ICON[artifact.type] ?? "□"}</span> {artifact.title}
      </p>
      <pre className="text-xs text-default-500 bg-default-50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-48">
        {artifact.content}
      </pre>
    </div>
  );
}

const TERMINAL = new Set<Task["status"]>(["done", "failed", "cancelled", "skipped"]);

export default function TaskDetailModal({
  task,
  tasks,
  agentProfiles,
  repositories,
  isOpen,
  onOpenChange,
  onNavigate,
  onRetry,
  onCancel,
}: Props) {
  const [artifacts, setArtifacts] = useState<TaskArtifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);

  // Fetch artifacts whenever the modal opens for a terminal task
  useEffect(() => {
    if (!isOpen || !task || !TERMINAL.has(task.status)) {
      setArtifacts([]);
      return;
    }
    setArtifactsLoading(true);
    getTaskArtifacts(task.id)
      .then(setArtifacts)
      .catch(() => setArtifacts([]))
      .finally(() => setArtifactsLoading(false));
  }, [isOpen, task?.id, task?.status]);

  if (!task) return null;

  const profile = agentProfiles.find((p) => p.id === task.agent_profile_id);
  const repos = (task.repository_ids ?? [])
    .map((rid) => repositories.find((r) => r.id === rid))
    .filter(Boolean) as Repository[];
  const depTasks = (task.depends_on_task_ids ?? [])
    .map((id) => tasks.find((t) => t.id === id))
    .filter(Boolean) as Task[];
  const unlocksTasks = tasks.filter((t) => (t.depends_on_task_ids ?? []).includes(task.id));

  const duration = formatDuration(task.started_at, task.completed_at);
  const startedTime = formatTimestamp(task.started_at);
  const completedTime = formatTimestamp(task.completed_at);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl" scrollBehavior="inside">
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

              {/* Timing */}
              {(duration ?? startedTime) && (
                <div>
                  <p className="text-[11px] text-default-400 mb-1.5 uppercase tracking-wide">Timing</p>
                  <div className="flex flex-wrap gap-4 text-xs text-default-600">
                    {startedTime && (
                      <span>Started: <span className="font-mono text-foreground">{startedTime}</span></span>
                    )}
                    {completedTime && (
                      <span>Completed: <span className="font-mono text-foreground">{completedTime}</span></span>
                    )}
                    {duration && (
                      <span>
                        Duration:{" "}
                        <Chip size="sm" variant="flat" color="default" className="font-mono">
                          {duration}
                        </Chip>
                      </span>
                    )}
                  </div>
                </div>
              )}

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

              {/* Artifacts */}
              {TERMINAL.has(task.status) && (
                <>
                  <Divider />
                  <div>
                    <p className="text-[11px] text-default-400 mb-3 uppercase tracking-wide">
                      Artifacts
                      {artifacts.length > 0 && (
                        <span className="ml-1.5 text-default-300">({artifacts.length})</span>
                      )}
                    </p>

                    {artifactsLoading ? (
                      <div className="flex items-center gap-2 py-2">
                        <Spinner size="sm" />
                        <span className="text-xs text-default-400">Loading artifacts…</span>
                      </div>
                    ) : artifacts.length > 0 ? (
                      <div className="flex flex-col gap-4">
                        {artifacts
                          .sort((a, b) => a.sort_order - b.sort_order)
                          .map((artifact) => (
                            <ArtifactCard key={artifact.id} artifact={artifact} />
                          ))}
                      </div>
                    ) : (
                      <p className="text-xs text-default-400 italic">No artifacts recorded for this task.</p>
                    )}
                  </div>
                </>
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

            {/* Actions */}
            {(onRetry || onCancel) && (task.status === "failed" || task.status === "pending" || task.status === "ready") && (
              <ModalFooter className="pt-0 gap-2">
                {onRetry && task.status === "failed" && (
                  <Button size="sm" color="primary" variant="flat" onPress={() => onRetry(task)}>
                    Retry
                  </Button>
                )}
                {onCancel && (task.status === "pending" || task.status === "ready") && (
                  <Button size="sm" color="danger" variant="flat" onPress={() => onCancel(task)}>
                    Cancel task
                  </Button>
                )}
              </ModalFooter>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
