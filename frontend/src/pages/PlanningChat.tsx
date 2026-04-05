import { useEffect, useState, useCallback, useMemo } from "react";
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
  getPlans,
  getTasks,
  getRepositories,
  getAgentProfiles,
} from "../lib/api";
import { useProjectWebSocket } from "../lib/ws";
import { formatStatus } from "../lib/statusLabels";
import type { Message, Plan, Task, Repository, AgentProfile, WsEvent, ChatItem, PlanChatItem } from "../types";
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

// Tasks for demo-2 draft plan
const DEMO2_TASKS: Task[] = [
  {
    id: "d2t1",
    plan_id: "plan-draft-2",
    title: "Audit current drop-off funnel",
    description: "Use Mixpanel data to pinpoint exactly where step 3 loses users and identify the top error states.",
    type: "general",
    status: "pending",
    execution_order: 0,
    repository_ids: ["r4"],
    depends_on_task_ids: [],
    created_at: "2026-04-01T09:10:00Z",
    updated_at: "2026-04-01T09:10:00Z",
  },
  {
    id: "d2t2",
    plan_id: "plan-draft-2",
    title: "Redesign step 3 with inline validation",
    description: "Replace blocking error dialogs with inline field-level messages. Add a persistent progress bar.",
    type: "code",
    status: "pending",
    execution_order: 1,
    repository_ids: ["r4"],
    depends_on_task_ids: ["d2t1"],
    created_at: "2026-04-01T09:10:00Z",
    updated_at: "2026-04-01T09:10:00Z",
  },
  {
    id: "d2t3",
    plan_id: "plan-draft-2",
    title: "Add back-navigation with state preservation",
    description: "Implement wizard state persisted in sessionStorage so users can go back without losing data.",
    type: "code",
    status: "pending",
    execution_order: 2,
    repository_ids: ["r4"],
    depends_on_task_ids: ["d2t1"],
    created_at: "2026-04-01T09:10:00Z",
    updated_at: "2026-04-01T09:10:00Z",
  },
  {
    id: "d2t4",
    plan_id: "plan-draft-2",
    title: "Write automated UI tests",
    description: "Playwright tests for the full 5-step flow, including back navigation and validation error paths.",
    type: "test",
    status: "pending",
    execution_order: 3,
    repository_ids: ["r4"],
    depends_on_task_ids: ["d2t2", "d2t3"],
    created_at: "2026-04-01T09:10:00Z",
    updated_at: "2026-04-01T09:10:00Z",
  },
];

