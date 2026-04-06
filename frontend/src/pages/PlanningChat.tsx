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
  getPlan,
  getPlanMessages,
  getTasks,
  getRepositories,
  getAgentProfiles,
} from "../lib/api";
import { usePlanSSE } from "../lib/sse";
import { toast } from "../lib/toast";
import { formatStatus } from "../lib/statusLabels";
import type { Message, Plan, Task, Repository, AgentProfile, WsEvent, ChatItem, PlanChatItem } from "../types";
import PlanSidebar from "../components/plan/PlanSidebar";
import ChatWindow from "../components/chat/ChatWindow";
import ChatInput from "../components/chat/ChatInput";
import PlanConfirmModal from "../components/plan/PlanConfirmModal";

export default function PlanningChat() {
  const { projectId, planId } = useParams<{ projectId: string; planId: string }>();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const [planTasks, setPlanTasks] = useState<Task[]>([]);
  const [currentDraft, setCurrentDraft] = useState<Plan | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const [planBeingReviewed, setPlanBeingReviewed] = useState<{ plan: Plan; tasks: Task[] } | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [changesNote, setChangesNote] = useState("");

  const { isOpen: isConfirmOpen, onOpen: onConfirmOpen, onOpenChange: onConfirmOpenChange } = useDisclosure();
  const { isOpen: isChangesOpen, onOpen: onChangesOpen, onOpenChange: onChangesOpenChange } = useDisclosure();

  // O(1) task lookup for task_status events
  const taskIdSet = useMemo(() => new Set(planTasks.map((t) => t.id)), [planTasks]);

  useEffect(() => {
    if (!planId || !projectId) return;
    setLoading(true);
    Promise.all([
      getPlan(planId),
      getPlanMessages(planId),
      getTasks(planId),
      getRepositories(projectId),
      getAgentProfiles(),
    ])
      .then(([loadedPlan, msgs, tasks, repos, profiles]) => {
        setPlan(loadedPlan);
        setRepositories(repos);
        setAgentProfiles(profiles);
        setPlanTasks(tasks);

        const isDraft = loadedPlan.status === "draft";
        const isConfirmedStatus =
          loadedPlan.status === "confirmed" ||
          loadedPlan.status === "executing" ||
          loadedPlan.status === "completed";

        setIsConfirmed(isConfirmedStatus);

        if (isDraft && tasks.length > 0) {
          setCurrentDraft(loadedPlan);
          const draftItem: PlanChatItem = {
            type: "plan-draft",
            id: loadedPlan.id,
            plan: loadedPlan,
            tasks,
            version: 1,
          };
          setChatItems([...msgs, draftItem]);
        } else {
          setChatItems(msgs);
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load plan data", err);
        toast.error("Failed to load plan data");
      })
      .finally(() => setLoading(false));
  }, [planId, projectId]);

  const handleWsEvent = useCallback(
    (event: WsEvent) => {
      if (event.type === "chat_thinking") {
        setIsStreaming(true);
        setStreamingText("");
      } else if (event.type === "chat_token") {
        setIsStreaming(true);
        setStreamingText((prev) => prev + event.content);
      } else if (event.type === "chat_end") {
        setIsStreaming(false);
        setStreamingText((prev) => {
          if (prev) {
            setChatItems((m) => [
              ...m,
              {
                id: `stream-${Date.now()}`,
                project_id: projectId ?? "",
                plan_id: planId,
                role: "assistant" as const,
                content: prev,
                created_at: new Date().toISOString(),
              },
            ]);
          }
          return "";
        });
      } else if (event.type === "plan_draft") {
        setIsStreaming(false);
        setStreamingText((prev) => {
          if (prev) {
            setChatItems((m) => [
              ...m,
              {
                id: `stream-${Date.now()}`,
                project_id: projectId ?? "",
                plan_id: planId,
                role: "assistant" as const,
                content: prev,
                created_at: new Date().toISOString(),
              },
            ]);
          }
          return "";
        });

        const newPlan = event.plan;
        const fetchedTasks = (newPlan.tasks ?? []) as Task[];

        setPlan((prev) => (prev ? { ...prev, status: "draft" } : prev));
        setCurrentDraft((prev) => prev ?? { id: newPlan.id, project_id: newPlan.project_id, status: newPlan.status, created_at: newPlan.created_at });

        if (fetchedTasks.length > 0) {
          setPlanTasks(fetchedTasks);
        }

        setChatItems((prev) => {
          const planItem: PlanChatItem = {
            type: "plan-draft",
            id: newPlan.id,
            plan: { id: newPlan.id, project_id: newPlan.project_id, title: newPlan.title, status: newPlan.status, created_at: newPlan.created_at },
            tasks: fetchedTasks,
            version: 1,
          };
          // Replace the existing draft card (revision) or append if this is the first draft
          const existingIdx = prev.findIndex(
            (i): i is PlanChatItem => "type" in i && (i as PlanChatItem).type === "plan-draft" && (i as PlanChatItem).id === newPlan.id
          );
          if (existingIdx >= 0) {
            const updated = [...prev];
            updated[existingIdx] = { ...planItem, version: (prev[existingIdx] as PlanChatItem).version + 1 };
            return updated;
          }
          return [...prev, planItem];
        });
      } else if (event.type === "plan_confirmed") {
        const confirmedPlanId = event.plan_id;
        setPlan((prev) => (prev && prev.id === confirmedPlanId ? { ...prev, status: "confirmed" } : prev));
        setChatItems((prev) =>
          prev.map((item) =>
            "type" in item && item.type === "plan-draft" && item.id === confirmedPlanId
              ? { ...item, plan: { ...item.plan, status: "confirmed" as const } }
              : item
          )
        );
        setCurrentDraft(null);
        setIsConfirmed(true);
        toast.success("Plan confirmed!", "Execution will begin shortly.");
      } else if (event.type === "task_status") {
        if (!taskIdSet.has(event.task_id)) return;
        setPlanTasks((prev) =>
          prev.map((t) =>
            t.id === event.task_id
              ? { ...t, status: event.status, assigned_instance_id: event.agent_instance_id }
              : t
          )
        );
      } else if (event.type === "error") {
        setIsStreaming(false);
        toast.error("Planning error", event.message);
      }
    },
    [projectId, planId, taskIdSet]
  );

  const { sendMessage } = usePlanSSE(planId, handleWsEvent);

  const handleSend = async (content: string) => {
    const userMsg: Message = {
      id: `local-${Date.now()}`,
      project_id: projectId ?? "",
      plan_id: planId,
      role: "user",
      content,
      created_at: new Date().toISOString(),
    };
    setChatItems((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    try {
      await sendMessage(content);
    } catch {
      setIsStreaming(false);
      toast.error("Failed to send message", "Check your connection and try again.");
    }
  };

  const handlePlanAction = (planItemId: string, action: "confirm" | "request-changes") => {
    const planItem = chatItems.find(
      (item): item is PlanChatItem => "type" in item && item.type === "plan-draft" && item.id === planItemId
    );
    if (!planItem) return;
    setPlanBeingReviewed({ plan: planItem.plan, tasks: planItem.tasks });
    if (action === "confirm") onConfirmOpen();
    else onChangesOpen();
  };

  const handleConfirmPlan = async () => {
    onConfirmOpenChange();
    await handleSend("confirm");
  };

  const handleRequestChanges = () => {
    onConfirmOpenChange();
    onChangesOpen();
  };

  const handleSubmitChanges = async () => {
    const feedback = changesNote.trim();
    onChangesOpenChange();
    const message = feedback
      ? `Please revise the plan. Here is my feedback:\n${feedback}`
      : "Please revise the plan based on our conversation.";
    setChangesNote("");
    await handleSend(message);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" label="Loading plan…" />
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Main column ── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-divider">
        {/* Top bar */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b border-divider shrink-0 min-w-0">
          <button
            onClick={() => navigate(`/projects/${projectId}`)}
            aria-label="Back to project"
            className="text-default-400 hover:text-foreground transition-colors text-sm shrink-0"
          >
            ←
          </button>
          <span className="text-default-300 shrink-0" aria-hidden="true">/</span>
          <h1 className="font-semibold truncate min-w-0 text-sm sm:text-base">
            {plan?.title ?? <span className="text-default-400 italic">Planning Chat</span>}
          </h1>

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
            {currentDraft && (
              <Button
                size="sm"
                color="success"
                onPress={() => {
                  const item = chatItems.find(
                    (i): i is PlanChatItem => "type" in i && i.type === "plan-draft" && i.id === (currentDraft?.id ?? "")
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
            {isConfirmed && (
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

        {/* Chat */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4">
          <ChatWindow
            items={chatItems}
            streamingText={streamingText}
            isStreaming={isStreaming}
            agentProfiles={agentProfiles}
            repositories={repositories}
            onPlanAction={handlePlanAction}
          />
        </div>
        <div className="border-t border-divider px-3 sm:px-5 py-3 shrink-0">
          <ChatInput onSend={handleSend} disabled={isStreaming || isConfirmed} />
        </div>
      </div>

      {/* ── Right sidebar: confirmed plan tasks ── */}
      <div
        className={`flex-col border-l border-divider transition-all duration-300 ${
          isConfirmed
            ? "hidden lg:flex lg:w-80 xl:w-[360px] shrink-0"
            : "hidden"
        }`}
        aria-label="Execution plan"
      >
        {isConfirmed && plan && (
          <div className="h-full overflow-hidden flex flex-col">
            <PlanSidebar
              plans={[plan]}
              activePlanId={plan.id}
              onPlanChange={() => {}}
              tasks={planTasks}
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
                  Describe what you'd like changed in the plan.
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
