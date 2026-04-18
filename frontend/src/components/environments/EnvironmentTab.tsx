import { useEffect, useState } from "react";
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
import EnvironmentEditModal from "./EnvironmentEditModal";
import ResourceBrowser from "./ResourceBrowser";
import HelmReleasesPanel from "./HelmReleasesPanel";

interface Props {
  projectId: string;
}

const ENV_STATUS_COLOR: Record<string, "success" | "default" | "danger"> = {
  connected: "success",
  disconnected: "default",
  error: "danger",
};

export default function EnvironmentTab({ projectId }: Props) {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [envToDelete, setEnvToDelete] = useState<Environment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [envToEdit, setEnvToEdit] = useState<Environment | null>(null);
  const [expandedEnvId, setExpandedEnvId] = useState<string | null>(null);
  const [expandedView, setExpandedView] = useState<"resources" | "helm">("resources");

  const { isOpen: isCreateOpen, onOpen: onCreateOpen, onOpenChange: onCreateOpenChange } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();
  const { isOpen: isEditOpen, onOpen: onEditOpen, onOpenChange: onEditOpenChange } = useDisclosure();

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

  const handleUpdate = (env: Environment) => {
    setEnvironments((prev) => prev.map((e) => (e.id === env.id ? env : e)));
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
      if (expandedEnvId === envToDelete.id) setExpandedEnvId(null);
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
        <div className="flex flex-col gap-3">
          {environments.map((env) => (
            <div key={env.id}>
              <div
                className={`flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                  expandedEnvId === env.id
                    ? "border-primary/50 bg-primary/5"
                    : "border-divider hover:border-default-300"
                }`}
                onClick={() => setExpandedEnvId(expandedEnvId === env.id ? null : env.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{env.name}</p>
                  <p className="text-xs text-default-400 mt-0.5">
                    {env.type}{env.namespace ? ` · ${env.namespace}` : ""} · Created {new Date(env.created_at).toLocaleDateString()}
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
                    onPress={() => {
                      handleTest(env);
                    }}
                  >
                    Test
                  </Button>
                </Tooltip>

                <Tooltip content="Edit environment">
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    aria-label={`Edit ${env.name}`}
                    onPress={() => {
                      setEnvToEdit(env);
                      onEditOpen();
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
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
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </Button>
                </Tooltip>
              </div>

              {/* Expanded detail panel */}
              {expandedEnvId === env.id && (
                <div className="mt-2 ml-4 border-l-2 border-primary/20 pl-4 pb-4">
                  {/* Sub-tab bar */}
                  <div className="flex items-center gap-2 mb-4">
                    <Button
                      size="sm"
                      variant={expandedView === "resources" ? "solid" : "flat"}
                      color={expandedView === "resources" ? "primary" : "default"}
                      onPress={() => setExpandedView("resources")}
                    >
                      Resources
                    </Button>
                    <Button
                      size="sm"
                      variant={expandedView === "helm" ? "solid" : "flat"}
                      color={expandedView === "helm" ? "primary" : "default"}
                      onPress={() => setExpandedView("helm")}
                    >
                      Helm Releases
                    </Button>
                  </div>

                  {expandedView === "resources" && (
                    <ResourceBrowser
                      environmentId={env.id}
                      defaultNamespace={env.namespace}
                      environmentType={env.type}
                    />
                  )}
                  {expandedView === "helm" && (
                    <HelmReleasesPanel
                      environmentId={env.id}
                      projectId={projectId}
                    />
                  )}
                </div>
              )}
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

      {/* Edit modal */}
      <EnvironmentEditModal
        isOpen={isEditOpen}
        onOpenChange={onEditOpenChange}
        environment={envToEdit}
        onUpdate={handleUpdate}
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
