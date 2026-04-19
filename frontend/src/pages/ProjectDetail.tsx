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
  Textarea,
  Tooltip,
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
  patchProjectAgent,
  listProjectMembers,
  addProjectMember,
  patchProjectMember,
  removeProjectMember,
  updateProject,
  deleteProject,
  listUsers,
} from "../lib/api";
import { toast } from "../lib/toast";
import { formatStatus } from "../lib/statusLabels";
import { useAuth } from "../context/AuthContext";
import type {
  Project,
  Plan,
  Repository,
  AgentProfile,
  ProjectAgent,
  AgentRole,
  ProjectMember,
  ProjectRole,
  ProjectStatus,
  User,
} from "../types";
import RepositorySetup from "../components/plan/RepositorySetup";
import DocumentExplorer from "./DocumentExplorer";
import ConfirmModal from "../components/common/ConfirmModal";
import WorkspaceTab from "../components/workspace/WorkspaceTab";
import EnvironmentTab from "../components/environments/EnvironmentTab";

type ActiveTab = "plans" | "repos" | "agents" | "members" | "documents" | "workspaces" | "environments";

const STATUS_COLOR: Record<string, "warning" | "success" | "primary" | "default"> = {
  draft: "warning",
  confirmed: "success",
  executing: "primary",
  completed: "success",
};

const ROLE_OPTIONS: AgentRole[] = ["planner", "coder", "reviewer", "tester", "infra", "knowledge", "custom"];

const ROLE_COLOR: Record<AgentRole, "warning" | "success" | "primary" | "secondary" | "danger" | "default"> = {
  planner: "primary",
  coder: "success",
  reviewer: "warning",
  tester: "secondary",
  infra: "danger",
  knowledge: "default",
  custom: "default",
  "document-copilot": "default",
};

const MEMBER_ROLE_OPTIONS: ProjectRole[] = ["owner", "editor", "viewer"];

const MEMBER_ROLE_COLOR: Record<ProjectRole, "danger" | "primary" | "default"> = {
  owner: "danger",
  editor: "primary",
  viewer: "default",
};

