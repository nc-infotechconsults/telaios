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
} from "../ui";
import { listDockerVolumes, removeDockerVolume, pruneDockerVolumes } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerVolume } from "../../types";
import DockerVolumeDetail from "./DockerVolumeDetail";
import DockerCreateVolumeModal from "./DockerCreateVolumeModal";

interface Props {
  environmentId: string;
}

export default function DockerVolumeList({ environmentId }: Props) {
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DockerVolume | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  // Create
  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onOpenChange: onCreateOpenChange } = useDisclosure();

  // Prune
  const [pruning, setPruning] = useState(false);
  const { isOpen: isPruneOpen, onOpen: onPruneOpen, onOpenChange: onPruneOpenChange } = useDisclosure();

  // Detail modal for small screens (< lg)
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVolumes(await listDockerVolumes(environmentId));
    } catch {
      toast.error("Failed to load volumes");
      setVolumes([]);
    } finally {
      setLoading(false);
    }
  }, [environmentId]);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async () => {
    if (!deleteTarget) return;
    setRemoving(deleteTarget.name);
    try {
      await removeDockerVolume(environmentId, deleteTarget.name);
      toast.success("Volume removed");
      setDeleteTarget(null);
      await load();
    } catch {
      toast.error("Failed to remove volume");
    } finally {
      setRemoving(null);
    }
  };

  const handlePrune = async (onClose: () => void) => {
    setPruning(true);
    try {
      const result = await pruneDockerVolumes(environmentId);
      await load();
      toast.success(`Pruned ${result.removed.length} volume(s)`);
      onClose();
    } catch {
      toast.error("Failed to prune volumes");
    } finally {
      setPruning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" label="Loading volumes…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-default-500">{volumes.length} volume{volumes.length !== 1 ? "s" : ""}</p>
        <div className="flex gap-2">
          <Button size="sm" color="primary" variant="flat" onPress={onCreateOpen}>Create</Button>
          <Button size="sm" color="warning" variant="flat" onPress={onPruneOpen}>Prune</Button>
          <Button size="sm" variant="flat" onPress={load}>Refresh</Button>
        </div>
      </div>

      {volumes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
          <p className="text-sm">No volumes found</p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Table side */}
          <div className={`min-w-0 overflow-auto ${selectedName ? "flex-1" : "w-full"}`}>
            <Table aria-label="Docker volumes" removeWrapper>
              <TableHeader>
                <TableColumn>NAME</TableColumn>
                <TableColumn>DRIVER</TableColumn>
                <TableColumn>SCOPE</TableColumn>
                <TableColumn>MOUNTPOINT</TableColumn>
                <TableColumn>CREATED</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody>
                {volumes.map((vol) => (
                  <TableRow
                    key={vol.name}
                    className={`cursor-pointer ${selectedName === vol.name ? "bg-default-100" : ""}`}
                    onClick={() => {
                      const next = vol.name === selectedName ? null : vol.name;
                      setSelectedName(next);
                      if (next && window.innerWidth < 1024) setDetailOpen(true);
                    }}
                  >
                    <TableCell>
                      <p className="text-sm font-medium font-mono truncate max-w-[200px]">{vol.name}</p>
                    </TableCell>
                    <TableCell>
                      <Chip size="sm" variant="flat">{vol.driver}</Chip>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-default-400">{vol.scope}</span>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-mono text-default-400 truncate max-w-[200px]">{vol.mountpoint}</p>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-default-400">{new Date(vol.created).toLocaleDateString()}</span>
                    </TableCell>
                    <TableCell>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Tooltip content="Remove volume" color="danger">
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            isLoading={removing === vol.name}
                            onPress={() => { setDeleteTarget(vol); onOpen(); }}
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
          {selectedName && (() => {
            const selected = volumes.find((v) => v.name === selectedName);
            return selected ? (
              <div className="hidden lg:block w-[400px] flex-shrink-0 border-l border-divider pl-4 overflow-y-auto">
                <DockerVolumeDetail
                  environmentId={environmentId}
                  volume={selected}
                  onClose={() => setSelectedName(null)}
                />
              </div>
            ) : null;
          })()}
        </div>
      )}

      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Remove Volume</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Remove volume <span className="font-semibold font-mono">{deleteTarget?.name}</span>? This action cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button color="danger" isLoading={removing === deleteTarget?.name} onPress={async () => { await handleRemove(); onClose(); }}>
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
              <ModalHeader>Prune Volumes</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Remove all unused volumes? This cannot be undone.
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

      {/* Create volume modal */}
      <DockerCreateVolumeModal
        environmentId={environmentId}
        isOpen={isCreateOpen}
        onOpenChange={onCreateOpenChange}
        onCreated={load}
      />

      {/* Detail modal for small/tablet screens (< lg) */}
      {selectedName && (() => {
        const selected = volumes.find((v) => v.name === selectedName);
        return selected ? (
          <Modal
            isOpen={detailOpen}
            onOpenChange={(open) => {
              setDetailOpen(open);
              if (!open) setSelectedName(null);
            }}
            size="2xl"
            scrollBehavior="inside"
          >
            <ModalContent>
              {(onClose) => (
                <>
                  <ModalHeader>Volume Details</ModalHeader>
                  <ModalBody className="pb-6">
                    <DockerVolumeDetail
                      environmentId={environmentId}
                      volume={selected}
                      onClose={onClose}
                    />
                  </ModalBody>
                </>
              )}
            </ModalContent>
          </Modal>
        ) : null;
      })()}
    </div>
  );
}
