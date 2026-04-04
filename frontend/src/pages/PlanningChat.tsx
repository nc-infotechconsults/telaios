import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Button,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textarea,
  useDisclosure,
  Spinner,
} from "@heroui/react";
import {
  getProjects,
  getMessages,
  getPlan,
  getTasks,
  getRepositories,
  getAgentProfiles,
} from "../lib/api";
import { useProjectWebSocket } from "../lib/ws";
import { formatStatus } from "../lib/statusLabels";
import type { Message, Plan, Task, Repository, AgentProfile, WsEvent } from "../types";
import RepositorySetup from "../components/plan/RepositorySetup";
import PlanSidebar from "../components/plan/PlanSidebar";
import ChatWindow from "../components/chat/ChatWindow";
import ChatInput from "../components/chat/ChatInput";
import PlanConfirmModal from "../components/plan/PlanConfirmModal";

type ActiveTab = "chat" | "repos";

// ---------------------------------------------------------------------------
// Demo / fallback data — loaded when the backend is not reachable
// ---------------------------------------------------------------------------
const DEMO_PROJECT_NAMES: Record<string, string> = {
  "demo-1": "E-commerce API Refactor",
  "demo-2": "Mobile App — Onboarding Flow",
  "demo-3": "Data Pipeline Orchestration",
};

const DEMO_MESSAGES: Record<string, Message[]> = {
  "demo-1": [
    {
      id: "m1",
      project_id: "demo-1",
      role: "assistant",
      content:
        "Hi! I'm your planning agent. I'll help you break this project into an executable plan.\n\nCan you describe the main goals and any technical constraints I should know about?",
      created_at: "2026-03-28T10:01:00Z",
    },
    {
      id: "m2",
      project_id: "demo-1",
      role: "user",
      content:
        "We need to migrate our monolithic REST API to microservices. The main services are auth, products, orders, and payments. Zero-downtime deployment is a hard requirement.",
      created_at: "2026-03-28T10:02:00Z",
    },
    {
      id: "m3",
      project_id: "demo-1",
      role: "assistant",
      content:
        "Got it. The strangler-fig pattern is the right call here — we extract one service at a time behind the existing API gateway, reroute traffic incrementally, and decommission the monolith last.\n\nI've drafted an execution plan with 5 tasks covering service extraction, integration tests, and the final traffic cutover. Take a look at the plan panel on the right.",
      created_at: "2026-03-28T10:03:00Z",
    },
  ],
  "demo-2": [
    {
      id: "m4",
      project_id: "demo-2",
      role: "assistant",
      content:
        "Hi! I'm ready to help plan the onboarding flow redesign. What are the key problems with the current experience that we need to solve?",
      created_at: "2026-04-01T09:01:00Z",
    },
    {
      id: "m5",
      project_id: "demo-2",
      role: "user",
      content:
        "Users are dropping off at step 3 of 5. The error messages are confusing and there's no way to go back without losing progress.",
      created_at: "2026-04-01T09:02:00Z",
    },
  ],
};

const DEMO_REPOS: Record<string, Repository[]> = {
  "demo-1": [
    {
      id: "r1",
      project_id: "demo-1",
      name: "api-service",
      remote_url: "https://github.com/org/api-service.git",
      branch: "main",
      auth_type: "token",
      has_credentials: true,
      status: "ready",
      updated_at: "2026-03-28T10:05:00Z",
    },
    {
      id: "r2",
      project_id: "demo-1",
      name: "auth-service",
      remote_url: "https://github.com/org/auth-service.git",
      branch: "main",
      auth_type: "token",
      has_credentials: true,
      status: "ready",
      updated_at: "2026-03-28T10:10:00Z",
    },
  ],
  "demo-2": [],
  "demo-3": [
    {
      id: "r3",
      project_id: "demo-3",
      name: "data-pipeline",
      remote_url: "https://github.com/org/data-pipeline.git",
      branch: "main",
      auth_type: "none",
      has_credentials: false,
      status: "ready",
      updated_at: "2026-03-16T09:00:00Z",
    },
  ],
};

const DEMO_PLANS: Record<string, Plan> = {
  "demo-1": {
    id: "plan-1",
    project_id: "demo-1",
    status: "executing",
    created_at: "2026-03-28T10:04:00Z",
    confirmed_at: "2026-03-28T10:15:00Z",
  },
};

