import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Select,
  SelectItem,
  Textarea,
} from "../ui";
import { patchEnvironment } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { Environment, EnvironmentType } from "../../types";

interface Props {
  isOpen: boolean;
  onOpenChange: () => void;
  environment: Environment | null;
  onUpdate: (env: Environment) => void;
}

const ENV_TYPE_OPTIONS: EnvironmentType[] = ["kubernetes", "docker"];

export default function EnvironmentEditModal({
  isOpen,
  onOpenChange,
  environment,
  onUpdate,
}: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<EnvironmentType>("kubernetes");
  const [namespace, setNamespace] = useState("");
  // Kubernetes
  const [kubeconfig, setKubeconfig] = useState("");
  const [clusterUrl, setClusterUrl] = useState("");
  const [token, setToken] = useState("");
  const [caCert, setCaCert] = useState("");
  const [contextName, setContextName] = useState("");
  // Docker
  const [dockerHost, setDockerHost] = useState("");
  const [tlsCert, setTlsCert] = useState("");
  const [tlsKey, setTlsKey] = useState("");
  const [tlsCa, setTlsCa] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (environment && isOpen) {
      setName(environment.name);
      setType(environment.type);
      setNamespace(environment.namespace ?? "");
      // Reset connection fields (they're encrypted server-side, so we can't prefill)
      setKubeconfig("");
      setClusterUrl("");
      setToken("");
      setCaCert("");
      setContextName("");
      setDockerHost("");
      setTlsCert("");
      setTlsKey("");
      setTlsCa("");
    }
  }, [environment, isOpen]);

  const isFormValid = name.trim().length > 0;

  async function handleSave() {
    if (!environment || !isFormValid) return;
    setSaving(true);
    try {
      const data: Partial<Environment & { connection_config: Record<string, unknown> }> = {
        name: name.trim(),
        type,
        namespace: namespace.trim() || undefined,
      };

      // Build connection_config if any connection field is filled
      if (type === "kubernetes") {
        const k8sCfg: Record<string, unknown> = { type: "kubernetes" };
        if (kubeconfig.trim()) k8sCfg.kubeconfig = kubeconfig.trim();
        if (clusterUrl.trim()) k8sCfg.cluster_url = clusterUrl.trim();
        if (token.trim()) k8sCfg.token = token.trim();
        if (caCert.trim()) k8sCfg.ca_cert = caCert.trim();
        if (contextName.trim()) k8sCfg.context_name = contextName.trim();
        if (Object.keys(k8sCfg).length > 1) data.connection_config = k8sCfg;
      } else {
        const dockerCfg: Record<string, unknown> = { type: "docker" };
        if (dockerHost.trim()) dockerCfg.host = dockerHost.trim();
        if (tlsCert.trim()) dockerCfg.tls_cert = tlsCert.trim();
        if (tlsKey.trim()) dockerCfg.tls_key = tlsKey.trim();
        if (tlsCa.trim()) dockerCfg.tls_ca = tlsCa.trim();
        if (Object.keys(dockerCfg).length > 1) data.connection_config = dockerCfg;
      }

      const updated = await patchEnvironment(environment.id, data);
      toast.success("Environment updated", updated.name);
      onUpdate(updated);
      onOpenChange();
    } catch {
      toast.error("Failed to update environment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Edit Environment</ModalHeader>
            <ModalBody className="flex flex-col gap-5">
              <Input
                label="Environment name"
                value={name}
                onValueChange={setName}
                isRequired
                autoFocus
              />

              <Select
                label="Type"
                selectedKeys={[type]}
                disallowEmptySelection
                onSelectionChange={(keys) => {
                  const next = [...keys][0] as EnvironmentType | undefined;
                  if (next) setType(next);
                }}
              >
                {ENV_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t}>{t === "kubernetes" ? "Kubernetes" : "Docker"}</SelectItem>
                ))}
              </Select>

              <Input
                label="Default namespace"
                placeholder="default"
                value={namespace}
                onValueChange={setNamespace}
              />

              {/* Connection config - Kubernetes */}
              {type === "kubernetes" && (
                <div className="border border-divider rounded-lg p-4">
                  <p className="text-sm font-medium mb-1">Update Connection Config</p>
                  <p className="text-xs text-default-400 mb-3">
                    Credentials are encrypted and cannot be displayed. Fill fields below only to replace them.
                  </p>
                  <div className="flex flex-col gap-3">
                    <Textarea
                      label="Kubeconfig (YAML)"
                      placeholder="Paste your kubeconfig here…"
                      value={kubeconfig}
                      onValueChange={setKubeconfig}
                      minRows={3}
                      maxRows={8}
                    />
                    <p className="text-xs text-default-400 text-center">— or provide individual fields —</p>
                    <Input
                      label="Cluster URL"
                      placeholder="https://k8s.example.com:6443"
                      value={clusterUrl}
                      onValueChange={setClusterUrl}
                    />
                    <Input
                      label="Token"
                      placeholder="Bearer token"
                      value={token}
                      onValueChange={setToken}
                      type="password"
                    />
                    <Textarea
                      label="CA Certificate"
                      placeholder="-----BEGIN CERTIFICATE-----"
                      value={caCert}
                      onValueChange={setCaCert}
                      minRows={2}
                      maxRows={6}
                    />
                    <Input
                      label="Context name"
                      placeholder="my-cluster-context"
                      value={contextName}
                      onValueChange={setContextName}
                    />
                  </div>
                </div>
              )}

              {/* Connection config - Docker */}
              {type === "docker" && (
                <div className="border border-divider rounded-lg p-4">
                  <p className="text-sm font-medium mb-1">Update Connection Config</p>
                  <p className="text-xs text-default-400 mb-3">
                    Credentials are encrypted and cannot be displayed. Fill fields below only to replace them.
                  </p>
                  <div className="flex flex-col gap-3">
                    <Input
                      label="Docker host"
                      placeholder="tcp://docker.example.com:2376"
                      value={dockerHost}
                      onValueChange={setDockerHost}
                    />
                    <Textarea
                      label="TLS Certificate"
                      placeholder="-----BEGIN CERTIFICATE-----"
                      value={tlsCert}
                      onValueChange={setTlsCert}
                      minRows={2}
                      maxRows={6}
                    />
                    <Textarea
                      label="TLS Key"
                      placeholder="-----BEGIN RSA PRIVATE KEY-----"
                      value={tlsKey}
                      onValueChange={setTlsKey}
                      minRows={2}
                      maxRows={6}
                    />
                    <Textarea
                      label="TLS CA"
                      placeholder="-----BEGIN CERTIFICATE-----"
                      value={tlsCa}
                      onValueChange={setTlsCa}
                      minRows={2}
                      maxRows={6}
                    />
                  </div>
                </div>
              )}
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} isDisabled={saving}>
                Cancel
              </Button>
              <Button
                color="primary"
                isLoading={saving}
                isDisabled={!isFormValid}
                onPress={handleSave}
              >
                Save Changes
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
