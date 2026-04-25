import { useEffect, useState, useMemo } from "react";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
  useDisclosure,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";
import { getAgentProfiles, deleteAgentProfile } from "../lib/api";
import { toast } from "../lib/toast";
import type { AgentProfile } from "../types";
import AgentProfileForm from "../components/agents/AgentProfileForm";
import AgentProfileDetail from "../components/agents/AgentProfileDetail";
import ConfirmModal from "../components/common/ConfirmModal";
import ViewModeBar, { type ViewMode, type PageSize } from "../components/common/ViewModeBar";

const TYPE_COLOR: Record<AgentProfile["agent_type"], "primary" | "secondary" | "success"> = {
  langgraph: "primary",
  opencode: "secondary",
  "github-copilot": "success",
};

const TYPE_LABEL: Record<AgentProfile["agent_type"], string> = {
  langgraph: "LangGraph",
  opencode: "OpenCode",
  "github-copilot": "GitHub Copilot",
};

type ModalMode = "edit" | "view" | null;

export default function AgentProfiles() {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<AgentProfile | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [isNew, setIsNew] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentProfile | null>(null);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();

  // View mode + pagination
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(10);

  const load = () => {
    setLoading(true);
    getAgentProfiles().then(setProfiles).catch(() => toast.error("Failed to load agent profiles")).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const pagedProfiles = useMemo(() => {
    const start = (page - 1) * pageSize;
    return profiles.slice(start, start + pageSize);
  }, [profiles, page, pageSize]);

  const handleView = (profile: AgentProfile) => { setSelectedProfile(profile); setModalMode("view"); onOpen(); };
  const handleEdit = (profile: AgentProfile) => { setSelectedProfile(profile); setModalMode("edit"); setIsNew(false); onOpen(); };
  const handleNew = () => { setSelectedProfile(null); setModalMode("edit"); setIsNew(true); onOpen(); };
  const handleDelete = (profile: AgentProfile) => { setDeleteTarget(profile); onDeleteOpen(); };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeletingId(deleteTarget.id);
    try {
      await deleteAgentProfile(deleteTarget.id);
      setProfiles((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success("Agent profile deleted", `"${deleteTarget.name}" has been removed`);
      setDeleteTarget(null);
      onDeleteOpenChange();
    } catch {
      toast.error("Failed to delete agent profile");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaved = (isEdit: boolean) => {
    toast.success(isEdit ? "Agent profile updated" : "Agent profile created");
    onOpenChange();
    load();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Agent Profiles</h1>
          <p className="text-default-400 text-sm mt-1">Configure AI coding agents with LLM, tools, and skills</p>
        </div>
        <Button color="primary" onPress={handleNew}>+ New Profile</Button>
      </div>

      {loading && (
        <div className="flex justify-center py-16"><Spinner label="Loading profiles…" /></div>
      )}

      {!loading && profiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="text-6xl">🤖</div>
          <div>
            <p className="text-xl font-semibold">No agent profiles yet</p>
            <p className="text-default-400 text-sm mt-1 max-w-sm">
              Create agent profiles to define how coding tasks are executed.
            </p>
          </div>
          <Button color="primary" onPress={handleNew}>Create First Profile</Button>
        </div>
      )}

      {!loading && profiles.length > 0 && (
        <>
          <ViewModeBar
            mode={viewMode}
            onModeChange={setViewMode}
            page={page}
            pageSize={pageSize}
            total={profiles.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />

          {/* ── Grid ── */}
          {viewMode === "grid" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pagedProfiles.map((p) => (
                <Card key={p.id} className="clay-card transition-shadow">
                  <CardBody className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-base leading-tight truncate">{p.name}</h3>
                      </div>
                      <Chip size="sm" color={TYPE_COLOR[p.agent_type]} variant="flat" className="shrink-0">
                        {TYPE_LABEL[p.agent_type]}
                      </Chip>
                    </div>
                    <p className="text-sm text-default-500 line-clamp-2 leading-relaxed">
                      {p.description || <span className="italic text-default-300">No description</span>}
                    </p>
                    {p.llm_model && (
                      <div className="flex items-center gap-1.5 text-xs text-default-400">
                        <span>🧠</span>
                        <span>{p.llm_provider} / {p.llm_model}</span>
                      </div>
                    )}
                    <div className="flex gap-1.5 flex-wrap">
                      {p.mcp_servers.length > 0 && (
                        <Chip size="sm" variant="bordered">🔌 {p.mcp_servers.length} MCP</Chip>
                      )}
                      {p.skills.length > 0 && (
                        <Chip size="sm" variant="bordered">⚡ {p.skills.length} skill{p.skills.length > 1 ? "s" : ""}</Chip>
                      )}
                      {(p.sub_agent_ids?.length ?? 0) > 0 && (
                        <Chip size="sm" variant="bordered" color="secondary">🤝 {p.sub_agent_ids!.length} sub</Chip>
                      )}
                      {p.system_prompt && (
                        <Chip size="sm" variant="bordered" color="default" title={p.system_prompt}>💬 prompt</Chip>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1 border-t border-divider">
                      <Button size="sm" variant="light" className="flex-1" aria-label={`View ${p.name}`} onPress={() => handleView(p)}>View</Button>
                      <Button size="sm" variant="light" className="flex-1" aria-label={`Edit ${p.name}`} onPress={() => handleEdit(p)}>Edit</Button>
                      <Button size="sm" variant="light" color="danger" className="flex-1" aria-label={`Delete ${p.name}`} isLoading={deletingId === p.id} onPress={() => handleDelete(p)}>Delete</Button>
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}

          {/* ── List ── */}
          {viewMode === "list" && (
            <div className="clay-card overflow-hidden flex flex-col divide-y divide-default-100/60">
              {pagedProfiles.map((p) => (
                <div key={p.id} className="clay-list-item flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-sm block truncate">{p.name}</span>
                    {p.description && (
                      <span className="text-xs text-default-400 block truncate">{p.description}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {p.llm_model && (
                      <span className="text-xs text-default-400 hidden sm:block">🧠 {p.llm_model}</span>
                    )}
                    {p.mcp_servers.length > 0 && (
                      <span className="text-xs text-default-400">🔌 {p.mcp_servers.length}</span>
                    )}
                    {p.skills.length > 0 && (
                      <span className="text-xs text-default-400">⚡ {p.skills.length}</span>
                    )}
                    {(p.sub_agent_ids?.length ?? 0) > 0 && (
                      <span className="text-xs text-default-400">🤝 {p.sub_agent_ids!.length}</span>
                    )}
                    {p.system_prompt && (
                      <span className="text-xs text-default-400" title={p.system_prompt}>💬</span>
                    )}
                    <Chip size="sm" color={TYPE_COLOR[p.agent_type]} variant="flat">
                      {TYPE_LABEL[p.agent_type]}
                    </Chip>
                    <Button size="sm" variant="bordered" onPress={() => handleView(p)}>View</Button>
                    <Button size="sm" variant="bordered" onPress={() => handleEdit(p)}>Edit</Button>
                    <Button size="sm" variant="light" color="danger" isLoading={deletingId === p.id} onPress={() => handleDelete(p)}>Delete</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Table ── */}
          {viewMode === "table" && (
            <Table aria-label="Agent profiles table" removeWrapper>
              <TableHeader>
                <TableColumn>NAME</TableColumn>
                <TableColumn>TYPE</TableColumn>
                <TableColumn>LLM</TableColumn>
                <TableColumn>TOOLS</TableColumn>
                <TableColumn>{""}</TableColumn>
              </TableHeader>
              <TableBody>
                {pagedProfiles.map((p) => (
                  <TableRow key={p.id} className="clay-list-item">
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{p.name}</p>
                        {p.description && (
                          <p className="text-xs text-default-400 line-clamp-1">{p.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" color={TYPE_COLOR[p.agent_type]} variant="flat">
                        {TYPE_LABEL[p.agent_type]}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      {p.llm_model ? (
                        <span className="text-xs text-default-500">{p.llm_provider} / {p.llm_model}</span>
                      ) : (
                        <span className="text-xs text-default-400 italic">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {p.mcp_servers.length > 0 && (
                          <Chip size="sm" variant="bordered">🔌 {p.mcp_servers.length} MCP</Chip>
                        )}
                        {p.skills.length > 0 && (
                          <Chip size="sm" variant="bordered">⚡ {p.skills.length}</Chip>
                        )}
                        {(p.sub_agent_ids?.length ?? 0) > 0 && (
                          <Chip size="sm" variant="bordered" color="secondary">🤝 {p.sub_agent_ids!.length}</Chip>
                        )}
                        {p.system_prompt && (
                          <Chip size="sm" variant="bordered" title={p.system_prompt}>💬</Chip>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="bordered" onPress={() => handleView(p)}>View</Button>
                        <Button size="sm" variant="bordered" onPress={() => handleEdit(p)}>Edit</Button>
                        <Button size="sm" variant="light" color="danger" isLoading={deletingId === p.id} onPress={() => handleDelete(p)}>Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl" scrollBehavior="inside">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                {modalMode === "view" ? (
                  <span>Agent Profile Details</span>
                ) : (
                  <>
                    <span>{isNew ? "New Agent Profile" : "Edit Agent Profile"}</span>
                    <span className="text-sm text-default-400 font-normal">
                      {isNew ? "Configure the LLM, tools, and skills for this agent" : `Editing: ${selectedProfile?.name}`}
                    </span>
                  </>
                )}
              </ModalHeader>
              <ModalBody className="pb-2">
                {modalMode === "view" && selectedProfile ? (
                  <AgentProfileDetail profile={selectedProfile} allProfiles={profiles} />
                ) : (
                  <AgentProfileForm initialData={selectedProfile ?? undefined} onSaved={() => handleSaved(!!selectedProfile)} onCancel={onClose} />
                )}
              </ModalBody>
              <ModalFooter className="pt-0">
                {modalMode === "view" && (
                  <Button variant="bordered" onPress={() => { setModalMode("edit"); setIsNew(false); }}>
                    Edit
                  </Button>
                )}
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <ConfirmModal
        isOpen={isDeleteOpen}
        onOpenChange={onDeleteOpenChange}
        title="Delete Agent Profile"
        message={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        isLoading={!!deletingId}
      />
    </div>
  );
}