const DEMO_CHAT_ITEMS: Record<string, ChatItem[]> = {
  "demo-1": [
    {
      id: "m1",
      project_id: "demo-1",
      role: "assistant",
      content:
        "Hi! I'm your planning agent. I'll help you break this project into an executable plan.\n\nCan you describe the main goals and any technical constraints I should know about?",
      created_at: "2026-03-28T10:01:00Z",
    } as Message,
    {
      id: "m2",
      project_id: "demo-1",
      role: "user",
      content:
        "We need to migrate our monolithic REST API to microservices. The main services are auth, products, orders, and payments. Zero-downtime deployment is a hard requirement.",
      created_at: "2026-03-28T10:02:00Z",
    } as Message,
    {
      id: "m3",
      project_id: "demo-1",
      role: "assistant",
      content:
        "Got it. The strangler-fig pattern is the right call here — we extract one service at a time behind the existing API gateway, reroute traffic incrementally, and decommission the monolith last.\n\nHere's the plan I've drafted. Review each task and confirm when you're ready to start execution.",
      created_at: "2026-03-28T10:03:00Z",
    } as Message,
    // The plan draft card that appeared in chat at the time the plan was created
    {
      type: "plan-draft",
      id: "plan-1",
      plan: {
        id: "plan-1",
        project_id: "demo-1",
        status: "executing",
        created_at: "2026-03-28T10:04:00Z",
        confirmed_at: "2026-03-28T10:15:00Z",
      },
      tasks: [], // populated from DEMO_TASKS below
      version: 1,
    } as PlanChatItem,
  ],
  "demo-2": [
    {
      id: "m4",
      project_id: "demo-2",
      role: "assistant",
      content:
        "Hi! I'm ready to help plan the onboarding flow redesign. What are the key problems with the current experience?",
      created_at: "2026-04-01T09:01:00Z",
    } as Message,
    {
      id: "m5",
      project_id: "demo-2",
      role: "user",
      content:
        "Users are dropping off at step 3 of 5. The error messages are confusing and there's no way to go back without losing progress.",
      created_at: "2026-04-01T09:02:00Z",
    } as Message,
    {
      id: "m6",
      project_id: "demo-2",
      role: "assistant",
      content:
        "Classic drop-off pattern — blocking errors and no escape route. I've drafted a plan to fix the funnel: audit the data first, then redesign step 3 with inline validation, add back-navigation with state preservation, and finish with automated UI tests.",
      created_at: "2026-04-01T09:09:00Z",
    } as Message,
    // Draft plan awaiting confirmation
    {
      type: "plan-draft",
      id: "plan-draft-2",
      plan: {
        id: "plan-draft-2",
        project_id: "demo-2",
        status: "draft",
        created_at: "2026-04-01T09:10:00Z",
      },
      tasks: DEMO2_TASKS,
      version: 1,
    } as PlanChatItem,
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
  "demo-2": [
    {
      id: "r4",
      project_id: "demo-2",
      name: "mobile-app",
      remote_url: "https://github.com/org/mobile-app.git",
      branch: "main",
      auth_type: "token",
      has_credentials: true,
      status: "ready",
      updated_at: "2026-04-01T09:00:00Z",
    },
  ],
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

const DEMO_PLANS: Record<string, Plan[]> = {
  "demo-1": [
    {
      id: "plan-1",
      project_id: "demo-1",
      status: "executing",
      created_at: "2026-03-28T10:04:00Z",
      confirmed_at: "2026-03-28T10:15:00Z",
    },
  ],
  "demo-2": [
    {
      id: "plan-draft-2",
      project_id: "demo-2",
      status: "draft",
      created_at: "2026-04-01T09:10:00Z",
    },
  ],
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

  // Chat items: interleaved messages and inline plan-draft cards
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // Plan management
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planTasks, setPlanTasks] = useState<Record<string, Task[]>>({});
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [currentDraftPlanId, setCurrentDraftPlanId] = useState<string | null>(null);

  // Plan being reviewed in the confirm modal
  const [planBeingReviewed, setPlanBeingReviewed] = useState<{ plan: Plan; tasks: Task[] } | null>(null);

  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [projectName, setProjectName] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("chat");
  const [changesNote, setChangesNote] = useState("");

  const { isOpen: isConfirmOpen, onOpen: onConfirmOpen, onOpenChange: onConfirmOpenChange } = useDisclosure();
  const { isOpen: isChangesOpen, onOpen: onChangesOpen, onOpenChange: onChangesOpenChange } = useDisclosure();

  // Derived values
  const confirmedPlans = plans.filter(
    (p) => p.status === "confirmed" || p.status === "executing" || p.status === "completed"
  );
  const activePlan = plans.find((p) => p.id === activePlanId) ?? null;
  const activeTasks = activePlanId ? (planTasks[activePlanId] ?? []) : [];
  const currentDraft = plans.find((p) => p.id === currentDraftPlanId) ?? null;

  // O(1) task→plan lookup used by task_status WS events
  const taskIdToPlanId = useMemo<Record<string, string>>(() => {
    const index: Record<string, string> = {};
    for (const [planId, tasks] of Object.entries(planTasks)) {
      for (const task of tasks) {
        index[task.id] = planId;
      }
    }
    return index;
  }, [planTasks]);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      getProjects(),
      getMessages(projectId),
      getPlans(projectId),
      getRepositories(projectId),
      getAgentProfiles(),
    ])
      .then(async ([projects, msgs, allPlans, repos, profiles]) => {
        const proj = projects.find((x) => x.id === projectId);
        if (proj) setProjectName(proj.name);
        setRepositories(repos);
        setAgentProfiles(profiles);
        setChatItems(msgs);

        // Load tasks for each plan
        const taskResults = await Promise.all(
          allPlans.map((p) =>
            p.tasks ? Promise.resolve(p.tasks) : getTasks(p.id).catch(() => [] as Task[])
          )
        );
        const allPlanTasks: Record<string, Task[]> = {};
        allPlans.forEach((p, i) => { allPlanTasks[p.id] = taskResults[i]; });

        setPlans(allPlans);
        setPlanTasks(allPlanTasks);

        // Set active plan to latest confirmed/executing
        const confirmed = allPlans.filter(
          (p) => p.status === "confirmed" || p.status === "executing" || p.status === "completed"
        );
        if (confirmed.length > 0) setActivePlanId(confirmed[confirmed.length - 1].id);

        // Track current draft
        const draft = allPlans.find((p) => p.status === "draft");
        if (draft) setCurrentDraftPlanId(draft.id);
      })
      .catch((error: unknown) => {
        // Only fall back to demo data for network/unreachable errors (no response from server).
        // For HTTP errors (401/403/500 etc.) log and show an empty state instead.
        const hasResponse =
          typeof error === "object" &&
          error !== null &&
          "response" in error &&
          (error as { response: unknown }).response != null;

        if (hasResponse) {
          console.error("Failed to load project data from backend", error);
          return;
        }

        // Backend not reachable — load demo data
        setProjectName(DEMO_PROJECT_NAMES[projectId] ?? "Demo Project");
        setRepositories(DEMO_REPOS[projectId] ?? []);

        const demoPlans = DEMO_PLANS[projectId] ?? [];
        const taskMap: Record<string, Task[]> = {};
        demoPlans.forEach((p) => {
          taskMap[p.id] = DEMO_TASKS[projectId] ?? (p.id === "plan-draft-2" ? DEMO2_TASKS : []);
        });

        setPlans(demoPlans);
        setPlanTasks(taskMap);

        // Populate task lists inside plan-draft chat items
        const rawItems = DEMO_CHAT_ITEMS[projectId] ?? [];
        const populatedItems = rawItems.map((item) => {
          if ("type" in item && item.type === "plan-draft") {
            return { ...item, tasks: taskMap[item.id] ?? item.tasks };
          }
          return item;
        });
        setChatItems(populatedItems);

        const confirmed = demoPlans.filter(
          (p) => p.status === "confirmed" || p.status === "executing" || p.status === "completed"
        );
        if (confirmed.length > 0) setActivePlanId(confirmed[confirmed.length - 1].id);

        const draft = demoPlans.find((p) => p.status === "draft");
        if (draft) setCurrentDraftPlanId(draft.id);
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
            setChatItems((m) => [
              ...m,
              {
                id: `stream-${Date.now()}`,
                project_id: projectId ?? "",
                role: "assistant" as const,
                content: prev,
                created_at: new Date().toISOString(),
              },
            ]);
          }
          return "";
        });

        const newPlan = event.plan;
        const fetchedTasks = newPlan.tasks ?? [];

        setPlans((prev) => {
          const existing = prev.find((p) => p.id === newPlan.id);
          return existing ? prev.map((p) => (p.id === newPlan.id ? newPlan : p)) : [...prev, newPlan];
        });

        if (!newPlan.tasks) {
          getTasks(newPlan.id).then((tasks) => {
            setPlanTasks((prev) => ({ ...prev, [newPlan.id]: tasks }));
            setChatItems((prev) => {
              // Update the plan card's tasks if it was already added with empty tasks
              return prev.map((item) =>
                "type" in item && item.type === "plan-draft" && item.id === newPlan.id
                  ? { ...item, tasks }
                  : item
              );
            });
          }).catch(console.error);
        } else {
          setPlanTasks((prev) => ({ ...prev, [newPlan.id]: fetchedTasks }));
        }

        setCurrentDraftPlanId(newPlan.id);

        // Count existing plan-draft items to compute version
        setChatItems((prev) => {
          const existingPlanItems = prev.filter((i) => "type" in i && i.type === "plan-draft");
          const alreadyPresent = existingPlanItems.some((i) => "type" in i && i.id === newPlan.id);
          if (alreadyPresent) return prev;
          const planItem: PlanChatItem = {
            type: "plan-draft",
            id: newPlan.id,
            plan: newPlan,
            tasks: fetchedTasks,
            version: existingPlanItems.length + 1,
          };
          return [...prev, planItem];
        });
      } else if (event.type === "plan_confirmed") {
        // Update plan status in all state locations
        const confirmedPlanId = event.plan_id;
        setPlans((prev) =>
          prev.map((p) => (p.id === confirmedPlanId ? { ...p, status: "confirmed" } : p))
        );
        setChatItems((prev) =>
          prev.map((item) =>
            "type" in item && item.type === "plan-draft" && item.id === confirmedPlanId
              ? { ...item, plan: { ...item.plan, status: "confirmed" as const } }
              : item
          )
        );
        setCurrentDraftPlanId(null);
        setActivePlanId(confirmedPlanId);
        // Don't auto-navigate — user can click "View Execution →"
      } else if (event.type === "task_status") {
        const planId = taskIdToPlanId[event.task_id];
        if (!planId) return;
        setPlanTasks((prev) => ({
          ...prev,
          [planId]: (prev[planId] ?? []).map((t) =>
            t.id === event.task_id
              ? { ...t, status: event.status, assigned_instance_id: event.agent_instance_id }
              : t
          ),
        }));
      }
    },
    [projectId, taskIdToPlanId]
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
    setChatItems((prev) => [...prev, userMsg]);
    sendMessage(content);
  };

  const handlePlanAction = (planId: string, action: "confirm" | "request-changes") => {
    const planItem = chatItems.find(
      (item): item is PlanChatItem => "type" in item && item.type === "plan-draft" && item.id === planId
    );
    if (!planItem) return;
    setPlanBeingReviewed({ plan: planItem.plan, tasks: planItem.tasks });
    if (action === "confirm") onConfirmOpen();
    else onChangesOpen();
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

          {activePlan?.status && (
            <Chip
              size="sm"
              variant="flat"
              color={
                activePlan.status === "confirmed" || activePlan.status === "executing" || activePlan.status === "completed"
                  ? "success"
                  : "warning"
              }
            >
              {formatStatus(activePlan.status)}
            </Chip>
          )}

          <div className="ml-auto flex gap-2">
            {currentDraft && (
              <Button
                size="sm"
                color="success"
                onPress={() => {
                  const item = chatItems.find(
                    (i): i is PlanChatItem => "type" in i && i.type === "plan-draft" && i.id === currentDraft.id
                  );
                  if (item) {
                    setPlanBeingReviewed({ plan: item.plan, tasks: item.tasks });
                    onConfirmOpen();
                  }
                }}
              >
                Review &amp; Confirm Plan
              </Button>
            )}
            {(activePlan?.status === "confirmed" || activePlan?.status === "executing") && (
              <Button
                size="sm"
                color="primary"
                onPress={() => navigate(`/projects/${projectId}/execute`)}
              >
                View Execution →
              </Button>
            )}
          </div>
        </div>

        {/* Tab bar */}
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
                items={chatItems}
                streamingText={streamingText}
                isStreaming={isStreaming}
                agentProfiles={agentProfiles}
                repositories={repositories}
                onPlanAction={handlePlanAction}
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

      {/* ── Right sidebar: confirmed plan(s) ── */}
      <div
        className={`flex flex-col transition-all duration-300 ${
          activePlanId && confirmedPlans.length > 0 ? "w-[400px] shrink-0" : "w-0 overflow-hidden"
        }`}
        aria-label="Execution plan"
      >
        {activePlanId && confirmedPlans.length > 0 && (
          <div className="h-full overflow-hidden flex flex-col">
            <PlanSidebar
              plans={confirmedPlans}
              activePlanId={activePlanId}
              onPlanChange={setActivePlanId}
              tasks={activeTasks}
              agentProfiles={agentProfiles}
              repositories={repositories}
            />
          </div>
        )}
      </div>

      {/* ── Confirm plan modal ── */}
      <Modal isOpen={isConfirmOpen} onOpenChange={onConfirmOpenChange} size="2xl" scrollBehavior="inside">
        <ModalContent>
          {() => (
            <>
              <ModalHeader>Review Execution Plan</ModalHeader>
              <ModalBody className="pb-4">
                {planBeingReviewed && (
                  <PlanConfirmModal
                    plan={planBeingReviewed.plan}
                    tasks={planBeingReviewed.tasks}
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

      {/* ── Request changes modal ── */}
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
