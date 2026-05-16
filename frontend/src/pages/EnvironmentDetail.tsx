import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
} from "../components/ui";
import {
  getEnvironment,
  getEnvironmentResource,
  deleteEnvironment,
  testEnvironmentConnection,
  listEnvironmentResources,
  listDockerContainers,
} from "../lib/api";
import { toast } from "../lib/toast";
import type { Environment, K8sResource } from "../types";
import EnvironmentEditModal from "../components/environments/EnvironmentEditModal";
import K8sResourceExplorer from "../components/environments/K8sResourceExplorer";
import ResourceDetailPanel from "../components/environments/ResourceDetailPanel";
import HelmReleasesPanel from "../components/environments/HelmReleasesPanel";
import DockerDashboard from "../components/environments/DockerDashboard";

const ENV_STATUS_COLOR: Record<string, "success" | "default" | "danger"> = {
  connected: "success",
  disconnected: "default",
  error: "danger",
};

type TabKey = "overview" | "resources" | "helm" | "docker";

export default function EnvironmentDetail() {
  const { projectId, envId } = useParams<{ projectId: string; envId: string }>();
  const navigate = useNavigate();

  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedResource, setSelectedResource] = useState<K8sResource | null>(null);
  const [resourceDetail, setResourceDetail] = useState<unknown>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const { isOpen: isEditOpen, onOpen: onEditOpen, onOpenChange: onEditOpenChange } = useDisclosure();
  const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onOpenChange: onDeleteOpenChange } = useDisclosure();

  useEffect(() => {
    if (!envId) return;
    setLoading(true);
    getEnvironment(envId)
      .then(setEnvironment)
      .catch(() => toast.error("Failed to load environment"))
      .finally(() => setLoading(false));
  }, [envId]);

  const handleTest = async () => {
    if (!environment) return;
    setTesting(true);
    try {
      const result = await testEnvironmentConnection(environment.id);
      if (result.ok) {
        toast.success("Connection successful");
        setEnvironment((e) => (e ? { ...e, status: "connected" as const } : e));
      } else {
        toast.error(result.message ?? "Connection failed");
        setEnvironment((e) => (e ? { ...e, status: "error" as const } : e));
      }
    } catch {
      toast.error("Failed to test connection");
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!environment) return;
    setDeleting(true);
    try {
      await deleteEnvironment(environment.id);
      toast.success("Environment deleted", environment.name);
      navigate(`/projects/${projectId}`, { state: { tab: "environments" } });
    } catch {
      toast.error("Failed to delete environment");
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdate = (env: Environment) => {
    setEnvironment(env);
  };

  const goBack = () => {
    navigate(`/projects/${projectId}`, { state: { tab: "environments" } });
  };

  const handleSelectResource = async (resource: K8sResource) => {
    setSelectedResource(resource);
    setDetailLoading(true);
    try {
      const data = await getEnvironmentResource(
        envId!,
        resource.kind,
        resource.name,
        resource.namespace ?? environment?.namespace ?? "default",
      );
      setResourceDetail(data);
    } catch {
      toast.error("Failed to load resource details");
      setResourceDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedResource(null);
    setResourceDetail(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" label="Loading environment…" />
      </div>
    );
  }

  if (!environment) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-default-400">
        <p className="text-lg">Environment not found</p>
        <Button size="sm" variant="flat" onPress={goBack}>
          Back to project
        </Button>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; visible: boolean }[] = [
    { key: "overview", label: "Overview", visible: true },
    { key: "resources", label: "Resources", visible: environment.type === "kubernetes" },
    { key: "helm", label: "Helm Releases", visible: environment.type === "kubernetes" },
    { key: "docker", label: "Docker", visible: environment.type === "docker" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4 border-b border-divider">
        <Button size="sm" variant="light" onPress={goBack}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold truncate">{environment.name}</h1>
            <Chip size="sm" variant="flat" color={ENV_STATUS_COLOR[environment.status] ?? "default"}>
              {environment.status}
            </Chip>
          </div>
          <p className="text-xs text-default-400 mt-0.5">
            {environment.type === "kubernetes" ? "Kubernetes" : "Docker"}
            {environment.namespace ? ` · ${environment.namespace}` : ""}
            {" · Created "}
            {new Date(environment.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip content="Test connection">
            <Button size="sm" variant="flat" isLoading={testing} onPress={handleTest}>
              Test
            </Button>
          </Tooltip>
          <Tooltip content="Edit environment">
            <Button size="sm" variant="flat" onPress={onEditOpen}>
              Edit
            </Button>
          </Tooltip>
          <Tooltip content="Delete environment" color="danger">
            <Button size="sm" variant="flat" color="danger" onPress={onDeleteOpen}>
              Delete
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-5 border-b border-divider overflow-x-auto">
        {tabs
          .filter((t) => t.visible)
          .map((t) => (
            <button
              key={t.key}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-default-500 hover:text-default-700"
              }`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
      </div>

      {/* Tab content */}
      <div className={`flex-1 px-5 py-5 ${activeTab === "resources" ? "overflow-hidden" : "overflow-y-auto"}`}>
        {activeTab === "overview" && (
          <OverviewTab environment={environment} onTest={handleTest} testing={testing} />
        )}
        {activeTab === "resources" && (
          <div className="relative flex gap-0 h-full -mx-5 -my-5">
            {/* Left: K8s resource explorer (nav + list) */}
            {/* On mobile, hide list when detail is open; on md+ keep 60/40 split */}
            <div className={`overflow-hidden ${
              selectedResource
                ? "hidden md:flex md:w-[60%] md:border-r md:border-divider"
                : "flex w-full"
            }`}>
              <K8sResourceExplorer
                environmentId={environment.id}
                defaultNamespace={environment.namespace}
                onSelectResource={handleSelectResource}
                selectedResourceName={selectedResource?.name}
              />
            </div>
            {/* Right: resource detail
                Mobile  → full-screen overlay (absolute inset-0 z-10)
                Desktop → 40% side panel */}
            {selectedResource && (
              <div className="absolute inset-0 z-10 bg-background overflow-y-auto md:relative md:inset-auto md:z-auto md:w-[40%]">
                {detailLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Spinner size="lg" label="Loading details…" />
                  </div>
                ) : resourceDetail ? (
                  <ResourceDetailPanel
                    resourceKind={selectedResource.kind}
                    resourceName={selectedResource.name}
                    detail={resourceDetail}
                    onClose={handleCloseDetail}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-default-400">
                    <p className="text-sm">Could not load resource details</p>
                    <Button size="sm" variant="flat" className="mt-2" onPress={handleCloseDetail}>
                      Close
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {activeTab === "helm" && (
          <HelmReleasesPanel
            environmentId={environment.id}
            projectId={projectId!}
          />
        )}
        {activeTab === "docker" && environment.type === "docker" && (
          <DockerDashboard environmentId={environment.id} />
        )}
      </div>

      {/* Edit modal */}
      <EnvironmentEditModal
        isOpen={isEditOpen}
        onOpenChange={onEditOpenChange}
        environment={environment}
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
                  Delete <span className="font-semibold">{environment.name}</span>? This will remove the environment and all associated Helm releases. This action cannot be undone.
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

/* ── Overview Tab ───────────────────────────────────────────────────────────── */

function OverviewTab({
  environment,
  onTest,
  testing,
}: {
  environment: Environment;
  onTest: () => void;
  testing: boolean;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);

  const loadCounts = useCallback(async () => {
    setCountsLoading(true);
    try {
      if (environment.type === "kubernetes") {
        const ns = environment.namespace ?? "default";
        const [pods, deployments, services] = await Promise.all([
          listEnvironmentResources(environment.id, "pods", ns).then((r) => r.length).catch(() => 0),
          listEnvironmentResources(environment.id, "deployments", ns).then((r) => r.length).catch(() => 0),
          listEnvironmentResources(environment.id, "services", ns).then((r) => r.length).catch(() => 0),
        ]);
        setCounts({ pods, deployments, services });
      } else {
        // Use the same API as Resources tab for consistency; fall back to Docker API
        const ns = environment.namespace ?? "default";
        const containers = await listEnvironmentResources(environment.id, "containers", ns)
          .then((r) => r.length)
          .catch(() => listDockerContainers(environment.id).then((r) => r.length).catch(() => 0));
        setCounts({ containers });
      }
    } catch {
      setCounts({});
    } finally {
      setCountsLoading(false);
    }
  }, [environment]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Resource count cards */}
      {!countsLoading && Object.keys(counts).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(counts).map(([key, val]) => (
            <div key={key} className="border border-divider rounded-xl p-4 text-center">
              <p className="text-2xl font-semibold">{val}</p>
              <p className="text-xs text-default-500 capitalize mt-1">{key}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Connection Info Card */}
        <div className="border border-divider rounded-xl p-5">
          <p className="text-sm font-medium mb-4">Connection</p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-default-500">Type</span>
              <Chip size="sm" variant="flat">
                {environment.type === "kubernetes" ? "Kubernetes" : "Docker"}
              </Chip>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-default-500">Status</span>
              <Chip size="sm" variant="flat" color={ENV_STATUS_COLOR[environment.status] ?? "default"}>
                {environment.status}
              </Chip>
            </div>
            {environment.namespace ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-default-500">Namespace</span>
                <span className="text-sm">{environment.namespace}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-sm text-default-500">Created</span>
              <span className="text-sm">{new Date(environment.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-default-500">Last updated</span>
              <span className="text-sm">{new Date(environment.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-divider">
            <Button size="sm" variant="flat" onPress={onTest} isLoading={testing} className="w-full">
              Test Connection
            </Button>
          </div>
        </div>

        {/* Quick Info Card */}
        <div className="border border-divider rounded-xl p-5">
          <p className="text-sm font-medium mb-4">Details</p>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-default-500">Environment ID</span>
              <span className="text-xs text-default-400 font-mono">{environment.id.slice(0, 12)}…</span>
            </div>
            {environment.created_by ? (
              <div className="flex items-center justify-between">
                <span className="text-sm text-default-500">Created by</span>
                <span className="text-sm">{environment.created_by}</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