const PROJECT_STATUS_OPTIONS: ProjectStatus[] = ["planning", "executing", "done"];

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [agents, setAgents] = useState<ProjectAgent[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
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

  // Edit agent role modal state
  const [agentToEdit, setAgentToEdit] = useState<ProjectAgent | null>(null);
  const [editAgentRole, setEditAgentRole] = useState<AgentRole>("coder");
  const [savingAgentRole, setSavingAgentRole] = useState(false);

  // Members state
  const [addMemberUserId, setAddMemberUserId] = useState<string>("");
  const [addMemberRole, setAddMemberRole] = useState<ProjectRole>("viewer");
  const [addingMember, setAddingMember] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<ProjectMember | null>(null);
  const [removingMember, setRemovingMember] = useState(false);
  const [memberToEditRole, setMemberToEditRole] = useState<ProjectMember | null>(null);
  const [editMemberRole, setEditMemberRole] = useState<ProjectRole>("viewer");
  const [savingMemberRole, setSavingMemberRole] = useState(false);

  // Edit project modal state
  const [editProjectName, setEditProjectName] = useState("");
  const [editProjectDescription, setEditProjectDescription] = useState("");
  const [editProjectStatus, setEditProjectStatus] = useState<ProjectStatus>("planning");
  const [savingProject, setSavingProject] = useState(false);

  // Delete project state
  const [deletingProject, setDeletingProject] = useState(false);

  const { isOpen: isNewPlanOpen, onOpen: onNewPlanOpen, onOpenChange: onNewPlanOpenChange } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();
  const { isOpen: isAssignOpen, onOpen: onAssignOpen, onOpenChange: onAssignOpenChange } = useDisclosure();
  const { isOpen: isRemoveAgentOpen, onOpen: onRemoveAgentOpen, onOpenChange: onRemoveAgentOpenChange } = useDisclosure();
  const { isOpen: isEditAgentOpen, onOpen: onEditAgentOpen, onOpenChange: onEditAgentOpenChange } = useDisclosure();
  const { isOpen: isAddMemberOpen, onOpen: onAddMemberOpen, onOpenChange: onAddMemberOpenChange } = useDisclosure();
  const { isOpen: isRemoveMemberOpen, onOpen: onRemoveMemberOpen, onOpenChange: onRemoveMemberOpenChange } = useDisclosure();
  const { isOpen: isEditMemberRoleOpen, onOpen: onEditMemberRoleOpen, onOpenChange: onEditMemberRoleOpenChange } = useDisclosure();
  const { isOpen: isEditProjectOpen, onOpen: onEditProjectOpen, onOpenChange: onEditProjectOpenChange } = useDisclosure();
  const { isOpen: isDeleteProjectOpen, onOpen: onDeleteProjectOpen, onOpenChange: onDeleteProjectOpenChange } = useDisclosure();

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([
      getProjects(),
      getPlans(projectId),
      getRepositories(projectId),
      listProjectAgents(projectId),
      getAgentProfiles(),
      listProjectMembers(projectId),
      listUsers(),
    ])
      .then(([projects, allPlans, repos, projectAgents, profiles, projectMembers, users]) => {
        const proj = projects.find((p) => p.id === projectId) ?? null;
        setProject(proj);
        setPlans(allPlans);
        setRepositories(repos);
        setAgents(projectAgents);
        setAgentProfiles(profiles);
        setMembers(projectMembers);
        setAllUsers(users);
      })
      .catch(() => toast.error("Failed to load project"))
      .finally(() => setLoading(false));
  }, [projectId]);

  // ── Plan handlers ──────────────────────────────────────────────────────────

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

  // ── Agent handlers ─────────────────────────────────────────────────────────

  const handleAssignAgent = async () => {
    if (!projectId || !selectedProfileId) return;
    setAssigning(true);
    try {
      const assignment = await assignProjectAgent(projectId, {
        agent_profile_id: selectedProfileId,
        role: selectedRole,
      });
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

  const handleEditAgentRole = async () => {
    if (!projectId || !agentToEdit) return;
    setSavingAgentRole(true);
    try {
      const updated = await patchProjectAgent(projectId, agentToEdit.id, { role: editAgentRole });
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentToEdit.id
            ? { ...a, ...updated, agent_profile: a.agent_profile }
            : a,
        ),
      );
      toast.success("Agent role updated");
      onEditAgentOpenChange();
      setAgentToEdit(null);
    } catch {
      toast.error("Failed to update agent role");
    } finally {
      setSavingAgentRole(false);
    }
  };

  // ── Member handlers ────────────────────────────────────────────────────────

  const handleAddMember = async () => {
    if (!projectId || !addMemberUserId) return;
    setAddingMember(true);
    try {
      const member = await addProjectMember(projectId, {
        user_id: addMemberUserId,
        role: addMemberRole,
      });
      setMembers((prev) => [...prev, member]);
      toast.success("Member added");
      onAddMemberOpenChange();
      setAddMemberUserId("");
      setAddMemberRole("viewer");
    } catch {
      toast.error("Failed to add member");
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!projectId || !memberToRemove) return;
    setRemovingMember(true);
    try {
      await removeProjectMember(projectId, memberToRemove.user_id);
      setMembers((prev) => prev.filter((m) => m.user_id !== memberToRemove.user_id));
      toast.success("Member removed");
      onRemoveMemberOpenChange();
      setMemberToRemove(null);
    } catch {
      toast.error("Failed to remove member");
    } finally {
      setRemovingMember(false);
    }
  };

  const handleEditMemberRole = async () => {
    if (!projectId || !memberToEditRole) return;
    setSavingMemberRole(true);
    try {
      const updated = await patchProjectMember(projectId, memberToEditRole.user_id, {
        role: editMemberRole,
      });
      setMembers((prev) =>
        prev.map((m) => (m.user_id === memberToEditRole.user_id ? updated : m)),
      );
      toast.success("Member role updated");
      onEditMemberRoleOpenChange();
      setMemberToEditRole(null);
    } catch {
      toast.error("Failed to update member role");
    } finally {
      setSavingMemberRole(false);
    }
  };

  // ── Project handlers ───────────────────────────────────────────────────────

  const handleEditProject = async () => {
    if (!projectId) return;
    setSavingProject(true);
    try {
      const updated = await updateProject(projectId, {
        name: editProjectName.trim(),
        description: editProjectDescription.trim(),
        status: editProjectStatus,
      });
      setProject(updated);
      toast.success("Project updated");
      onEditProjectOpenChange();
    } catch {
      toast.error("Failed to update project");
    } finally {
      setSavingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!projectId) return;
    setDeletingProject(true);
    try {
      await deleteProject(projectId);
      toast.success("Project deleted");
      navigate("/");
    } catch {
      toast.error("Failed to delete project");
    } finally {
      setDeletingProject(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const existingMemberUserIds = new Set(members.map((m) => m.user_id));
  const availableUsersForAdd = allUsers.filter((u) => !existingMemberUserIds.has(u.id));

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

        {/* Edit project button */}
        <Tooltip content="Edit project">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            aria-label="Edit project"
            onPress={() => {
              setEditProjectName(project?.name ?? "");
              setEditProjectDescription(project?.description ?? "");
              setEditProjectStatus(project?.status ?? "planning");
              onEditProjectOpen();
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
          </Button>
        </Tooltip>

        {/* Delete project button */}
        <Tooltip content="Delete project" color="danger">
          <Button
            isIconOnly
            size="sm"
            variant="light"
            color="danger"
            aria-label="Delete project"
            onPress={onDeleteProjectOpen}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </Button>
        </Tooltip>

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
          {activeTab === "members" && (
            <Button size="sm" color="primary" onPress={onAddMemberOpen}>
              + Add Member
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div role="tablist" aria-label="Project sections" className="flex border-b border-divider shrink-0 px-1">
        {(["plans", "repos", "agents", "members", "documents", "workspaces", "environments"] as ActiveTab[]).map((tab) => {
          const label =
            tab === "plans"
              ? `Plans (${plans.length})`
              : tab === "repos"
              ? `Repositories (${repositories.length})`
              : tab === "agents"
              ? `Agents (${agents.length})`
              : tab === "members"
              ? `Members (${members.length})`
              : tab === "workspaces"
              ? "Workspaces"
              : tab === "environments"
              ? "Environments"
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
                  <Tooltip content="Edit role">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      aria-label={`Edit role: ${agent.agent_profile?.name ?? agent.agent_profile_id}`}
                      onPress={() => {
                        setAgentToEdit(agent);
                        setEditAgentRole(agent.role);
                        onEditAgentOpen();
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                      </svg>
                    </Button>
                  </Tooltip>
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

      {/* Members tab */}
      {activeTab === "members" && (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-default-400">
              <p className="text-lg">No members yet</p>
              <p className="text-sm">Add team members to collaborate on this project.</p>
              <Button color="primary" onPress={onAddMemberOpen}>
                + Add Member
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {members.map((member) => {
                const isSelf = currentUser?.id === member.user_id;
                return (
                  <div
                    key={member.user_id}
                    className="flex items-center gap-4 p-4 rounded-xl border border-divider hover:border-default-300 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{member.user.display_name || member.user.email}</p>
                      <p className="text-xs text-default-400 mt-0.5">{member.user.email}</p>
                    </div>
                    <Chip size="sm" variant="flat" color={MEMBER_ROLE_COLOR[member.role]}>
                      {member.role}
                    </Chip>
                    <Tooltip content="Edit role">
                      <Button
                        isIconOnly
                        size="sm"
                        variant="light"
                        aria-label={`Edit role: ${member.user.display_name || member.user.email}`}
                        onPress={() => {
                          setMemberToEditRole(member);
                          setEditMemberRole(member.role);
                          onEditMemberRoleOpen();
                        }}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </Button>
                    </Tooltip>
                    {!isSelf && (
                      <Tooltip content="Remove member" color="danger">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          aria-label={`Remove member: ${member.user.display_name || member.user.email}`}
                          onPress={() => {
                            setMemberToRemove(member);
                            onRemoveMemberOpen();
                          }}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </Button>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Documents tab — project-scoped explorer embedded inline */}
      {activeTab === "documents" && (
        <div className="flex-1 overflow-hidden">
          <DocumentExplorer projectId={projectId ?? ""} />
        </div>
      )}

      {/* Workspaces tab */}
      {activeTab === "workspaces" && projectId && (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <WorkspaceTab projectId={projectId} repositories={repositories} />
        </div>
      )}

      {/* Environments tab */}
      {activeTab === "environments" && projectId && (
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <EnvironmentTab projectId={projectId} />
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}

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

      {/* Edit Agent Role modal */}
      <Modal isOpen={isEditAgentOpen} onOpenChange={onEditAgentOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Edit Agent Role</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-500 mb-3">
                  Change the role for{" "}
                  <span className="font-semibold">
                    {agentToEdit?.agent_profile?.name ?? "this agent"}
                  </span>.
                </p>
                <Select
                  label="Role"
                  selectedKeys={new Set([editAgentRole])}
                  onSelectionChange={(keys) => setEditAgentRole(Array.from(keys)[0] as AgentRole)}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r}>{r}</SelectItem>
                  ))}
                </Select>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={savingAgentRole}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleEditAgentRole} isLoading={savingAgentRole}>
                  Save
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Add Member modal */}
      <Modal isOpen={isAddMemberOpen} onOpenChange={onAddMemberOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Add Member</ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                <Select
                  label="User"
                  placeholder="Select a user…"
                  selectedKeys={addMemberUserId ? new Set([addMemberUserId]) : new Set()}
                  onSelectionChange={(keys) => setAddMemberUserId(Array.from(keys)[0] as string)}
                >
                  {availableUsersForAdd.map((u) => (
                    <SelectItem key={u.id}>
                      {u.display_name || u.email}
                    </SelectItem>
                  ))}
                </Select>
                <Select
                  label="Role"
                  selectedKeys={new Set([addMemberRole])}
                  onSelectionChange={(keys) => setAddMemberRole(Array.from(keys)[0] as ProjectRole)}
                >
                  {MEMBER_ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r}>{r}</SelectItem>
                  ))}
                </Select>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={addingMember}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleAddMember}
                  isLoading={addingMember}
                  isDisabled={!addMemberUserId}
                >
                  Add
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Edit Member Role modal */}
      <Modal isOpen={isEditMemberRoleOpen} onOpenChange={onEditMemberRoleOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Edit Member Role</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-500 mb-3">
                  Change the role for{" "}
                  <span className="font-semibold">
                    {memberToEditRole?.user.display_name || memberToEditRole?.user.email || "this member"}
                  </span>.
                </p>
                <Select
                  label="Role"
                  selectedKeys={new Set([editMemberRole])}
                  onSelectionChange={(keys) => setEditMemberRole(Array.from(keys)[0] as ProjectRole)}
                >
                  {MEMBER_ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r}>{r}</SelectItem>
                  ))}
                </Select>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={savingMemberRole}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleEditMemberRole} isLoading={savingMemberRole}>
                  Save
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Remove Member confirmation modal */}
      <ConfirmModal
        isOpen={isRemoveMemberOpen}
        onOpenChange={onRemoveMemberOpenChange}
        title="Remove Member"
        message={`Remove ${memberToRemove?.user.display_name || memberToRemove?.user.email || "this member"} from the project?`}
        confirmLabel="Remove"
        onConfirm={handleRemoveMember}
        isLoading={removingMember}
      />

      {/* Edit Project modal */}
      <Modal isOpen={isEditProjectOpen} onOpenChange={onEditProjectOpenChange} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Edit Project</ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                <Input
                  autoFocus
                  label="Project name"
                  placeholder="My project…"
                  value={editProjectName}
                  onValueChange={setEditProjectName}
                />
                <Textarea
                  label="Description"
                  placeholder="A brief description…"
                  value={editProjectDescription}
                  onValueChange={setEditProjectDescription}
                />
                <Select
                  label="Status"
                  selectedKeys={new Set([editProjectStatus])}
                  onSelectionChange={(keys) => setEditProjectStatus(Array.from(keys)[0] as ProjectStatus)}
                >
                  {PROJECT_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s}>{s}</SelectItem>
                  ))}
                </Select>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={savingProject}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  onPress={handleEditProject}
                  isLoading={savingProject}
                  isDisabled={!editProjectName.trim()}
                >
                  Save
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete Project confirmation modal */}
      <ConfirmModal
        isOpen={isDeleteProjectOpen}
        onOpenChange={onDeleteProjectOpenChange}
        title="Delete Project"
        message={`Are you sure you want to delete "${project?.name ?? "this project"}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteProject}
        isLoading={deletingProject}
      />
    </div>
  );
}
