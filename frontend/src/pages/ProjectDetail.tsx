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
  Spinner,
  useDisclosure,
} from "@heroui/react";
import { getProjects, getPlans, createPlan, getRepositories } from "../lib/api";
import { toast } from "../lib/toast";
import { formatStatus } from "../lib/statusLabels";
import type { Project, Plan, Repository } from "../types";
import RepositorySetup from "../components/plan/RepositorySetup";

type ActiveTab = "plans" | "repos";

const STATUS_COLOR: Record<string, "warning" | "success" | "primary" | "default"> = {
  draft: "warning",
  confirmed: "success",
  executing: "primary",
  completed: "success",
};

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("plans");
  const [newPlanTitle, setNewPlanTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const { isOpen: isNewPlanOpen, onOpen: onNewPlanOpen, onOpenChange: onNewPlanOpenChange } = useDisclosure();

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    Promise.all([getProjects(), getPlans(projectId), getRepositories(projectId)])
      .then(([projects, allPlans, repos]) => {
        const proj = projects.find((p) => p.id === projectId) ?? null;
        setProject(proj);
        setPlans(allPlans);
        setRepositories(repos);
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
          <Button size="sm" color="primary" onPress={onNewPlanOpen}>
            + New Plan
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div role="tablist" aria-label="Project sections" className="flex border-b border-divider shrink-0 px-1">
        {(["plans", "repos"] as ActiveTab[]).map((tab) => (
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
            {tab === "plans" ? `Plans (${plans.length})` : `Repositories (${repositories.length})`}
          </button>
        ))}
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
                <button
                  key={plan.id}
                  onClick={() => navigate(`/projects/${projectId}/plans/${plan.id}`)}
                  className="flex items-center gap-4 p-4 rounded-xl border border-divider hover:border-primary/50 hover:bg-default-50 transition-all text-left w-full"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {plan.title ?? <span className="text-default-400 italic">Untitled Plan</span>}
                    </p>
                    <p className="text-xs text-default-400 mt-0.5">
                      Created {new Date(plan.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Chip
                    size="sm"
                    variant="flat"
                    color={STATUS_COLOR[plan.status] ?? "default"}
                  >
                    {formatStatus(plan.status)}
                  </Chip>
                  <span className="text-default-300 text-sm">→</span>
                </button>
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
    </div>
  );
}
