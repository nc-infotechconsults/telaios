import { useEffect, useState } from "react";
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
} from "@heroui/react";
import { getAgentProfiles, deleteAgentProfile } from "../lib/api";
import type { AgentProfile } from "../types";
import AgentProfileForm from "../components/agents/AgentProfileForm";

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

export default function AgentProfiles() {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AgentProfile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const load = () => {
    setLoading(true);
    getAgentProfiles()
      .then(setProfiles)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleEdit = (profile: AgentProfile) => {
    setEditing(profile);
    setIsNew(false);
    onOpen();
  };

  const handleNew = () => {
    setEditing(null);
    setIsNew(true);
    onOpen();
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete agent profile "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteAgentProfile(id);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaved = () => {
    onOpenChange();
    load();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Agent Profiles</h1>
          <p className="text-default-400 text-sm mt-1">
            Configure AI coding agents with LLM, tools, and skills
          </p>
        </div>
        <Button color="primary" onPress={handleNew}>
          + New Profile
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <Spinner label="Loading profiles…" />
        </div>
      )}

      {!loading && profiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="text-6xl">🤖</div>
          <div>
            <p className="text-xl font-semibold">No agent profiles yet</p>
            <p className="text-default-400 text-sm mt-1 max-w-sm">
              Create agent profiles to define how coding tasks are executed.
              Each profile can use a different LLM, tools, and skills.
            </p>
          </div>
          <Button color="primary" onPress={handleNew}>
            Create First Profile
          </Button>
        </div>
      )}

      {!loading && profiles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((p) => (
            <Card key={p.id} className="border border-divider hover:border-default/60 transition-colors">
              <CardBody className="p-5 space-y-3">
                {/* Name + type */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-base leading-tight truncate">{p.name}</h3>
                  </div>
                  <Chip size="sm" color={TYPE_COLOR[p.agent_type]} variant="flat" className="shrink-0">
                    {TYPE_LABEL[p.agent_type]}
                  </Chip>
                </div>

                {/* Description */}
                <p className="text-sm text-default-500 line-clamp-2 leading-relaxed">
                  {p.description || <span className="italic text-default-300">No description</span>}
                </p>

                {/* LLM info */}
                {p.llm_model && (
                  <div className="flex items-center gap-1.5 text-xs text-default-400">
                    <span>🧠</span>
                    <span>{p.llm_provider} / {p.llm_model}</span>
                  </div>
                )}

                {/* Badges */}
                <div className="flex gap-1.5 flex-wrap">
                  {p.mcp_servers.length > 0 && (
                    <Chip size="sm" variant="bordered">
                      🔌 {p.mcp_servers.length} MCP
                    </Chip>
                  )}
                  {p.skills.length > 0 && (
                    <Chip size="sm" variant="bordered">
                      ⚡ {p.skills.length} skill{p.skills.length > 1 ? "s" : ""}
                    </Chip>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1 border-t border-divider">
                  <Button
                    size="sm"
                    variant="light"
                    className="flex-1"
                    onPress={() => handleEdit(p)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="light"
                    color="danger"
                    className="flex-1"
                    isLoading={deletingId === p.id}
                    onPress={() => handleDelete(p.id, p.name)}
                  >
                    Delete
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="3xl" scrollBehavior="inside">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <span>{isNew ? "New Agent Profile" : "Edit Agent Profile"}</span>
                <span className="text-sm text-default-400 font-normal">
                  {isNew
                    ? "Configure the LLM, tools, and skills for this agent"
                    : `Editing: ${editing?.name}`}
                </span>
              </ModalHeader>
              <ModalBody className="pb-2">
                <AgentProfileForm
                  initialData={editing ?? undefined}
                  onSaved={handleSaved}
                  onCancel={onClose}
                />
              </ModalBody>
              <ModalFooter className="pt-0" />
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