const DEMO_TASKS: Record<string, Task[]> = {
  "demo-1": [
    {
      id: "t1",
      plan_id: "plan-1",
      title: "Extract Auth Service",
      description:
        "Move authentication logic into a standalone service with its own database schema and JWT token management.",
      type: "code",
      status: "done",
      execution_order: 0,
      repository_ids: ["r2"],
      depends_on_task_ids: [],
      created_at: "2026-03-28T10:04:00Z",
      updated_at: "2026-03-28T11:00:00Z",
    },
    {
      id: "t2",
      plan_id: "plan-1",
      title: "Extract Product Catalog Service",
      description:
        "Isolate product listing, search, and inventory into a dedicated service backed by PostgreSQL.",
      type: "code",
      status: "done",
      execution_order: 1,
      repository_ids: ["r1"],
      depends_on_task_ids: [],
      created_at: "2026-03-28T10:04:00Z",
      updated_at: "2026-03-28T13:30:00Z",
    },
    {
      id: "t3",
      plan_id: "plan-1",
      title: "Extract Order Management Service",
      description:
        "Split order creation, status tracking, and fulfillment into its own microservice with an event-driven API.",
      type: "code",
      status: "in_progress",
      execution_order: 2,
      repository_ids: ["r1"],
      depends_on_task_ids: ["t1", "t2"],
      created_at: "2026-03-28T10:04:00Z",
      updated_at: "2026-03-29T08:00:00Z",
    },
    {
      id: "t4",
      plan_id: "plan-1",
      title: "Integration & Regression Tests",
      description:
        "Write end-to-end tests covering the auth → product → order flow using the new service boundaries.",
      type: "test",
      status: "pending",
      execution_order: 3,
      repository_ids: ["r1", "r2"],
      depends_on_task_ids: ["t2", "t3"],
      created_at: "2026-03-28T10:04:00Z",
      updated_at: "2026-03-28T10:04:00Z",
    },
    {
      id: "t5",
      plan_id: "plan-1",
      title: "Traffic Cutover & Decommission Monolith",
      description:
        "Gradually reroute 100% of traffic through the new gateway, monitor error rates, and remove legacy code.",
      type: "general",
      status: "pending",
      execution_order: 4,
      repository_ids: ["r1"],
      depends_on_task_ids: ["t4"],
      created_at: "2026-03-28T10:04:00Z",
      updated_at: "2026-03-28T10:04:00Z",
    },
  ],
};
// ---------------------------------------------------------------------------

