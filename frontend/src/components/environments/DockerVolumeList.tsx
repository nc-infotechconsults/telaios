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
import { listDockerVolumes, removeDockerVolume } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerVolume } from "../../types";

interface Props {
  environmentId: string;
}

export default function DockerVolumeList({ environmentId }: Props) {
  const [volumes, setVolumes] = useState<DockerVolume[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DockerVolume | null>(null);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

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
        <Button size="sm" variant="flat" onPress={load}>Refresh</Button>
      </div>

      {volumes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
          <p className="text-sm">No volumes found</p>
        </div>
      ) : (
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
              <TableRow key={vol.name}>
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
    </div>
  );
}
