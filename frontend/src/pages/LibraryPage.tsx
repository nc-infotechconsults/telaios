import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Spinner,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";

const SearchIcon = (
  <svg
    className="w-4 h-4 text-default-400"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);
import {
  cloneLibraryAgent,
  deleteLibraryAgent,
  deleteLibraryMCP,
  deleteLibrarySkill,
  exportLibrarySkill,
  listLibraryAgents,
  listLibraryMCPs,
  listLibrarySkills,
} from "../lib/api";
import { toast } from "../lib/toast";
import type { AgentRole, LibraryAgent, LibraryMCP, LibrarySkill } from "../types";
import LibraryAgentCard from "../components/library/LibraryAgentCard";
import LibraryAgentForm from "../components/library/LibraryAgentForm";
import LibraryMCPForm from "../components/library/LibraryMCPForm";
import LibrarySkillForm from "../components/library/LibrarySkillForm";
import ConfirmModal from "../components/common/ConfirmModal";
import ViewModeBar, { type ViewMode, type PageSize } from "../components/common/ViewModeBar";

const ROLE_COLOR: Record<AgentRole, "warning" | "success" | "primary" | "secondary" | "danger" | "default"> = {
  planner: "primary",
  coder: "success",
  reviewer: "warning",
  tester: "secondary",
  infra: "danger",
  knowledge: "default",
  custom: "default",
  "document-copilot": "default",
  designer: "default",
};

type LibraryTab = "agents" | "mcps" | "skills";

const ROLE_FILTERS: Array<AgentRole | "all"> = [
  "all",
  "planner",
  "coder",
  "reviewer",
  "tester",
  "designer",
  "infra",
  "knowledge",
  "custom",
];

