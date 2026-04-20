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
import { listDockerNetworks, removeDockerNetwork, pruneDockerNetworks } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerNetwork } from "../../types";
import DockerNetworkDetail from "./DockerNetworkDetail";
import DockerCreateNetworkModal from "./DockerCreateNetworkModal";

interface Props {
  environmentId: string;
}

export default function DockerNetworkList({ environmentId }: Props) {
  const [networks, setNetworks] = useState<DockerNetwork[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DockerNetwork | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Remove confirmation
  const { isOpen: isRemoveOpen, onOpen: onRemoveOpen, onOpenChange: onRemoveOpenChange } = useDisclosure();

  // Create
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onOpenChange: onCreateOpenChange } = useDisclosure();

  // Prune
  const [pruning, setPruning] = useState(false);
  const { isOpen: isPruneOpen, onOpen: onPruneOpen, onOpenChange: onPruneOpenChange } = useDisclosure();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNetworks(await listDockerNetworks(environmentId));
    } catch {
      toast.error("Failed to load networks");
      setNetworks([]);
    } finally {
      setLoading(false);
    }
  }, [environmentId]);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async (onClose: () => void) => {
    if (!deleteTarget) return;
    setRemoving(deleteTarget.id);
    try {
      await removeDockerNetwork(environmentId, deleteTarget.id);
      toast.success("Network removed", deleteTarget.name);
      setDeleteTarget(null);
      await load();
      onClose();
    } catch {
      toast.error("Failed to remove network");
    } finally {
      setRemoving(null);
    }
  };

  const handlePrune = async (onClose: () => void) => {
    setPruning(true);
    try {
      const result = await pruneDockerNetworks(environmentId);
      await load();
      toast.success(`Pruned ${result.removed.length} network(s)`);
      onClose();
    } catch {
      toast.error("Failed to prune networks");
    } finally {
      setPruning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" label="Loading networks…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-default-500">{networks.length} network{networks.length !== 1 ? "s" : ""}</p>
        <div className="flex gap-2">
          <Button size="sm" color="primary" variant="flat" onPress={onCreateOpen}>Create</Button>
          <Button size="sm" color="warning" variant="flat" onPress={onPruneOpen}>Prune</Button>
          <Button size="sm" variant="flat" onPress={load}>Refresh</Button>
        </div>
      </div>

      {networks.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
          <p className="text-sm">No networks found</p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Table side */}
          <div className={`min-w-0 overflow-auto ${selectedId ? "flex-1" : "w-full"}`}>
            <Table aria-label="Docker networks" removeWrapper>
              <TableHeader>
                <TableColumn>NAME</TableColumn>
                <TableColumn>NETWORK ID</TableColumn>
                <TableColumn>DRIVER</TableColumn>
                <TableColumn>SCOPE</TableColumn>
                <TableColumn>SUBNET</TableColumn>
                <TableColumn>CONTAINERS</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody>
                {networks.map((net) => (
                  <TableRow
                    key={net.id}
                    className={`cursor-pointer ${selectedId === net.id ? "bg-default-100" : ""}`}
                    onClick={() => setSelectedId((prev) => (prev === net.id ? null : net.id))}
                  >
                    <TableCell>
                      <p className="text-sm font-medium">{net.name}</p>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-default-400">{net.id.slice(0, 12)}</span>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat">{net.driver}</Chip>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-default-400">{net.scope}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-default-400">{net.ipam?.subnet ?? "-"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{net.containers}</span>
                    </TableCell>
                    <TableCell>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Tooltip content="Remove network" color="danger">
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            isLoading={removing === net.id}
                            onPress={() => { setDeleteTarget(net); onRemoveOpen(); }}
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
            const selected = networks.find((n) => n.id === selectedId);
            return selected ? (
              <div className="w-[400px] flex-shrink-0 border-l border-divider pl-4 overflow-y-auto">
                <DockerNetworkDetail
                  environmentId={environmentId}
                  network={selected}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* Remove confirmation */}
      <Modal isOpen={isRemoveOpen} onOpenChange={onRemoveOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Remove Network</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Remove network <span className="font-semibold">{deleteTarget?.name}</span>? This action cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={!!removing}>Cancel</Button>
                <Button color="danger" isLoading={removing === deleteTarget?.id} onPress={() => handleRemove(onClose)}>
                  Remove
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Prune confirmation */}
      <Modal isOpen={isPruneOpen} onOpenChange={onPruneOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Prune Networks</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Remove all unused networks? This cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={pruning}>Cancel</Button>
                <Button color="warning" isLoading={pruning} onPress={() => handlePrune(onClose)}>
                  Prune
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Create network modal */}
      <DockerCreateNetworkModal
        environmentId={environmentId}
        isOpen={isCreateOpen}
        onOpenChange={onCreateOpenChange}
        onCreated={load}
      />
    </div>
  );
}