export default function PlanningChat() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [projectName, setProjectName] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [changesNote, setChangesNote] = useState("");

  const { isOpen: isConfirmOpen, onOpen: onConfirmOpen, onOpenChange: onConfirmOpenChange } = useDisclosure();
  const { isOpen: isChangesOpen, onOpen: onChangesOpen, onOpenChange: onChangesOpenChange } = useDisclosure();

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      getProjects(),
      getMessages(projectId),
      getPlan(projectId),
      getRepositories(projectId),
      getAgentProfiles(),
    ])
      .then(([projects, msgs, p, repos, profiles]) => {
        const proj = projects.find((x) => x.id === projectId);
        if (proj) setProjectName(proj.name);
        setMessages(msgs);
        setRepositories(repos);
        setAgentProfiles(profiles);
        if (p) {
          setPlan(p);
          if (p.tasks) setTasks(p.tasks);
          else getTasks(p.id).then(setTasks).catch(console.error);
        }
      })
      .catch(() => {
        // Backend not reachable — load demo data so the UI shows a realistic view
        setProjectName(DEMO_PROJECT_NAMES[projectId] ?? "Demo Project");
        setMessages(DEMO_MESSAGES[projectId] ?? []);
        setRepositories(DEMO_REPOS[projectId] ?? []);
        if (DEMO_PLANS[projectId]) {
          setPlan(DEMO_PLANS[projectId]);
          setTasks(DEMO_TASKS[projectId] ?? []);
        }
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleWsEvent = useCallback(
    (event: WsEvent) => {
      if (event.type === "chat_token") {
        setIsStreaming(true);
        setStreamingText((prev) => prev + event.token);
      } else if (event.type === "plan_draft") {
        setIsStreaming(false);
        setStreamingText((prev) => {
          if (prev) {
            setMessages((m) => [
              ...m,
              {
                id: `stream-${Date.now()}`,
                project_id: projectId ?? "",
                role: "assistant",
                content: prev,
                created_at: new Date().toISOString(),
              },
            ]);
          }
          return "";
        });
        setPlan(event.plan);
        if (event.plan.tasks) setTasks(event.plan.tasks);
        else if (event.plan.id) getTasks(event.plan.id).then(setTasks).catch(console.error);
      } else if (event.type === "plan_confirmed") {
        setPlan((p) => (p ? { ...p, status: "confirmed" } : p));
        navigate(`/projects/${projectId}/execute`);
      }
    },
    [projectId, navigate]
  );

  const { sendMessage } = useProjectWebSocket(projectId, handleWsEvent);

  const handleSend = (content: string) => {
    const userMsg: Message = {
      id: `local-${Date.now()}`,
      project_id: projectId ?? "",
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    sendMessage(content);
  };

  const handleConfirmPlan = () => {
    sendMessage("confirm");
    onConfirmOpenChange();
  };

  const handleRequestChanges = () => {
    onConfirmOpenChange();
    onChangesOpen();
  };

  const handleSubmitChanges = () => {
    const feedback = changesNote.trim();
    onChangesOpenChange();
    const message = feedback
      ? `Please revise the plan. Here is my feedback:\n${feedback}`
      : "Please revise the plan based on our conversation.";
    setTimeout(() => handleSend(message), 100);
    setChangesNote("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" label="Loading project…" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main column ── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-divider">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-divider shrink-0">
          <button
            onClick={() => navigate("/")}
            aria-label="Back to projects list"
            className="text-default-400 hover:text-foreground transition-colors text-sm"
          >
            ← Projects
          </button>
          <span className="text-default-300" aria-hidden="true">/</span>
          <h1 className="font-semibold truncate">{projectName || "Loading…"}</h1>

          {plan?.status && (
            <Chip
              size="sm"
              variant="flat"
              color={
                plan.status === "confirmed" || plan.status === "executing" || plan.status === "completed"
                  ? "success"
                  : "warning"
              }
            >
              {formatStatus(plan.status)}
            </Chip>
          )}

          <div className="ml-auto flex gap-2">
            {plan?.status === "draft" && tasks.length > 0 && (
              <Button size="sm" color="success" onPress={onConfirmOpen}>
                Review &amp; Confirm Plan
              </Button>
            )}
            {(plan?.status === "confirmed" || plan?.status === "executing") && (
              <Button size="sm" color="primary" onPress={() => navigate(`/projects/${projectId}/execute`)}>
                View Execution →
              </Button>
            )}
          </div>
        </div>

        {/* Tab bar — accessible tablist */}
        <div role="tablist" aria-label="Project sections" className="flex border-b border-divider shrink-0 px-1">
          {(["chat", "repos"] as ActiveTab[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              aria-controls={`tabpanel-${tab}`}
              id={`tab-${tab}`}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-default-400 hover:text-foreground"
              }`}
            >
              {tab === "chat" ? "Planning Chat" : `Repositories (${repositories.length})`}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          <div
            id="tabpanel-chat"
            role="tabpanel"
            aria-labelledby="tab-chat"
            hidden={activeTab !== "chat"}
            className="flex flex-col h-full"
          >
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ChatWindow
                messages={messages}
                streamingText={streamingText}
                isStreaming={isStreaming}
              />
            </div>
            <div className="border-t border-divider px-5 py-3 shrink-0">
              <ChatInput onSend={handleSend} disabled={isStreaming} />
            </div>
          </div>

          <div
            id="tabpanel-repos"
            role="tabpanel"
            aria-labelledby="tab-repos"
            hidden={activeTab !== "repos"}
            className="h-full overflow-y-auto px-5 py-4"
          >
            <RepositorySetup
              projectId={projectId ?? ""}
              repositories={repositories}
              onChange={setRepositories}
            />
          </div>
        </div>
      </div>

      {/* ── Right sidebar: Plan ── */}
      <div
        className={`flex flex-col transition-all duration-300 ${
          plan ? "w-80 shrink-0" : "w-0 overflow-hidden"
        }`}
        aria-label="Execution plan"
      >
        {plan && (
          <div className="h-full overflow-hidden flex flex-col">
            <PlanSidebar
              plan={plan}
              tasks={tasks}
              agentProfiles={agentProfiles}
              repositories={repositories}
            />
          </div>
        )}
      </div>

      {/* Confirm modal */}
      <Modal isOpen={isConfirmOpen} onOpenChange={onConfirmOpenChange} size="2xl" scrollBehavior="inside">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>Review Execution Plan</ModalHeader>
              <ModalBody className="pb-4">
                {plan && (
                  <PlanConfirmModal
                    plan={plan}
                    tasks={tasks}
                    agentProfiles={agentProfiles}
                    repositories={repositories}
                    onConfirm={handleConfirmPlan}
                    onRequestChanges={handleRequestChanges}
                  />
                )}
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Request changes modal */}
      <Modal isOpen={isChangesOpen} onOpenChange={onChangesOpenChange} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Request Plan Changes</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-500 mb-2">
                  Describe what you'd like changed in the plan. Your feedback will be sent to the planning agent.
                </p>
                <Textarea
                  autoFocus
                  label="Feedback"
                  placeholder="e.g. Split task 3 into two smaller tasks, and add a review step at the end…"
                  value={changesNote}
                  onValueChange={setChangesNote}
                  minRows={3}
                  maxRows={8}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleSubmitChanges}>
                  Send Feedback
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
