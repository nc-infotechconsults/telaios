import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  listEnvironments,
  testEnvironmentConnection,
  deleteEnvironment,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import type { Environment } from "../../types";
import EnvironmentCreateModal from "./EnvironmentCreateModal";

interface Props {
  projectId: string;
}

const ENV_STATUS_COLOR: Record<string, "success" | "default" | "danger"> = {
  connected: "success",
  disconnected: "default",
  error: "danger",
};

export default function EnvironmentTab({ projectId }: Props) {
  const navigate = useNavigate();
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [envToDelete, setEnvToDelete] = useState<Environment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onOpenChange: onCreateOpenChange } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();

  const load = async () => {
    try {
      const data = await listEnvironments(projectId);
      setEnvironments(data);
    } catch {
      toast.error("Failed to load environments");
    }
  };

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleCreate = (env: Environment) => {
    setEnvironments((prev) => [env, ...prev]);
  };

  const handleTest = async (env: Environment) => {
    setTestingId(env.id);
    try {
      const result = await testEnvironmentConnection(env.id);
      if (result.ok) {
        toast.success("Connection successful");
        setEnvironments((prev) =>
          prev.map((e) => (e.id === env.id ? { ...e, status: "connected" as const } : e)),
        );
      } else {
        toast.error(result.message ?? "Connection failed");
        setEnvironments((prev) =>
          prev.map((e) => (e.id === env.id ? { ...e, status: "error" as const } : e)),
        );
      }
    } catch {
      toast.error("Failed to test connection");
    } finally {
      setTestingId(null);
    }
  };

  const handleDelete = async () => {
    if (!envToDelete) return;
    setDeleting(true);
    try {
      await deleteEnvironment(envToDelete.id);
      setEnvironments((prev) => prev.filter((e) => e.id !== envToDelete.id));
      toast.success("Environment deleted", envToDelete.name);
      onDeleteOpenChange();
      setEnvToDelete(null);
    } catch {
      toast.error("Failed to delete environment");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" label="Loading environments…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-default-500">{environments.length} environment{environments.length !== 1 ? "s" : ""}</p>
        <Button size="sm" color="primary" onPress={onCreateOpen}>
          + Add Environment
        </Button>
      </div>

      {/* List */}
      {environments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-default-400">
          <p className="text-lg">No environments yet</p>
          <p className="text-sm">Add a Kubernetes or Docker environment to view and manage resources.</p>
          <Button size="sm" color="primary" variant="flat" onPress={onCreateOpen}>
            Add your first environment
          </Button>
        </div>
      ) : (
        <div className="clay-card overflow-hidden flex flex-col divide-y divide-default-100/60">
          {environments.map((env) => (
            <div
              key={env.id}
              className="clay-list-item flex items-center gap-4 px-4 py-3 cursor-pointer"
              onClick={() => navigate(`/projects/${projectId}/environments/${env.id}`)}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{env.name}</p>
                <p className="text-xs text-default-400 mt-0.5">
                  {env.type === "kubernetes" ? "Kubernetes" : "Docker"}
                  {env.namespace ? ` · ${env.namespace}` : ""}
                  {" · Created "}
                  {new Date(env.created_at).toLocaleDateString()}
                </p>
              </div>

              <Chip size="sm" variant="flat" color={ENV_STATUS_COLOR[env.status] ?? "default"}>
                {env.status}
              </Chip>

              <Tooltip content="Test connection">
                <Button
                  size="sm"
                  variant="flat"
                  isLoading={testingId === env.id}
                  onPress={(e) => {
                    e.continuePropagation?.();
                    handleTest(env);
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Test
                </Button>
              </Tooltip>

              <Tooltip content="Delete environment" color="danger">
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  aria-label={`Delete environment: ${env.name}`}
                  onPress={() => {
                    setEnvToDelete(env);
                    onDeleteOpen();
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </Button>
              </Tooltip>

              {/* Arrow icon to indicate navigation */}
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-default-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <EnvironmentCreateModal
        isOpen={isCreateOpen}
        onOpenChange={onCreateOpenChange}
        projectId={projectId}
        onCreate={handleCreate}
      />

      {/* Delete confirmation */}
      <Modal isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Delete Environment</ModalHeader>
              <ModalBody>
                <p className="text-sm text-default-600">
                  Delete <span className="font-semibold">{envToDelete?.name}</span>? This will remove the environment and all associated Helm releases. This action cannot be undone.
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
