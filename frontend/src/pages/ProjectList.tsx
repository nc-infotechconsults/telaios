import { useEffect, useState, useMemo } from "react";
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
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";
import { getProjects, createProject, getRepositories } from "../lib/api";
import { toast } from "../lib/toast";
import type { Project, Repository } from "../types";
import ViewModeBar, { type ViewMode, type PageSize } from "../components/common/ViewModeBar";

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

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [reposByProject, setReposByProject] = useState<Record<string, Repository[]>>({});
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const navigate = useNavigate();

  // View mode + pagination
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

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
      .catch((error: unknown) => {
        console.error("Failed to load projects", error);
        toast.error("Failed to load projects");
        setProjects([]);
        setReposByProject({});
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProjects(); }, []);

  const pagedProjects = useMemo(() => {
    const start = (page - 1) * pageSize;
    return projects.slice(start, start + pageSize);
  }, [projects, page, pageSize]);

  const handleCreate = async (onClose: () => void) => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const project = await createProject({ name: name.trim(), description: description.trim() });
      setName("");
      setDescription("");
      onClose();
      navigate(`/projects/${project.id}`);
    } catch {
      toast.error("Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleModalClose = (isOpenState: boolean) => {
    if (!isOpenState) { setName(""); setDescription(""); }
    onOpenChange();
  };

  const dateStr = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Projects</h1>
          <p className="text-default-400 text-sm mt-1">Plan and execute software tasks with AI agents</p>
        </div>
        <Button color="primary" size="md" onPress={onOpen}>+ New Project</Button>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Spinner label="Loading projects…" />
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="text-6xl">🚀</div>
          <div>
            <p className="text-xl font-semibold">No projects yet</p>
            <p className="text-default-400 text-sm mt-1 max-w-xs">
              Create your first project to start planning tasks with AI agents.
            </p>
          </div>
          <Button color="primary" onPress={onOpen}>Create First Project</Button>
        </div>
      )}

      {!loading && projects.length > 0 && (
        <>
          <ViewModeBar
            mode={viewMode}
            onModeChange={setViewMode}
            page={page}
            pageSize={pageSize}
            total={projects.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />

          {/* ── Grid ── */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pagedProjects.map((p) => {
                const repos = reposByProject[p.id] ?? [];
                return (
                  <Card
                    key={p.id}
                    isPressable
                    onPress={() => navigate(`/projects/${p.id}`)}
                    className="group cursor-pointer clay-card hover:shadow-xl transition-all"
                  >
                    <CardBody className="p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-base leading-tight group-hover:text-primary transition-colors line-clamp-2 flex-1">
                          {p.name}
                        </h3>
                        <Chip size="sm" color={STATUS_COLOR[p.status]} variant="flat" className="shrink-0">
                          {STATUS_LABEL[p.status]}
                        </Chip>
                      </div>
                      <p className="text-sm text-default-500 line-clamp-2 leading-relaxed">
                        {p.description || <span className="italic text-default-300">No description</span>}
                      </p>
                      {repos.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {repos.map((r) => (
                            <Chip key={r.id} size="sm" color={REPO_STATUS_COLOR[r.status]} variant="bordered" startContent={<span>📁</span>}>
                              {r.name}
                            </Chip>
                          ))}
                        </div>
                      )}
                      <div className="pt-1 flex items-center justify-between text-xs text-default-400 border-t border-divider">
                        <span>{dateStr(p.created_at)}</span>
                        {repos.length === 0 && <span className="italic">No repos linked</span>}
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}

          {/* ── List ── */}
          {viewMode === "list" && (
            <div className="clay-card overflow-hidden flex flex-col divide-y divide-default-100/60">
              {pagedProjects.map((p) => {
                const repos = reposByProject[p.id] ?? [];
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => navigate(`/projects/${p.id}`)}
                    className="clay-list-item flex items-center gap-4 px-4 py-3 text-left w-full group"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm group-hover:text-primary transition-colors truncate block">
                        {p.name}
                      </span>
                      {p.description && (
                        <span className="text-xs text-default-400 truncate block">{p.description}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {repos.length > 0 && (
                        <span className="text-xs text-default-400">📁 {repos.length}</span>
                      )}
                      <span className="text-xs text-default-400">{dateStr(p.created_at)}</span>
                      <Chip size="sm" color={STATUS_COLOR[p.status]} variant="flat">
                        {STATUS_LABEL[p.status]}
                      </Chip>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Table ── */}
          {viewMode === "table" && (
            <div className="clay-card overflow-hidden">
            <Table
              aria-label="Projects table"
              removeWrapper
              classNames={{ th: "clay-table-th", tr: "clay-list-item border-b border-divider last:border-b-0" }}
            >
              <TableHeader>
                <TableColumn>NAME</TableColumn>
                <TableColumn>STATUS</TableColumn>
                <TableColumn>REPOSITORIES</TableColumn>
                <TableColumn>CREATED</TableColumn>
                <TableColumn>{""}</TableColumn>
              </TableHeader>
              <TableBody>
                {pagedProjects.map((p) => {
                  const repos = reposByProject[p.id] ?? [];
                  return (
                    <TableRow key={p.id} className="cursor-pointer">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{p.name}</p>
                          {p.description && (
                            <p className="text-xs text-default-400 line-clamp-1">{p.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Chip size="sm" color={STATUS_COLOR[p.status]} variant="flat">
                          {STATUS_LABEL[p.status]}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {repos.length === 0 ? (
                            <span className="text-xs text-default-400 italic">None</span>
                          ) : repos.map((r) => (
                            <Chip key={r.id} size="sm" color={REPO_STATUS_COLOR[r.status]} variant="bordered">
                              📁 {r.name}
                            </Chip>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-default-400">{dateStr(p.created_at)}</span>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="light"
                          color="primary"
                          onPress={() => navigate(`/projects/${p.id}`)}
                        >
                          Open →
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </>
      )}

      {/* Create modal */}
      <Modal isOpen={isOpen} onOpenChange={handleModalClose} size="md">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <span>New Project</span>
                <span className="text-sm text-default-400 font-normal">Start a new AI-assisted planning session</span>
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
                <Button variant="light" onPress={onClose} isDisabled={creating}>Cancel</Button>
                <Button color="primary" isLoading={creating} isDisabled={!name.trim()} onPress={() => handleCreate(onClose)}>
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
