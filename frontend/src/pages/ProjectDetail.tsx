import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
  Spinner,
  useDisclosure,
} from "@heroui/react";
import {
  getProjects,
  getPlans,
  createPlan,
  deletePlan,
  getRepositories,
  getAgentProfiles,
  listProjectAgents,
  assignProjectAgent,
  removeProjectAgent,
} from "../lib/api";
import { toast } from "../lib/toast";
import { formatStatus } from "../lib/statusLabels";
import type { Project, Plan, Repository, AgentProfile, ProjectAgent, AgentRole } from "../types";
import RepositorySetup from "../components/plan/RepositorySetup";
import DocumentsTab from "../components/documents/DocumentsTab";

type ActiveTab = "plans" | "repos" | "agents" | "documents";

const STATUS_COLOR: Record<string, "warning" | "success" | "primary" | "default"> = {
  draft: "warning",
  confirmed: "success",
  executing: "primary",
  completed: "success",
};

const ROLE_OPTIONS: AgentRole[] = ["planner", "coder", "reviewer", "tester", "infra", "knowledge"];

const ROLE_COLOR: Record<AgentRole, "warning" | "success" | "primary" | "secondary" | "danger" | "default"> = {
  planner: "primary",
  coder: "success",
  reviewer: "warning",
  tester: "secondary",
  infra: "danger",
  knowledge: "default",
};

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [agents, setAgents] = useState<ProjectAgent[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("plans");
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Assign agent modal state
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<AgentRole>("coder");
  const [assigning, setAssigning] = useState(false);
  const [agentToRemove, setAgentToRemove] = useState<ProjectAgent | null>(null);
  const [removing, setRemoving] = useState(false);

  const { isOpen: isNewPlanOpen, onOpen: onNewPlanOpen, onOpenChange: onNewPlanOpenChange } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();
  const { isOpen: isAssignOpen, onOpen: onAssignOpen, onOpenChange: onAssignOpenChange } = useDisclosure();
  const { isOpen: isRemoveAgentOpen, onOpen: onRemoveAgentOpen, onOpenChange: onRemoveAgentOpenChange } = useDisclosure();

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      getProjects(),
      getPlans(projectId),
      getRepositories(projectId),
      listProjectAgents(projectId),
      getAgentProfiles(),
    ])
      .then(([projects, allPlans, repos, projectAgents, profiles]) => {
        const proj = projects.find((p) => p.id === projectId) ?? null;
        setProject(proj);
        setPlans(allPlans);
        setRepositories(repos);
        setAgents(projectAgents);
        setAgentProfiles(profiles);
      })
      .catch(() => toast.error("Failed to load project"))
      .finally(() => setLoading(false));
  }, [projectId]);

  const handleCreatePlan = async () => {
    if (!projectId) return;
    setCreating(true);
    try {
      const title = newPlanTitle.trim() || undefined;
      const plan = await createPlan(projectId, title);
      toast.success("Plan created", title ?? "New plan started");
      onNewPlanOpenChange();
      setNewPlanTitle("");
      navigate(`/projects/${projectId}/plans/${plan.id}`);
    } catch {
      toast.error("Failed to create plan");
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePlan = async () => {
    if (!planToDelete) return;
    setDeleting(true);
    try {
      await deletePlan(planToDelete.id);
      setPlans((prev) => prev.filter((p) => p.id !== planToDelete.id));
      toast.success("Plan deleted", planToDelete.title ?? "Plan removed");
      onDeleteOpenChange();
      setPlanToDelete(null);
    } catch {
      toast.error("Failed to delete plan");
    } finally {
      setDeleting(false);
    }
  };

  const handleAssignAgent = async () => {
    if (!projectId || !selectedProfileId) return;
    setAssigning(true);
    try {
      const assignment = await assignProjectAgent(projectId, {
        agent_profile_id: selectedProfileId,
        role: selectedRole,
      });
      // Attach the full profile for display without re-fetching
      const profile = agentProfiles.find((p) => p.id === selectedProfileId);
      setAgents((prev) => {
        const exists = prev.find((a) => a.id === assignment.id);
        const enriched = { ...assignment, agent_profile: profile ?? assignment.agent_profile };
        return exists
          ? prev.map((a) => (a.id === assignment.id ? enriched : a))
          : [...prev, enriched];
      });
      toast.success("Agent assigned");
      onAssignOpenChange();
      setSelectedProfileId("");
      setSelectedRole("coder");
    } catch {
      toast.error("Failed to assign agent");
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveAgent = async () => {
    if (!projectId || !agentToRemove) return;
    setRemoving(true);
    try {
      await removeProjectAgent(projectId, agentToRemove.id);
      setAgents((prev) => prev.filter((a) => a.id !== agentToRemove.id));
      toast.success("Agent removed");
      onRemoveAgentOpenChange();
      setAgentToRemove(null);
    } catch {
      toast.error("Failed to remove agent");
    } finally {
      setRemoving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" label="Loading project…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b border-divider shrink-0 min-w-0">
        <button
          onClick={() => navigate("/")}
          aria-label="Back to projects list"
          className="text-default-400 hover:text-foreground transition-colors text-sm shrink-0"
        >
          ←
        </button>
        <span className="text-default-300 shrink-0" aria-hidden="true">/</span>
        <h1 className="font-semibold truncate min-w-0 text-sm sm:text-base">{project?.name ?? "Project"}</h1>
        {project?.description && (
          <span className="text-default-400 text-sm truncate hidden md:block">— {project.description}</span>
        )}
        <div className="ml-auto shrink-0">
          {activeTab === "plans" && (
            <Button size="sm" color="primary" onPress={onNewPlanOpen}>
              + New Plan
            </Button>
          )}
          {activeTab === "agents" && (
            <Button size="sm" color="primary" onPress={onAssignOpen}>
              + Assign Agent
            </Button>
          )}
          {activeTab === "documents" && (
            <Button size="sm" color="primary" onPress={() => document.getElementById("doc-upload-trigger")?.click()}>
              + Upload
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div role="tablist" aria-label="Project sections" className="flex border-b border-divider shrink-0 px-1">
        {(["plans", "repos", "agents", "documents"] as ActiveTab[]).map((tab) => {
          const label =
            tab === "plans"
              ? `Plans (${plans.length})`
              : tab === "repos"
              ? `Repositories (${repositories.length})`
              : tab === "agents"
              ? `Agents (${agents.length})`
              : "Documents";
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-default-400 hover:text-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Plans tab */}
      {activeTab === "plans" && (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {plans.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-default-400">
              <p className="text-lg">No plans yet</p>
              <p className="text-sm">Create a plan to start breaking down your feature or integration.</p>
              <Button color="primary" onPress={onNewPlanOpen}>
                + New Plan
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex items-center gap-2 p-4 rounded-xl border border-divider hover:border-primary/50 hover:bg-default-50 transition-all"
                >
                  <button
                    onClick={() => navigate(`/projects/${projectId}/plans/${plan.id}`)}
                    className="flex items-center gap-4 flex-1 min-w-0 text-left"
                    aria-label={`Open plan: ${plan.title ?? "Untitled Plan"}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {plan.title ?? <span className="text-default-400 italic">Untitled Plan</span>}
                      </p>
                      <p className="text-xs text-default-400 mt-0.5">
                        Created {new Date(plan.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Chip size="sm" variant="flat" color={STATUS_COLOR[plan.status] ?? "default"}>
                      {formatStatus(plan.status)}
                    </Chip>
                    <span className="text-default-300 text-sm" aria-hidden="true">→</span>
                  </button>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    aria-label={`Delete plan: ${plan.title ?? "Untitled Plan"}`}
                    onPress={() => {
                      setPlanToDelete(plan);
                      onDeleteOpen();
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Repos tab */}
      {activeTab === "repos" && (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <RepositorySetup
            projectId={projectId ?? ""}
            repositories={repositories}
            onChange={setRepositories}
          />
        </div>
      )}

      {/* Agents tab */}
      {activeTab === "agents" && (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-default-400">
              <p className="text-lg">No agents assigned</p>
              <p className="text-sm">Assign an agent profile to give this project an AI team member.</p>
              <Button color="primary" onPress={onAssignOpen}>
                + Assign Agent
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-4 p-4 rounded-xl border border-divider hover:border-default-300 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {agent.agent_profile?.name ?? agent.agent_profile_id}
                    </p>
                    <p className="text-xs text-default-400 mt-0.5">
                      Assigned {new Date(agent.assigned_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Chip size="sm" variant="flat" color={ROLE_COLOR[agent.role] ?? "default"}>
                    {agent.role}
                  </Chip>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    aria-label={`Remove agent: ${agent.agent_profile?.name ?? agent.agent_profile_id}`}
                    onPress={() => {
                      setAgentToRemove(agent);
                      onRemoveAgentOpen();
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Documents tab */}
      {activeTab === "documents" && (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <DocumentsTab projectId={projectId ?? ""} />
        </div>
      )}

      {/* New Plan modal */}
      <Modal isOpen={isNewPlanOpen} onOpenChange={onNewPlanOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Create New Plan</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-500 mb-3">
                  Give your plan a title to describe the feature or integration you're building.
                </p>
                <Input
                  autoFocus
                  label="Plan title"
                  placeholder="e.g. User authentication, Payment integration…"
                  value={newPlanTitle}
                  onValueChange={setNewPlanTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreatePlan();
                  }}
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={creating}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleCreatePlan} isLoading={creating}>
                  Create Plan
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete Plan confirmation modal */}
      <Modal isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Delete Plan</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Are you sure you want to delete{" "}
                  <span className="font-semibold">{planToDelete?.title ?? "this plan"}</span>? This
                  action cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={deleting}>
                  Cancel
                </Button>
                <Button color="danger" onPress={handleDeletePlan} isLoading={deleting}>
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Assign Agent modal */}
      <Modal isOpen={isAssignOpen} onOpenChange={onAssignOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Assign Agent</ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                <Select
                  label="Agent profile"
                  placeholder="Select a profile…"
                  selectedKeys={selectedProfileId ? new Set([selectedProfileId]) : new Set()}
                  onSelectionChange={(keys) => setSelectedProfileId(Array.from(keys)[0] as string)}
                >
                  {agentProfiles.map((p) => (
                    <SelectItem key={p.id}>{p.name}</SelectItem>
                  ))}
                </Select>
                <Select
                  label="Role"
                  selectedKeys={new Set([selectedRole])}
                  onSelectionChange={(keys) => setSelectedRole(Array.from(keys)[0] as AgentRole)}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r}>{r}</SelectItem>
                  ))}
                </Select>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={assigning}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleAssignAgent}
                  isLoading={assigning}
                  isDisabled={!selectedProfileId}
                >
                  Assign
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Remove Agent confirmation modal */}
      <Modal isOpen={isRemoveAgentOpen} onOpenChange={onRemoveAgentOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Remove Agent</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Remove{" "}
                  <span className="font-semibold">
                    {agentToRemove?.agent_profile?.name ?? "this agent"}
                  </span>{" "}
                  from the project?
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={removing}>
                  Cancel
                </Button>
                <Button color="danger" onPress={handleRemoveAgent} isLoading={removing}>
                  Remove
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
