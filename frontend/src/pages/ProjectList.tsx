import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardBody,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Textarea,
  Chip,
  Spinner,
  useDisclosure,
} from "@heroui/react";
import { getProjects, createProject, getRepositories } from "../lib/api";
import type { Project, Repository } from "../types";

const STATUS_COLOR: Record<Project["status"], "default" | "warning" | "success"> = {
  planning: "warning",
  executing: "default",
  done: "success",
};

const STATUS_LABEL: Record<Project["status"], string> = {
  planning: "Planning",
  executing: "Executing",
  done: "Done",
};

const REPO_STATUS_COLOR: Record<
  Repository["status"],
  "default" | "warning" | "success" | "danger"
> = {
  unconfigured: "default",
  cloning: "warning",
  ready: "success",
  error: "danger",
};

// ---------------------------------------------------------------------------
// Demo / fallback data — shown when the backend is not reachable
// ---------------------------------------------------------------------------
const DEMO_PROJECTS: Project[] = [
  {
    id: "demo-1",
    name: "E-commerce API Refactor",
    description:
      "Migrating the monolithic REST API to microservices with improved auth and caching. Zero-downtime deployment using the strangler-fig pattern.",
    status: "executing",
    created_at: "2026-03-28T10:00:00Z",
  },
  {
    id: "demo-2",
    name: "Mobile App — Onboarding Flow",
    description:
      "Redesigning the user onboarding experience with step-by-step guidance, error recovery, and A/B testing support.",
    status: "planning",
    created_at: "2026-04-01T09:00:00Z",
  },
  {
    id: "demo-3",
    name: "Data Pipeline Orchestration",
    description:
      "Building a fault-tolerant ETL pipeline with Apache Airflow and dbt for the data analytics team.",
    status: "done",
    created_at: "2026-03-15T14:30:00Z",
  },
];

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
      status: "cloning",
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
// ---------------------------------------------------------------------------

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [reposByProject, setReposByProject] = useState<Record<string, Repository[]>>({});
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const navigate = useNavigate();

  const fetchProjects = () => {
    setLoading(true);
    getProjects()
      .then((projs) => {
        setProjects(projs);
        Promise.all(
          projs.map((p) =>
            getRepositories(p.id)
              .then((repos) => ({ projectId: p.id, repos }))
              .catch(() => ({ projectId: p.id, repos: [] as Repository[] }))
          )
        ).then((results) => {
          const byProject: Record<string, Repository[]> = {};
          results.forEach(({ projectId, repos }) => {
            byProject[projectId] = repos;
          });
          setReposByProject(byProject);
        });
      })
      .catch(() => {
        // Backend not reachable — show demo data so the UI is not empty
        setProjects(DEMO_PROJECTS);
        setReposByProject(DEMO_REPOS);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreate = async (onClose: () => void) => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim(),
      });
      setName("");
      setDescription("");
      onClose();
      navigate(`/projects/${project.id}`);
    } finally {
      setCreating(false);
    }
  };

  const handleModalClose = (isOpenState: boolean) => {
    if (!isOpenState) {
      setName("");
      setDescription("");
    }
    onOpenChange();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-default-400 text-sm mt-1">
            Plan and execute software tasks with AI agents
          </p>
        </div>
        <Button color="primary" size="md" onPress={onOpen}>
          + New Project
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <Spinner label="Loading projects…" />
        </div>
      )}

      {/* Empty state */}
      {!loading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="text-6xl">🚀</div>
          <div>
            <p className="text-xl font-semibold">No projects yet</p>
            <p className="text-default-400 text-sm mt-1 max-w-xs">
              Create your first project to start planning tasks with AI agents.
            </p>
          </div>
          <Button color="primary" onPress={onOpen}>
            Create First Project
          </Button>
        </div>
      )}

      {/* Project grid */}
      {!loading && projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const repos = reposByProject[p.id] ?? [];
            const dateStr = new Date(p.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            });

            return (
              <Card
                key={p.id}
                isPressable
                onPress={() => navigate(`/projects/${p.id}`)}
                className="group cursor-pointer hover:shadow-lg transition-all border border-divider hover:border-primary/40"
              >
                <CardBody className="p-5 space-y-3">
                  {/* Project name + status */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2 flex-1">
                      {p.name}
                    </h3>
                    <Chip
                      size="sm"
                      color={STATUS_COLOR[p.status]}
                      variant="flat"
                      className="shrink-0"
                    >
                      {STATUS_LABEL[p.status]}
                    </Chip>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-default-500 line-clamp-2 leading-relaxed">
                    {p.description || (
                      <span className="italic text-default-300">No description</span>
                    )}
                  </p>

                  {/* Repos */}
                  {repos.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {repos.map((r) => (
                        <Chip
                          key={r.id}
                          size="sm"
                          color={REPO_STATUS_COLOR[r.status]}
                          variant="bordered"
                          startContent={<span>📁</span>}
                        >
                          {r.name}
                        </Chip>
                      ))}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="pt-1 flex items-center justify-between text-xs text-default-400 border-t border-divider">
                    <span>{dateStr}</span>
                    {repos.length === 0 && (
                      <span className="italic">No repos linked</span>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      <Modal isOpen={isOpen} onOpenChange={handleModalClose} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <span>New Project</span>
                <span className="text-sm text-default-400 font-normal">
                  Start a new AI-assisted planning session
                </span>
              </ModalHeader>
              <ModalBody>
                <Input
                  label="Project name"
                  placeholder="e.g. E-commerce API refactor"
                  value={name}
                  onValueChange={setName}
                  isRequired
                  autoFocus
                  description="Give your project a clear, descriptive name"
                />
                <Textarea
                  label="Description"
                  placeholder="What are you building? Any relevant context…"
                  value={description}
                  onValueChange={setDescription}
                  minRows={3}
                  className="mt-1"
                  description="Optional — the AI agent will ask follow-up questions"
                />
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={creating}>
                  Cancel
                </Button>
                <Button
                  color="primary"
                  isLoading={creating}
                  isDisabled={!name.trim()}
                  onPress={() => handleCreate(onClose)}
                >
                  Create &amp; Start Planning
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
