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
  listProjectAgents,
  removeProjectAgent,
  updateProjectAgent,
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
import AnalyticsTab from "../components/analytics/AnalyticsTab";
import LibraryBrowserModal from "../components/library/LibraryBrowserModal";

type ActiveTab = "plans" | "repos" | "agents" | "members" | "documents" | "workspaces" | "environments" | "analytics";

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
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("plans");
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [planToDelete, setPlanToDelete] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Agent modal state
  const [agentToRemove, setAgentToRemove] = useState<ProjectAgent | null>(null);
  const [removing, setRemoving] = useState(false);

  // Edit agent modal state
  const [agentToEdit, setAgentToEdit] = useState<ProjectAgent | null>(null);
  const [editAgentName, setEditAgentName] = useState<string>("");
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
  const { isOpen: isLibraryOpen, onOpen: onLibraryOpen, onOpenChange: onLibraryOpenChange } = useDisclosure();
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
      listProjectMembers(projectId),
      listUsers(),
    ])
      .then(([projectsResult, allPlans, repos, projectAgents, projectMembers, users]) => {
        const proj = projectsResult.items.find((p) => p.id === projectId) ?? null;
        setProject(proj);
        setPlans(allPlans);
        setRepositories(repos);
        setAgents(projectAgents);
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

  const handleEditAgent = async () => {
    if (!projectId || !agentToEdit) return;
    setSavingAgentRole(true);
    try {
      const updated = await updateProjectAgent(projectId, agentToEdit.id, {
        name: editAgentName,
        role: editAgentRole,
      });
      setAgents((prev) =>
        prev.map((a) => (a.id === agentToEdit.id ? { ...a, ...updated } : a)),
      );
      toast.success("Agent updated");
      onEditAgentOpenChange();
      setAgentToEdit(null);
    } catch {
      toast.error("Failed to update agent");
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
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
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
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </Button>
        </Tooltip>

        {project?.description && (
          <span className="text-default-400 text-sm truncate hidden md:block">— {project.description}</span>
        )}
        <div className="ml-auto shrink-0">
          {activeTab === "plans" && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="bordered" onPress={() => navigate(`/projects/${projectId}/design`)}>
                Design Studio
              </Button>
              <Button size="sm" color="primary" onPress={onNewPlanOpen}>
                + New Plan
              </Button>
            </div>
          )}
          {activeTab === "agents" && (
            <Button size="sm" color="primary" onPress={onLibraryOpen}>
              + Add Agent
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
      <div role="tablist" aria-label="Project sections" className="clay-tab-bar flex border-b border-divider shrink-0 px-1 overflow-x-auto">
        {(["plans", "repos", "agents", "members", "documents", "workspaces", "environments", "analytics"] as ActiveTab[]).map((tab) => {
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
              : tab === "analytics"
              ? "Analytics"
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
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
              <p className="text-sm">Add an agent from the library to give this project an AI team member.</p>
              <Button color="primary" onPress={onLibraryOpen}>
                + Add Agent
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
                      {agent.name}
                    </p>
                    <p className="text-xs text-default-400 mt-0.5">
                      Added {new Date(agent.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Chip size="sm" variant="flat" color={ROLE_COLOR[agent.role] ?? "default"}>
                    {agent.role}
                  </Chip>
                  <Tooltip content="Edit agent">
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      aria-label={`Edit agent: ${agent.name}`}
                      onPress={() => {
                        setAgentToEdit(agent);
                        setEditAgentName(agent.name);
                        setEditAgentRole(agent.role);
                        onEditAgentOpen();
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </Button>
                  </Tooltip>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    aria-label={`Remove agent: ${agent.name}`}
                    onPress={() => {
                      setAgentToRemove(agent);
                      onRemoveAgentOpen();
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
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
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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

      {activeTab === "analytics" && projectId && (
        <div className="flex-1 overflow-y-auto">
          <AnalyticsTab projectId={projectId} />
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

      {/* Library Browser modal — pick an agent to add */}
      <LibraryBrowserModal
        isOpen={isLibraryOpen}
        onOpenChange={onLibraryOpenChange}
        projectId={projectId ?? ""}
        onAdded={(agent) => setAgents((prev) => [...prev, agent])}
      />

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
                    {agentToRemove?.name ?? "this agent"}
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

      {/* Edit Agent modal */}
      <Modal isOpen={isEditAgentOpen} onOpenChange={onEditAgentOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Edit Agent</ModalHeader>
              <ModalBody className="flex flex-col gap-4">
                <Input
                  autoFocus
                  label="Name"
                  value={editAgentName}
                  onValueChange={setEditAgentName}
                />
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
                <Button color="primary" onPress={handleEditAgent} isLoading={savingAgentRole}>
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
