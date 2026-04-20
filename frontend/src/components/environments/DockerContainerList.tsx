import { useEffect, useState, useCallback } from "react";
import {
  Button,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Tooltip,
  useDisclosure,
} from "@heroui/react";
import {
  listDockerContainers,
  startDockerContainer,
  stopDockerContainer,
  restartDockerContainer,
  removeDockerContainer,
  getDockerContainerLogs,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerContainer, DockerContainerState } from "../../types";
import DockerContainerDetail from "./DockerContainerDetail";
import DockerCreateContainerModal from "./DockerCreateContainerModal";

interface Props {
  environmentId: string;
}

const STATE_COLOR: Record<DockerContainerState, "success" | "warning" | "danger" | "default"> = {
  running: "success",
  restarting: "warning",
  paused: "warning",
  created: "default",
  exited: "danger",
  dead: "danger",
};

export default function DockerContainerList({ environmentId }: Props) {
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Log viewer state
  const [logContainerId, setLogContainerId] = useState<string | null>(null);
  const [logContent, setLogContent] = useState("");
  const [logLoading, setLogLoading] = useState(false);
  const { isOpen: isLogOpen, onOpen: onLogOpen, onOpenChange: onLogOpenChange } = useDisclosure();

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<DockerContainer | null>(null);
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();

  // Create container
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onOpenChange: onCreateOpenChange } = useDisclosure();

  const loadContainers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listDockerContainers(environmentId);
      setContainers(data);
    } catch {
      toast.error("Failed to load containers");
      setContainers([]);
    } finally {
      setLoading(false);
    }
  }, [environmentId]);

  useEffect(() => {
    loadContainers();
  }, [loadContainers]);

  const handleAction = async (containerId: string, action: "start" | "stop" | "restart") => {
    setActionLoading(containerId);
    try {
      if (action === "start") await startDockerContainer(environmentId, containerId);
      else if (action === "stop") await stopDockerContainer(environmentId, containerId);
      else await restartDockerContainer(environmentId, containerId);
      toast.success(`Container ${action}ed`);
      await loadContainers();
    } catch {
      toast.error(`Failed to ${action} container`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemove = async () => {
    if (!deleteTarget) return;
    setActionLoading(deleteTarget.id);
    try {
      await removeDockerContainer(environmentId, deleteTarget.id);
      toast.success("Container removed", deleteTarget.name);
      setDeleteTarget(null);
      await loadContainers();
    } catch {
      toast.error("Failed to remove container");
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewLogs = async (containerId: string) => {
    setLogContainerId(containerId);
    setLogContent("");
    setLogLoading(true);
    onLogOpen();
    try {
      const logs = await getDockerContainerLogs(environmentId, containerId);
      setLogContent(logs);
    } catch {
      setLogContent("Failed to load logs.");
    } finally {
      setLogLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" label="Loading containers…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-default-500">{containers.length} container{containers.length !== 1 ? "s" : ""}</p>
        <div className="flex gap-2">
          <Button size="sm" color="primary" variant="flat" onPress={onCreateOpen}>
            Create
          </Button>
          <Button size="sm" variant="flat" onPress={loadContainers}>
            Refresh
          </Button>
        </div>
      </div>

      {containers.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
          <p className="text-sm">No containers found</p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Table side */}
          <div className={`min-w-0 overflow-auto ${selectedId ? "flex-1" : "w-full"}`}>
            <Table aria-label="Docker containers" removeWrapper>
              <TableHeader>
                <TableColumn>NAME</TableColumn>
                <TableColumn>IMAGE</TableColumn>
                <TableColumn>STATE</TableColumn>
                <TableColumn>STATUS</TableColumn>
                <TableColumn>PORTS</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody>
                {containers.map((c) => (
                  <TableRow
                    key={c.id}
                    className={`cursor-pointer ${selectedId === c.id ? "bg-default-100" : ""}`}
                    onClick={() => setSelectedId((prev) => (prev === c.id ? null : c.id))}
                  >
                    <TableCell>
                      <p className="text-sm font-medium truncate max-w-[200px]">{c.name}</p>
                      <p className="text-xs text-default-400 font-mono">{c.id.slice(0, 12)}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-mono truncate max-w-[200px]">{c.image}</p>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat" color={STATE_COLOR[c.state] ?? "default"}>
                        {c.state}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-default-400">{c.status}</span>
                    </TableCell>
                    <TableCell>
                      {c.ports.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {c.ports.slice(0, 3).map((p, i) => (
                            <span key={i} className="text-xs font-mono">
                              {p.host != null ? `${p.host}:` : ""}{p.container}/{p.protocol}
                            </span>
                          ))}
                          {c.ports.length > 3 && (
                            <span className="text-xs text-default-400">+{c.ports.length - 3} more</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-default-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {c.state !== "running" ? (
                          <Tooltip content="Start">
                            <Button
                              size="sm"
                              variant="flat"
                              color="success"
                              isLoading={actionLoading === c.id}
                              onPress={() => handleAction(c.id, "start")}
                            >
                              Start
                            </Button>
                          </Tooltip>
                        ) : (
                          <Tooltip content="Stop">
                            <Button
                              size="sm"
                              variant="flat"
                              color="warning"
                              isLoading={actionLoading === c.id}
                              onPress={() => handleAction(c.id, "stop")}
                            >
                              Stop
                            </Button>
                          </Tooltip>
                        )}
                        <Tooltip content="Restart">
                          <Button
                            size="sm"
                            variant="flat"
                            isLoading={actionLoading === c.id}
                            onPress={() => handleAction(c.id, "restart")}
                          >
                            Restart
                          </Button>
                        </Tooltip>
                        <Tooltip content="View logs">
                          <Button size="sm" variant="flat" onPress={() => handleViewLogs(c.id)}>
                            Logs
                          </Button>
                        </Tooltip>
                        <Tooltip content="Remove" color="danger">
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            onPress={() => {
                              setDeleteTarget(c);
                              onDeleteOpen();
                            }}
                          >
                            Remove
                          </Button>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Detail panel */}
          {selectedId && (() => {
            const selected = containers.find((c) => c.id === selectedId);
            return selected ? (
              <div className="w-[400px] flex-shrink-0 border-l border-divider pl-4 overflow-y-auto">
                <DockerContainerDetail
                  environmentId={environmentId}
                  container={selected}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* Log viewer modal */}
      <Modal isOpen={isLogOpen} onOpenChange={onLogOpenChange} size="3xl">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                Container Logs
                {logContainerId && (
                  <span className="text-xs font-mono text-default-400 ml-2">{logContainerId.slice(0, 12)}</span>
                )}
              </ModalHeader>
              <ModalBody>
                {logLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner label="Loading logs…" />
                  </div>
                ) : (
                  <pre className="text-xs bg-default-50 rounded-lg p-4 overflow-auto max-h-96 whitespace-pre-wrap break-all">
                    {logContent || "No logs available."}
                  </pre>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Delete confirmation */}
      <Modal isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Remove Container</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Remove container <span className="font-semibold">{deleteTarget?.name}</span>? This action cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Cancel
                </Button>
                <Button
                  color="danger"
                  isLoading={actionLoading === deleteTarget?.id}
                  onPress={async () => {
                    await handleRemove();
                    onClose();
                  }}
                >
                  Remove
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Create container modal */}
      <DockerCreateContainerModal
        environmentId={environmentId}
        isOpen={isCreateOpen}
        onOpenChange={onCreateOpenChange}
        onCreated={loadContainers}
      />
    </div>
  );
}
