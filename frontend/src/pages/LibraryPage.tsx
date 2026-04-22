import { useEffect, useState } from "react";
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
} from "@heroui/react";

const SearchIcon = (
  <svg
    className="w-4 h-4 text-default-400"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden="true"
  >
    <path
      fillRule="evenodd"
      d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
      clipRule="evenodd"
    />
  </svg>
);
import {
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

type LibraryTab = "agents" | "mcps" | "skills";

const ROLE_FILTERS: Array<AgentRole | "all"> = [
  "all",
  "planner",
  "coder",
  "reviewer",
  "tester",
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
  const filteredAgents = agents.filter((a) => {
    const matchesRole = agentRoleFilter === "all" || a.role === agentRoleFilter;
    const q = agentSearch.toLowerCase();
    const matchesSearch =
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q));
    return matchesRole && matchesSearch;
  });

  // Filtered MCPs
  const filteredMcps = mcps.filter((m) => {
    const q = mcpSearch.toLowerCase();
    return !q || m.name.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q);
  });

  // Filtered Skills
  const filteredSkills = skills.filter((s) => {
    const q = skillSearch.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q);
  });

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
      <div role="tablist" aria-label="Library sections" className="flex border-b border-divider -mt-2">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAgents.map((agent) => (
                <LibraryAgentCard
                  key={agent.id}
                  agent={agent}
                  onView={() => navigate(`/library/agents/${agent.id}`)}
                  onEdit={() => {
                    setEditingAgent(agent);
                    setFormOpen(true);
                  }}
                  onDelete={() => setAgentToDelete(agent)}
                />
              ))}
            </div>
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
            <div className="flex flex-col gap-3">
              {filteredMcps.map((mcp) => (
                <div
                  key={mcp.id}
                  className="flex flex-col gap-1 p-4 rounded-xl border border-divider"
                >
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                    <p className="font-semibold text-sm flex-1 min-w-0 truncate">{mcp.name}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Chip size="sm" variant="flat" className="font-mono">
                        {mcp.command}
                      </Chip>
                      <span className="text-xs text-default-400">{mcp.usage_count} uses</span>
                      <Button
                        size="sm"
                        variant="light"
                        onPress={() => {
                          setEditingMcp(mcp);
                          setMcpFormOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="light"
                        color="danger"
                        onPress={() => setMcpToDelete(mcp)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {mcp.description && (
                    <p className="text-xs text-default-500">{mcp.description}</p>
                  )}
                  {mcp.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {mcp.tags.map((t) => (
                        <Chip key={t} size="sm" variant="flat" className="text-xs">
                          {t}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
            <div className="flex flex-col gap-3">
              {filteredSkills.map((skill) => (
                <div
                  key={skill.id}
                  className="flex flex-col gap-1 p-4 rounded-xl border border-divider"
                >
                  <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                     <p className="font-semibold text-sm flex-1 min-w-0 truncate">{skill.name}</p>
                     <div className="flex items-center gap-2 flex-wrap">
                       <span className="text-xs text-default-400">{skill.usage_count} uses</span>
                       <Button
                         size="sm"
                         variant="light"
                         isLoading={exportingSkillId === skill.id}
                         isDisabled={!!exportingSkillId}
                         onPress={() => handleExportSkill(skill)}
                       >
                         Download
                       </Button>
                       <Button
                         size="sm"
                         variant="light"
                         onPress={() => {
                           setEditingSkill(skill);
                           setSkillFormOpen(true);
                         }}
                       >
                         Edit
                       </Button>
                       <Button
                         size="sm"
                         variant="light"
                         color="danger"
                         onPress={() => setSkillToDelete(skill)}
                       >
                         Delete
                       </Button>
                     </div>
                   </div>
                  {skill.description && (
                    <p className="text-xs text-default-500">{skill.description}</p>
                  )}
                  {skill.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {skill.tags.map((t) => (
                        <Chip key={t} size="sm" variant="flat" className="text-xs">
                          {t}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
