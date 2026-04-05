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
import PlanListTab from "../components/plan/PlanListTab";
import ChatWindow from "../components/chat/ChatWindow";
import ChatInput from "../components/chat/ChatInput";
import PlanConfirmModal from "../components/plan/PlanConfirmModal";

type ActiveTab = "chat" | "plans" | "repos";

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

        // Reconstruct inline PlanChatItems for any draft plans so they appear in the
        // chat stream after a page reload (or when loaded from demo data).
        const draftPlans = allPlans.filter((p) => p.status === "draft");
        const draftPlanItems: PlanChatItem[] = draftPlans.map((p, i) => ({
          type: "plan-draft" as const,
          id: p.id,
          plan: p,
          tasks: allPlanTasks[p.id] ?? [],
          version: i + 1,
        }));
        setChatItems([...msgs, ...draftPlanItems]);

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
        console.error("Failed to load project data", error);
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
          {(["chat", "plans", "repos"] as ActiveTab[]).map((tab) => (
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
              {tab === "chat"
                ? "Planning Chat"
                : tab === "plans"
                ? `Plans (${plans.length})`
                : `Repositories (${repositories.length})`}
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
            id="tabpanel-plans"
            role="tabpanel"
            aria-labelledby="tab-plans"
            hidden={activeTab !== "plans"}
            className="h-full overflow-y-auto px-5 py-5"
          >
            <PlanListTab
              plans={plans}
              planTasks={planTasks}
              activePlanId={activePlanId}
              onActivate={(planId) => {
                setActivePlanId(planId);
                setActiveTab("chat");
              }}
              agentProfiles={agentProfiles}
              repositories={repositories}
            />
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
