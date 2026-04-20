import { useEffect, useState, useCallback } from "react";
import {
  Button,
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
import { listDockerImages, removeDockerImage, pruneDockerImages } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { DockerImage } from "../../types";
import DockerImageDetail from "./DockerImageDetail";
import DockerPullImageModal from "./DockerPullImageModal";

interface Props {
  environmentId: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function DockerImageList({ environmentId }: Props) {
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DockerImage | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  // Prune
  const [pruning, setPruning] = useState(false);
  const { isOpen: isPruneOpen, onOpen: onPruneOpen, onOpenChange: onPruneOpenChange } = useDisclosure();

  // Pull
  const { isOpen: isPullOpen, onOpen: onPullOpen, onOpenChange: onPullOpenChange } = useDisclosure();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setImages(await listDockerImages(environmentId));
    } catch {
      toast.error("Failed to load images");
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [environmentId]);

  useEffect(() => { load(); }, [load]);

  const handleRemove = async () => {
    if (!deleteTarget) return;
    setRemoving(deleteTarget.id);
    try {
      await removeDockerImage(environmentId, deleteTarget.id);
      toast.success("Image removed");
      setDeleteTarget(null);
      await load();
    } catch {
      toast.error("Failed to remove image");
    } finally {
      setRemoving(null);
    }
  };

  const handlePrune = async (onClose: () => void) => {
    setPruning(true);
    try {
      const result = await pruneDockerImages(environmentId);
      await load();
      toast.success(`Pruned ${result.removed.length} image(s)`);
      onClose();
    } catch {
      toast.error("Failed to prune images");
    } finally {
      setPruning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" label="Loading images…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-default-500">{images.length} image{images.length !== 1 ? "s" : ""}</p>
        <div className="flex gap-2">
          <Button size="sm" color="primary" variant="flat" onPress={onPullOpen}>
            Pull
          </Button>
          <Button size="sm" color="warning" variant="flat" onPress={onPruneOpen}>
            Prune
          </Button>
          <Button size="sm" variant="flat" onPress={load}>Refresh</Button>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-default-400">
          <p className="text-sm">No images found</p>
        </div>
      ) : (
        <div className="flex gap-4">
          {/* Table side */}
          <div className={`min-w-0 overflow-auto ${selectedId ? "flex-1" : "w-full"}`}>
            <Table aria-label="Docker images" removeWrapper>
              <TableHeader>
                <TableColumn>REPOSITORY / TAG</TableColumn>
                <TableColumn>IMAGE ID</TableColumn>
                <TableColumn>SIZE</TableColumn>
                <TableColumn>CREATED</TableColumn>
                <TableColumn>ACTIONS</TableColumn>
              </TableHeader>
              <TableBody>
                {images.map((img) => (
                  <TableRow
                    key={img.id}
                    className={`cursor-pointer ${selectedId === img.id ? "bg-default-100" : ""}`}
                    onClick={() => setSelectedId((prev) => (prev === img.id ? null : img.id))}
                  >
                    <TableCell>
                      {img.tags.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {img.tags.map((t) => (
                            <span key={t} className="text-xs font-mono">{t}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-default-400 italic">&lt;none&gt;</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-default-400">{img.id.slice(0, 12)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{formatSize(img.size)}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-default-400">{new Date(img.created).toLocaleDateString()}</span>
                    </TableCell>
                    <TableCell>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Tooltip content="Remove image" color="danger">
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            isLoading={removing === img.id}
                            onPress={() => { setDeleteTarget(img); onOpen(); }}
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
            const selected = images.find((img) => img.id === selectedId);
            return selected ? (
              <div className="w-[400px] flex-shrink-0 border-l border-divider pl-4 overflow-y-auto">
                <DockerImageDetail
                  environmentId={environmentId}
                  image={selected}
                  onClose={() => setSelectedId(null)}
                  onRefresh={load}
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
              <ModalHeader>Remove Image</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Remove image <span className="font-semibold font-mono">{deleteTarget?.id.slice(0, 12)}</span>? This action cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>Cancel</Button>
                <Button color="danger" isLoading={removing === deleteTarget?.id} onPress={async () => { await handleRemove(); onClose(); }}>
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
              <ModalHeader>Prune Images</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Remove all dangling (untagged) images? This cannot be undone.
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

      {/* Pull image modal */}
      <DockerPullImageModal
        environmentId={environmentId}
        isOpen={isPullOpen}
        onOpenChange={onPullOpenChange}
        onPulled={load}
      />
    </div>
  );
}