export default function LibraryPage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<LibraryTab>("agents");

  // Agents state
  const [agents, setAgents] = useState<LibraryAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsFetched, setAgentsFetched] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [agentRoleFilter, setAgentRoleFilter] = useState<AgentRole | "all">("all");

  // MCPs state (lazy-loaded)
  const [mcps, setMcps] = useState<LibraryMCP[]>([]);
  const [mcpsLoading, setMcpsLoading] = useState(false);
  const [mcpsFetched, setMcpsFetched] = useState(false);
  const [mcpSearch, setMcpSearch] = useState("");

  // Skills state (lazy-loaded)
  const [skills, setSkills] = useState<LibrarySkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsFetched, setSkillsFetched] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");

  // Form modal
  const [formOpen, setFormOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<LibraryAgent | undefined>(undefined);

  // Delete modal
  const [agentToDelete, setAgentToDelete] = useState<LibraryAgent | null>(null);
  const [deleting, setDeleting] = useState(false);

  // MCP form/delete state
  const [mcpFormOpen, setMcpFormOpen] = useState(false);
  const [editingMcp, setEditingMcp] = useState<LibraryMCP | undefined>(undefined);
  const [mcpToDelete, setMcpToDelete] = useState<LibraryMCP | null>(null);
  const [deletingMcp, setDeletingMcp] = useState(false);

  // Skill form/delete/export state
  const [skillFormOpen, setSkillFormOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<LibrarySkill | undefined>(undefined);
  const [skillToDelete, setSkillToDelete] = useState<LibrarySkill | null>(null);
  const [deletingSkill, setDeletingSkill] = useState(false);
  const [exportingSkillId, setExportingSkillId] = useState<string | null>(null);

  // Shared view mode
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Per-tab pagination
  const [agentPage, setAgentPage] = useState(1);
  const [agentPageSize, setAgentPageSize] = useState<PageSize>(10);
  const [mcpPage, setMcpPage] = useState(1);
  const [mcpPageSize, setMcpPageSize] = useState<PageSize>(10);
  const [skillPage, setSkillPage] = useState(1);
  const [skillPageSize, setSkillPageSize] = useState<PageSize>(10);

  // Load agents on mount
  useEffect(() => {
    if (agentsFetched) return;
    setAgentsLoading(true);
    listLibraryAgents()
      .then((data) => {
        setAgents(data);
        setAgentsFetched(true);
      })
      .catch(() => toast.error("Failed to load library agents"))
      .finally(() => setAgentsLoading(false));
  }, [agentsFetched]);

  // Lazy-load MCPs on first switch to that tab
  useEffect(() => {
    if (activeTab !== "mcps" || mcpsFetched) return;
    setMcpsLoading(true);
    listLibraryMCPs()
      .then((data) => {
        setMcps(data);
        setMcpsFetched(true);
      })
      .catch(() => toast.error("Failed to load library MCPs"))
      .finally(() => setMcpsLoading(false));
  }, [activeTab, mcpsFetched]);

  // Lazy-load Skills on first switch to that tab
  useEffect(() => {
    if (activeTab !== "skills" || skillsFetched) return;
    setSkillsLoading(true);
    listLibrarySkills()
      .then((data) => {
        setSkills(data);
        setSkillsFetched(true);
      })
      .catch(() => toast.error("Failed to load library skills"))
      .finally(() => setSkillsLoading(false));
  }, [activeTab, skillsFetched]);

  // Filtered agents
  const filteredAgents = useMemo(() => agents.filter((a) => {
    const matchesRole = agentRoleFilter === "all" || a.role === agentRoleFilter;
    const q = agentSearch.toLowerCase();
    const matchesSearch =
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q));
    return matchesRole && matchesSearch;
  }), [agents, agentSearch, agentRoleFilter]);

  // Filtered MCPs
  const filteredMcps = useMemo(() => mcps.filter((m) => {
    const q = mcpSearch.toLowerCase();
    return !q || m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q);
  }), [mcps, mcpSearch]);

  // Filtered Skills
  const filteredSkills = useMemo(() => skills.filter((s) => {
    const q = skillSearch.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q);
  }), [skills, skillSearch]);

  // Paged slices
  const pagedAgents = useMemo(() => {
    const start = (agentPage - 1) * agentPageSize;
    return filteredAgents.slice(start, start + agentPageSize);
  }, [filteredAgents, agentPage, agentPageSize]);

  const pagedMcps = useMemo(() => {
    const start = (mcpPage - 1) * mcpPageSize;
    return filteredMcps.slice(start, start + mcpPageSize);
  }, [filteredMcps, mcpPage, mcpPageSize]);

  const pagedSkills = useMemo(() => {
    const start = (skillPage - 1) * skillPageSize;
    return filteredSkills.slice(start, start + skillPageSize);
  }, [filteredSkills, skillPage, skillPageSize]);

  const handleDeleteAgent = async () => {
    if (!agentToDelete) return;
    setDeleting(true);
    try {
      await deleteLibraryAgent(agentToDelete.id);
      setAgents((prev) => prev.filter((a) => a.id !== agentToDelete.id));
      toast.success("Agent deleted", agentToDelete.name);
      setAgentToDelete(null);
    } catch {
      toast.error("Failed to delete agent");
    } finally {
      setDeleting(false);
    }
  };

  const handleCloneAgent = async (agent: LibraryAgent) => {
    try {
      const cloned = await cloneLibraryAgent(agent.id);
      setAgents((prev) => [cloned, ...prev]);
      toast.success("Agent cloned", cloned.name);
    } catch {
      toast.error("Failed to clone agent");
    }
  };

  const handleDeleteMcp = async () => {
    if (!mcpToDelete) return;
    setDeletingMcp(true);
    try {
      await deleteLibraryMCP(mcpToDelete.id);
      setMcps((prev) => prev.filter((m) => m.id !== mcpToDelete.id));
      toast.success("MCP server deleted", mcpToDelete.name);
      setMcpToDelete(null);
    } catch {
      toast.error("Failed to delete MCP server");
    } finally {
      setDeletingMcp(false);
    }
  };

  const handleDeleteSkill = async () => {
    if (!skillToDelete) return;
    setDeletingSkill(true);
    try {
      await deleteLibrarySkill(skillToDelete.id);
      setSkills((prev) => prev.filter((s) => s.id !== skillToDelete.id));
      toast.success("Skill deleted", skillToDelete.name);
      setSkillToDelete(null);
    } catch {
      toast.error("Failed to delete skill");
    } finally {
      setDeletingSkill(false);
    }
  };

  const handleExportSkill = async (skill: LibrarySkill) => {
    setExportingSkillId(skill.id);
    try {
      await exportLibrarySkill(skill.id, skill.slug ?? skill.name);
    } catch {
      toast.error("Failed to export skill");
    } finally {
      setExportingSkillId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Library</h1>
          <p className="text-sm text-default-500 mt-0.5">
            Reusable agent templates, MCP servers, and skills.
          </p>
        </div>
        {activeTab === "agents" && (
          <Button
            color="primary"
            size="sm"
            onPress={() => {
              setEditingAgent(undefined);
              setFormOpen(true);
            }}
          >
            + New Agent
          </Button>
        )}
        {activeTab === "mcps" && (
          <Button
            color="primary"
            size="sm"
            onPress={() => {
              setEditingMcp(undefined);
              setMcpFormOpen(true);
            }}
          >
            + New MCP
          </Button>
        )}
        {activeTab === "skills" && (
          <Button
            color="primary"
            size="sm"
            onPress={() => {
              setEditingSkill(undefined);
              setSkillFormOpen(true);
            }}
          >
            + New Skill
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div role="tablist" aria-label="Library sections" className="clay-tab-bar flex border-b border-divider -mt-2">
        {(["agents", "mcps", "skills"] as LibraryTab[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-default-400 hover:text-foreground"
            }`}
          >
            {tab === "mcps" ? "MCPs" : tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "agents" && agentsFetched && (
              <span className="ml-1.5 text-xs text-default-400">({agents.length})</span>
            )}
            {tab === "mcps" && mcpsFetched && (
              <span className="ml-1.5 text-xs text-default-400">({mcps.length})</span>
            )}
            {tab === "skills" && skillsFetched && (
              <span className="ml-1.5 text-xs text-default-400">({skills.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Agents tab ── */}
      {activeTab === "agents" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Search agents…"
              value={agentSearch}
              onValueChange={setAgentSearch}
              isClearable
              onClear={() => setAgentSearch("")}
              startContent={SearchIcon}
            />
            <div className="flex flex-wrap gap-1.5">
              {ROLE_FILTERS.map((r) => (
                <Chip
                  key={r}
                  size="sm"
                  variant={agentRoleFilter === r ? "solid" : "flat"}
                  color={agentRoleFilter === r ? "primary" : "default"}
                  className="cursor-pointer"
                  onClick={() => setAgentRoleFilter(r)}
                >
                  {r}
                </Chip>
              ))}
            </div>
          </div>

          {agentsLoading ? (
            <div className="flex justify-center py-12">
              <Spinner label="Loading agents…" />
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-default-400 gap-2">
              <p>{agentsFetched ? "No agents found." : "Loading…"}</p>
              {(agentSearch || agentRoleFilter !== "all") && (
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => {
                    setAgentSearch("");
                    setAgentRoleFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <ViewModeBar
                mode={viewMode}
                onModeChange={(m) => { setViewMode(m); setAgentPage(1); }}
                page={agentPage}
                pageSize={agentPageSize}
                total={filteredAgents.length}
                onPageChange={setAgentPage}
                onPageSizeChange={(s) => { setAgentPageSize(s); setAgentPage(1); }}
              />

              {/* ── Grid ── */}
              {viewMode === "grid" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pagedAgents.map((agent) => (
                    <LibraryAgentCard
                      key={agent.id}
                      agent={agent}
                      onView={() => navigate(`/library/agents/${agent.id}`)}
                      onEdit={() => {
                        setEditingAgent(agent);
                        setFormOpen(true);
                      }}
                      onDelete={() => setAgentToDelete(agent)}
                      onClone={() => handleCloneAgent(agent)}
                    />
                  ))}
                </div>
              )}

              {/* ── List ── */}
              {viewMode === "list" && (
                <div className="clay-card overflow-hidden flex flex-col divide-y divide-default-100/60">
                  {pagedAgents.map((agent) => (
                    <div key={agent.id} className="clay-list-item flex items-center gap-3 px-4 py-3">
                      <Chip size="sm" variant="flat" color={ROLE_COLOR[agent.role] ?? "default"} className="shrink-0">
                        {agent.role}
                      </Chip>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block truncate">{agent.name}</span>
                        {agent.description && (
                          <span className="text-xs text-default-400 block truncate">{agent.description}</span>
                        )}
                      </div>
                      <div className="hidden sm:flex gap-1 flex-wrap max-w-xs shrink-0">
                        {agent.tags.slice(0, 3).map((t) => (
                          <Chip key={t} size="sm" variant="flat" className="text-xs">{t}</Chip>
                        ))}
                      </div>
                      <span className="text-xs text-default-400 shrink-0 hidden md:inline">{agent.usage_count} uses</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="bordered" onPress={() => navigate(`/library/agents/${agent.id}`)}>View</Button>
                        <Button size="sm" variant="bordered" onPress={() => handleCloneAgent(agent)}>Clone</Button>
                        {!agent.is_base && (
                          <>
                            <Button size="sm" variant="bordered" onPress={() => { setEditingAgent(agent); setFormOpen(true); }}>Edit</Button>
                            <Button size="sm" variant="light" color="danger" onPress={() => setAgentToDelete(agent)}>Delete</Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Table ── */}
              {viewMode === "table" && (
                <div className="clay-card overflow-hidden">
                <Table
                  aria-label="Agents table"
                  removeWrapper
                  classNames={{ th: "clay-table-th", tr: "clay-list-item border-b border-divider last:border-b-0" }}
                >
                  <TableHeader>
                    <TableColumn>NAME</TableColumn>
                    <TableColumn>ROLE</TableColumn>
                    <TableColumn>TAGS</TableColumn>
                    <TableColumn>MCP / SKILLS / SUBS</TableColumn>
                    <TableColumn>USAGE</TableColumn>
                    <TableColumn>{""}</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {pagedAgents.map((agent) => (
                      <TableRow key={agent.id} className="clay-list-item">
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{agent.name}</p>
                            {agent.description && (
                              <p className="text-xs text-default-400 line-clamp-1">{agent.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Chip size="sm" variant="flat" color={ROLE_COLOR[agent.role] ?? "default"}>
                            {agent.role}
                          </Chip>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {agent.tags.slice(0, 3).map((t) => (
                              <Chip key={t} size="sm" variant="flat" className="text-xs">{t}</Chip>
                            ))}
                            {agent.tags.length > 3 && (
                              <Chip size="sm" variant="flat" className="text-xs text-default-400">+{agent.tags.length - 3}</Chip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {agent.mcp_servers.length > 0 && (
                              <Chip size="sm" variant="bordered">🔌 {agent.mcp_servers.length}</Chip>
                            )}
                            {agent.skills.length > 0 && (
                              <Chip size="sm" variant="bordered">⚡ {agent.skills.length}</Chip>
                            )}
                            {agent.sub_agents.length > 0 && (
                              <Chip size="sm" variant="bordered" color="secondary">🤝 {agent.sub_agents.length}</Chip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-default-500">{agent.usage_count}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="bordered" onPress={() => navigate(`/library/agents/${agent.id}`)}>View</Button>
                            <Button size="sm" variant="bordered" onPress={() => handleCloneAgent(agent)}>Clone</Button>
                            {!agent.is_base && (
                              <>
                                <Button size="sm" variant="bordered" onPress={() => { setEditingAgent(agent); setFormOpen(true); }}>Edit</Button>
                                <Button size="sm" variant="light" color="danger" onPress={() => setAgentToDelete(agent)}>Delete</Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── MCPs tab ── */}
      {activeTab === "mcps" && (
        <div className="flex flex-col gap-4">
          <Input
            placeholder="Search MCP servers…"
            value={mcpSearch}
            onValueChange={setMcpSearch}
            isClearable
            onClear={() => setMcpSearch("")}
            startContent={SearchIcon}
          />
          {mcpsLoading ? (
            <div className="flex justify-center py-12">
              <Spinner label="Loading MCP servers…" />
            </div>
          ) : filteredMcps.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-default-400">
              <p>{mcpsFetched ? "No MCP servers found." : "Loading…"}</p>
            </div>
          ) : (
            <>
              <ViewModeBar
                mode={viewMode}
                onModeChange={(m) => { setViewMode(m); setMcpPage(1); }}
                page={mcpPage}
                pageSize={mcpPageSize}
                total={filteredMcps.length}
                onPageChange={setMcpPage}
                onPageSizeChange={(s) => { setMcpPageSize(s); setMcpPage(1); }}
              />

              {/* ── Grid ── */}
              {viewMode === "grid" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pagedMcps.map((mcp) => (
                    <div key={mcp.id} className="flex flex-col gap-2 p-4 clay-card">
                      <div className="flex items-start gap-2 min-w-0">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{mcp.name}</p>
                        </div>
                        <Chip size="sm" variant="flat" className="font-mono shrink-0">{mcp.transport}</Chip>
                      </div>
                      {(mcp.command || mcp.url) && (
                        <p className="text-xs text-default-400 font-mono truncate">{mcp.command ?? mcp.url}</p>
                      )}
                      {mcp.description && (
                        <p className="text-xs text-default-500 line-clamp-2">{mcp.description}</p>
                      )}
                      {mcp.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {mcp.tags.map((t) => (
                            <Chip key={t} size="sm" variant="flat" className="text-xs">{t}</Chip>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1 border-t border-divider">
                        <span className="text-xs text-default-400 flex-1">{mcp.usage_count} uses</span>
                        <Button size="sm" variant="light" onPress={() => { setEditingMcp(mcp); setMcpFormOpen(true); }}>Edit</Button>
                        <Button size="sm" variant="light" color="danger" onPress={() => setMcpToDelete(mcp)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── List ── */}
              {viewMode === "list" && (
                <div className="clay-card overflow-hidden flex flex-col divide-y divide-default-100/60">
                  {pagedMcps.map((mcp) => (
                    <div key={mcp.id} className="clay-list-item flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block truncate">{mcp.name}</span>
                        {(mcp.command || mcp.url) && (
                          <span className="text-xs font-mono text-default-400 block truncate">{mcp.command ?? mcp.url}</span>
                        )}
                        {mcp.description && (
                          <span className="text-xs text-default-400 block truncate">{mcp.description}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {mcp.tags.slice(0, 2).map((t) => (
                          <Chip key={t} size="sm" variant="flat" className="text-xs hidden sm:flex">{t}</Chip>
                        ))}
                        <Chip size="sm" variant="flat" className="font-mono shrink-0">{mcp.transport}</Chip>
                        <span className="text-xs text-default-400 hidden md:inline">{mcp.usage_count} uses</span>
                        <Button size="sm" variant="bordered" onPress={() => { setEditingMcp(mcp); setMcpFormOpen(true); }}>Edit</Button>
                        <Button size="sm" variant="light" color="danger" onPress={() => setMcpToDelete(mcp)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Table ── */}
              {viewMode === "table" && (
                <div className="clay-card overflow-hidden">
                <Table
                  aria-label="MCP servers table"
                  removeWrapper
                  classNames={{ th: "clay-table-th", tr: "clay-list-item border-b border-divider last:border-b-0" }}
                >
                  <TableHeader>
                    <TableColumn>NAME</TableColumn>
                    <TableColumn>TRANSPORT</TableColumn>
                    <TableColumn>COMMAND / URL</TableColumn>
                    <TableColumn>TAGS</TableColumn>
                    <TableColumn>USAGE</TableColumn>
                    <TableColumn>{""}</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {pagedMcps.map((mcp) => (
                      <TableRow key={mcp.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{mcp.name}</p>
                            {mcp.description && (
                              <p className="text-xs text-default-400 line-clamp-1">{mcp.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Chip size="sm" variant="flat" className="font-mono">{mcp.transport}</Chip>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-default-500 line-clamp-1">{mcp.command ?? mcp.url ?? "—"}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {mcp.tags.slice(0, 3).map((t) => (
                              <Chip key={t} size="sm" variant="flat" className="text-xs">{t}</Chip>
                            ))}
                            {mcp.tags.length > 3 && (
                              <Chip size="sm" variant="flat" className="text-xs text-default-400">+{mcp.tags.length - 3}</Chip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-default-500">{mcp.usage_count}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="bordered" onPress={() => { setEditingMcp(mcp); setMcpFormOpen(true); }}>Edit</Button>
                            <Button size="sm" variant="light" color="danger" onPress={() => setMcpToDelete(mcp)}>Delete</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Skills tab ── */}
      {activeTab === "skills" && (
        <div className="flex flex-col gap-4">
          <Input
            placeholder="Search skills…"
            value={skillSearch}
            onValueChange={setSkillSearch}
            isClearable
            onClear={() => setSkillSearch("")}
            startContent={SearchIcon}
          />
          {skillsLoading ? (
            <div className="flex justify-center py-12">
              <Spinner label="Loading skills…" />
            </div>
          ) : filteredSkills.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-default-400 gap-2">
              {skillsFetched ? (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-10 h-10 text-default-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                  <p className="text-sm font-medium text-default-500">
                    {skillSearch ? "No skills match your search." : "No skills yet."}
                  </p>
                  {skillSearch ? (
                    <Button size="sm" variant="flat" onPress={() => setSkillSearch("")}>
                      Clear search
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      color="primary"
                      variant="flat"
                      onPress={() => {
                        setEditingSkill(undefined);
                        setSkillFormOpen(true);
                      }}
                    >
                      + New Skill
                    </Button>
                  )}
                </>
              ) : (
                <p>Loading…</p>
              )}
            </div>
          ) : (
            <>
              <ViewModeBar
                mode={viewMode}
                onModeChange={(m) => { setViewMode(m); setSkillPage(1); }}
                page={skillPage}
                pageSize={skillPageSize}
                total={filteredSkills.length}
                onPageChange={setSkillPage}
                onPageSizeChange={(s) => { setSkillPageSize(s); setSkillPage(1); }}
              />

              {/* ── Grid ── */}
              {viewMode === "grid" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pagedSkills.map((skill) => (
                    <div key={skill.id} className="flex flex-col gap-2 p-4 clay-card">
                      <p className="font-semibold text-sm truncate">{skill.name}</p>
                      {skill.description && (
                        <p className="text-xs text-default-500 line-clamp-2">{skill.description}</p>
                      )}
                      {skill.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {skill.tags.map((t) => (
                            <Chip key={t} size="sm" variant="flat" className="text-xs">{t}</Chip>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1 border-t border-divider text-xs text-default-400">
                        <span className="flex-1">{skill.usage_count} uses</span>
                        <span>v{skill.version}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="light"
                          isLoading={exportingSkillId === skill.id}
                          isDisabled={!!exportingSkillId}
                          onPress={() => handleExportSkill(skill)}
                        >
                          Download
                        </Button>
                        <Button size="sm" variant="light" onPress={() => { setEditingSkill(skill); setSkillFormOpen(true); }}>Edit</Button>
                        <Button size="sm" variant="light" color="danger" onPress={() => setSkillToDelete(skill)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── List ── */}
              {viewMode === "list" && (
                <div className="clay-card overflow-hidden flex flex-col divide-y divide-default-100/60">
                  {pagedSkills.map((skill) => (
                    <div key={skill.id} className="clay-list-item flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm block truncate">{skill.name}</span>
                        {skill.description && (
                          <span className="text-xs text-default-400 block truncate">{skill.description}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {skill.tags.slice(0, 2).map((t) => (
                          <Chip key={t} size="sm" variant="flat" className="text-xs hidden sm:flex">{t}</Chip>
                        ))}
                        <span className="text-xs text-default-400 hidden md:inline">v{skill.version}</span>
                        <span className="text-xs text-default-400">{skill.usage_count} uses</span>
                        <Button size="sm" variant="light" isLoading={exportingSkillId === skill.id} isDisabled={!!exportingSkillId} onPress={() => handleExportSkill(skill)}>Download</Button>
                        <Button size="sm" variant="bordered" onPress={() => { setEditingSkill(skill); setSkillFormOpen(true); }}>Edit</Button>
                        <Button size="sm" variant="light" color="danger" onPress={() => setSkillToDelete(skill)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Table ── */}
              {viewMode === "table" && (
                <div className="clay-card overflow-hidden">
                <Table
                  aria-label="Skills table"
                  removeWrapper
                  classNames={{ th: "clay-table-th", tr: "clay-list-item border-b border-divider last:border-b-0" }}
                >
                  <TableHeader>
                    <TableColumn>NAME</TableColumn>
                    <TableColumn>TAGS</TableColumn>
                    <TableColumn>VERSION</TableColumn>
                    <TableColumn>USAGE</TableColumn>
                    <TableColumn>{""}</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {pagedSkills.map((skill) => (
                      <TableRow key={skill.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{skill.name}</p>
                            {skill.description && (
                              <p className="text-xs text-default-400 line-clamp-1">{skill.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {skill.tags.slice(0, 3).map((t) => (
                              <Chip key={t} size="sm" variant="flat" className="text-xs">{t}</Chip>
                            ))}
                            {skill.tags.length > 3 && (
                              <Chip size="sm" variant="flat" className="text-xs text-default-400">+{skill.tags.length - 3}</Chip>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-default-500">v{skill.version}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-default-500">{skill.usage_count}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="sm" variant="bordered" isLoading={exportingSkillId === skill.id} isDisabled={!!exportingSkillId} onPress={() => handleExportSkill(skill)}>Download</Button>
                            <Button size="sm" variant="bordered" onPress={() => { setEditingSkill(skill); setSkillFormOpen(true); }}>Edit</Button>
                            <Button size="sm" variant="light" color="danger" onPress={() => setSkillToDelete(skill)}>Delete</Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Create / Edit Agent modal ── */}
      <Modal
        isOpen={formOpen}
        onOpenChange={() => setFormOpen((v) => !v)}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{editingAgent ? "Edit Agent" : "New Agent"}</ModalHeader>
              <ModalBody className="pb-6">
                <LibraryAgentForm
                  initialData={editingAgent}
                  onSaved={(saved) => {
                    setAgents((prev) => {
                      const exists = prev.find((a) => a.id === saved.id);
                      return exists
                        ? prev.map((a) => (a.id === saved.id ? saved : a))
                        : [...prev, saved];
                    });
                    setFormOpen(false);
                    setEditingAgent(undefined);
                  }}
                  onCancel={() => {
                    setFormOpen(false);
                    setEditingAgent(undefined);
                  }}
                />
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Delete Agent confirmation ── */}
      <ConfirmModal
        isOpen={!!agentToDelete}
        onOpenChange={() => setAgentToDelete(null)}
        title="Delete Agent"
        message={`Delete "${agentToDelete?.name ?? "this agent"}" from the library? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteAgent}
        isLoading={deleting}
      />

      {/* ── Create / Edit MCP modal ── */}
      <Modal
        isOpen={mcpFormOpen}
        onOpenChange={() => setMcpFormOpen((v) => !v)}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{editingMcp ? "Edit MCP Server" : "New MCP Server"}</ModalHeader>
              <ModalBody className="pb-6">
                <LibraryMCPForm
                  initialData={editingMcp}
                  onSaved={(saved) => {
                    setMcps((prev) => {
                      const exists = prev.find((m) => m.id === saved.id);
                      return exists
                        ? prev.map((m) => (m.id === saved.id ? saved : m))
                        : [...prev, saved];
                    });
                    setMcpFormOpen(false);
                    setEditingMcp(undefined);
                  }}
                  onCancel={() => {
                    setMcpFormOpen(false);
                    setEditingMcp(undefined);
                  }}
                />
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Delete MCP confirmation ── */}
      <ConfirmModal
        isOpen={!!mcpToDelete}
        onOpenChange={() => setMcpToDelete(null)}
        title="Delete MCP Server"
        message={`Delete "${mcpToDelete?.name ?? "this MCP server"}" from the library? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteMcp}
        isLoading={deletingMcp}
      />

      {/* ── Create / Edit Skill modal ── */}
      <Modal
        isOpen={skillFormOpen}
        onOpenChange={() => setSkillFormOpen((v) => !v)}
        size="3xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>
                {editingSkill ? `Edit Skill: ${editingSkill.name}` : "New Skill"}
              </ModalHeader>
              <ModalBody className="pb-6">
                <LibrarySkillForm
                  initialData={editingSkill}
                  onSaved={(saved) => {
                    setSkills((prev) => {
                      const exists = prev.find((s) => s.id === saved.id);
                      return exists
                        ? prev.map((s) => (s.id === saved.id ? saved : s))
                        : [...prev, saved];
                    });
                    setSkillFormOpen(false);
                    setEditingSkill(undefined);
                  }}
                  onCancel={() => {
                    setSkillFormOpen(false);
                    setEditingSkill(undefined);
                  }}
                />
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Delete Skill confirmation ── */}
      <ConfirmModal
        isOpen={!!skillToDelete}
        onOpenChange={() => setSkillToDelete(null)}
        title="Delete Skill"
        message={`Delete "${skillToDelete?.name ?? "this skill"}" from the library? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteSkill}
        isLoading={deletingSkill}
      />
    </div>
  );
}
