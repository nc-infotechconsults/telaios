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
} from "../ui";
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
        <div className="apple-card overflow-hidden flex flex-col divide-y divide-default-100/60">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              className="apple-list-item flex items-center gap-4 px-4 py-3"
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
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
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
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
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
