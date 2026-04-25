import { useEffect, useRef, useState } from "react";
import {
  Button,
  Chip,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Spinner,
  Tooltip,
  useDisclosure,
} from "@heroui/react";
import {
  listWorkspaces,
  launchWorkspace,
  deleteWorkspace,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import type { Workspace, Repository } from "../../types";
import WorkspaceCreateModal from "./WorkspaceCreateModal";
import WorkspaceEditModal from "./WorkspaceEditModal";

interface Props {
  projectId: string;
  repositories: Repository[];
}

const WS_STATUS_COLOR: Record<string, "warning" | "success" | "primary" | "default" | "danger"> = {
  idle: "default",
  starting: "warning",
  running: "success",
  sleeping: "default",
  error: "danger",
};

export default function WorkspaceTab({ projectId, repositories }: Props) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [wsToDelete, setWsToDelete] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [wsToEdit, setWsToEdit] = useState<Workspace | null>(null);

  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onOpenChange: onCreateOpenChange } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onOpenChange: onEditOpenChange } = useDisclosure();

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    try {
      const data = await listWorkspaces(projectId);
      setWorkspaces(data);
      return data;
    } catch {
      toast.error("Failed to load workspaces");
      return [];
    }
  };

  // Poll while any workspace is in "starting" state
  const schedulePoll = (wss: Workspace[]) => {
    if (pollRef.current) clearTimeout(pollRef.current);
    const needsPoll = wss.some((w) => w.status === "starting");
    if (needsPoll) {
      pollRef.current = setTimeout(async () => {
        const updated = await load();
        schedulePoll(updated);
      }, 5000);
    }
  };

  useEffect(() => {
    setLoading(true);
    load()
      .then(schedulePoll)
      .finally(() => setLoading(false));

    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleCreate = (ws: Workspace) => {
    setWorkspaces((prev) => [ws, ...prev]);
  };

  const handleUpdate = (ws: Workspace) => {
    setWorkspaces((prev) => prev.map((w) => (w.id === ws.id ? ws : w)));
  };

  const handleLaunch = async (ws: Workspace) => {
    setLaunchingId(ws.id);
    try {
      const launched = await launchWorkspace(ws.id);
      setWorkspaces((prev) => prev.map((w) => (w.id === launched.id ? launched : w)));
      if (launched.ide_url) window.open(launched.ide_url, "_blank");
      schedulePoll([launched]);
    } catch {
      toast.error("Failed to launch workspace");
    } finally {
      setLaunchingId(null);
    }
  };

  const handleDelete = async () => {
    if (!wsToDelete) return;
    setDeleting(true);
    try {
      await deleteWorkspace(wsToDelete.id);
      setWorkspaces((prev) => prev.filter((w) => w.id !== wsToDelete.id));
      toast.success("Workspace deleted", wsToDelete.name);
      onDeleteOpenChange();
      setWsToDelete(null);
    } catch {
      toast.error("Failed to delete workspace");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" label="Loading workspaces…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header with create button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-default-500">{workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}</p>
        <Button size="sm" color="primary" onPress={onCreateOpen}>
          + New Workspace
        </Button>
      </div>

      {/* List */}
      {workspaces.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-default-400">
          <p className="text-lg">No workspaces yet</p>
          <p className="text-sm">Create a workspace to open all project repositories in the IDE.</p>
          <Button size="sm" color="primary" variant="flat" onPress={onCreateOpen}>
            Create your first workspace
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className="clay-list-item flex items-center gap-4 p-4 rounded-xl"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{ws.name}</p>
                <p className="text-xs text-default-400 mt-0.5">
                  Created {new Date(ws.created_at).toLocaleDateString()}
                  {ws.container_image ? ` · ${ws.container_image}` : ""}
                </p>
              </div>

              <Chip size="sm" variant="flat" color={WS_STATUS_COLOR[ws.status] ?? "default"}>
                {ws.status}
              </Chip>

              {ws.ide_url ? (
                <Tooltip content="Open in IDE">
                  <Button
                    size="sm"
                    variant="flat"
                    color="primary"
                    as="a"
                    href={ws.ide_url}
                    target="_blank"
                    aria-label={`Open ${ws.name} in IDE`}
                  >
                    Open IDE
                  </Button>
                </Tooltip>
              ) : (
                <Tooltip content="Launch workspace in IDE">
                  <Button
                    size="sm"
                    variant="flat"
                    color="primary"
                    isLoading={launchingId === ws.id}
                    onPress={() => handleLaunch(ws)}
                  >
                    Launch
                  </Button>
                </Tooltip>
              )}

              <Tooltip content="Edit workspace">
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  aria-label={`Edit ${ws.name}`}
                  onPress={() => {
                    setWsToEdit(ws);
                    onEditOpen();
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                </Button>
              </Tooltip>

              <Tooltip content="Delete workspace" color="danger">
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  aria-label={`Delete workspace: ${ws.name}`}
                  onPress={() => {
                    setWsToDelete(ws);
                    onDeleteOpen();
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </Button>
              </Tooltip>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <WorkspaceCreateModal
        isOpen={isCreateOpen}
        onOpenChange={onCreateOpenChange}
        projectId={projectId}
        repositories={repositories}
        onCreate={handleCreate}
      />

      {/* Edit modal */}
      <WorkspaceEditModal
        isOpen={isEditOpen}
        onOpenChange={onEditOpenChange}
        workspace={wsToEdit}
        onUpdate={handleUpdate}
      />

      {/* Delete confirmation */}
      <Modal isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Delete Workspace</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Delete <span className="font-semibold">{wsToDelete?.name}</span>? This will remove the workspace configuration. This action cannot be undone.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose} isDisabled={deleting}>
                  Cancel
                </Button>
                <Button color="danger" onPress={handleDelete} isLoading={deleting}>
                  Delete
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
