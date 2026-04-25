import { useEffect, useState } from "react";
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
import { cloneProjectAgentFromLibrary, listLibraryAgents } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { AgentRole, LibraryAgent, ProjectAgent } from "../../types";
import LibraryAgentCard from "./LibraryAgentCard";

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

interface Props {
  isOpen: boolean;
  onOpenChange: () => void;
  projectId: string;
  onAdded: (agent: ProjectAgent) => void;
}

/**
 * Searchable modal for browsing library agents and cloning one into a project.
 */
export default function LibraryBrowserModal({
  isOpen,
  onOpenChange,
  projectId,
  onAdded,
}: Props) {
  const [agents, setAgents] = useState<LibraryAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AgentRole | "all">("all");
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    listLibraryAgents()
      .then(setAgents)
      .catch(() => toast.error("Failed to load library"))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const filtered = agents.filter((a) => {
    const matchesRole = roleFilter === "all" || a.role === roleFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      a.name.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.tags.some((t) => t.toLowerCase().includes(q));
    return matchesRole && matchesSearch;
  });

  const handleAdd = async (agent: LibraryAgent) => {
    if (!projectId) return;
    setAddingId(agent.id);
    try {
      const created = await cloneProjectAgentFromLibrary(projectId, agent.id);
      toast.success("Agent added", agent.name);
      onAdded(created);
      onOpenChange();
    } catch {
      toast.error("Failed to add agent");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="3xl"
      scrollBehavior="inside"
    >
      <ModalContent>
        {() => (
          <>
            <ModalHeader>Agent Library</ModalHeader>
            <ModalBody className="pb-6">
              {/* Search */}
              <Input
                autoFocus
                placeholder="Search agents…"
                value={search}
                onValueChange={setSearch}
                isClearable
                onClear={() => setSearch("")}
                startContent={
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
                }
              />

              {/* Role filter chips */}
              <div className="flex flex-wrap gap-1.5 mt-1">
                {ROLE_FILTERS.map((r) => (
                  <Chip
                    key={r}
                    size="sm"
                    variant={roleFilter === r ? "solid" : "flat"}
                    color={roleFilter === r ? "primary" : "default"}
                    className="cursor-pointer"
                    onClick={() => setRoleFilter(r)}
                  >
                    {r}
                  </Chip>
                ))}
              </div>

              {/* Content */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <Spinner label="Loading library…" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-default-400 gap-2">
                  <p>No agents found.</p>
                  {(search || roleFilter !== "all") && (
                    <Button
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        setSearch("");
                        setRoleFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                  {filtered.map((agent) => (
                    <LibraryAgentCard
                      key={agent.id}
                      agent={agent}
                      adding={addingId === agent.id}
                      onAddToProject={() => handleAdd(agent)}
                    />
                  ))}
                </div>
              )}
            </ModalBody>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
