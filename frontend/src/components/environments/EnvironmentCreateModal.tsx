import { useState } from "react";
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
} from "@heroui/react";
import { createEnvironment } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { Environment, EnvironmentType } from "../../types";

interface Props {
  isOpen: boolean;
  onOpenChange: () => void;
  projectId: string;
  onCreate: (env: Environment) => void;
}

const ENV_TYPE_OPTIONS: EnvironmentType[] = ["kubernetes", "docker"];

const EMPTY_FORM = {
  name: "",
  type: "kubernetes" as EnvironmentType,
  namespace: "",
  // Kubernetes fields
  kubeconfig: "",
  clusterUrl: "",
  token: "",
  caCert: "",
  contextName: "",
  // Docker fields
  dockerHost: "",
  tlsCert: "",
  tlsKey: "",
  tlsCa: "",
};

export default function EnvironmentCreateModal({
  isOpen,
  onOpenChange,
  projectId,
  onCreate,
}: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const isFormValid = form.name.trim().length > 0;

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    if (!isFormValid) return;
    setSaving(true);
    try {
      // Build connection_config based on type
      let connection_config: Record<string, unknown> | undefined;

      if (form.type === "kubernetes") {
        const k8sCfg: Record<string, unknown> = { type: "kubernetes" };
        if (form.kubeconfig.trim()) k8sCfg.kubeconfig = form.kubeconfig.trim();
        if (form.clusterUrl.trim()) k8sCfg.cluster_url = form.clusterUrl.trim();
        if (form.token.trim()) k8sCfg.token = form.token.trim();
        if (form.caCert.trim()) k8sCfg.ca_cert = form.caCert.trim();
        if (form.contextName.trim()) k8sCfg.context_name = form.contextName.trim();
        // Only include if there's actual config
        if (Object.keys(k8sCfg).length > 1) connection_config = k8sCfg;
      } else {
        const dockerCfg: Record<string, unknown> = { type: "docker" };
        if (form.dockerHost.trim()) dockerCfg.host = form.dockerHost.trim();
        if (form.tlsCert.trim()) dockerCfg.tls_cert = form.tlsCert.trim();
        if (form.tlsKey.trim()) dockerCfg.tls_key = form.tlsKey.trim();
        if (form.tlsCa.trim()) dockerCfg.tls_ca = form.tlsCa.trim();
        if (Object.keys(dockerCfg).length > 1) connection_config = dockerCfg;
      }

      const env = await createEnvironment(projectId, {
        name: form.name.trim(),
        type: form.type,
        namespace: form.namespace.trim() || undefined,
        connection_config,
      });
      toast.success("Environment created", env.name);
      onCreate(env);
      resetForm();
      onOpenChange();
    } catch {
      toast.error("Failed to create environment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Add Environment</ModalHeader>
            <ModalBody className="flex flex-col gap-5">
              {/* Name */}
              <Input
                label="Environment name"
                placeholder="production-cluster"
                value={form.name}
                onValueChange={(v) => update("name", v)}
                isRequired
                autoFocus
              />

              {/* Type */}
              <Select
                label="Type"
                selectedKeys={[form.type]}
                disallowEmptySelection
                onSelectionChange={(keys) => {
                  const next = [...keys][0] as EnvironmentType | undefined;
                  if (next) update("type", next);
                }}
              >
                {ENV_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t}>{t === "kubernetes" ? "Kubernetes" : "Docker"}</SelectItem>
                ))}
              </Select>

              {/* Namespace */}
              <Input
                label="Default namespace"
                placeholder="default"
                value={form.namespace}
                onValueChange={(v) => update("namespace", v)}
              />

              {/* Connection config - Kubernetes */}
              {form.type === "kubernetes" && (
                <div className="border border-divider rounded-lg p-4">
                  <p className="text-sm font-medium mb-1">Kubernetes Connection</p>
                  <p className="text-xs text-default-400 mb-3">Provide a kubeconfig or individual fields. All credentials are encrypted at rest.</p>
                  <div className="flex flex-col gap-3">
                    <Textarea
                      label="Kubeconfig (YAML)"
                      placeholder="Paste your kubeconfig here…"
                      value={form.kubeconfig}
                      onValueChange={(v) => update("kubeconfig", v)}
                      minRows={3}
                      maxRows={8}
                      description="Paste a full kubeconfig, or use individual fields below"
                    />
                    <p className="text-xs text-default-400 text-center">— or provide individual fields —</p>
                    <Input
                      label="Cluster URL"
                      placeholder="https://k8s.example.com:6443"
                      value={form.clusterUrl}
                      onValueChange={(v) => update("clusterUrl", v)}
                    />
                    <Input
                      label="Token"
                      placeholder="Bearer token"
                      value={form.token}
                      onValueChange={(v) => update("token", v)}
                      type="password"
                    />
                    <Textarea
                      label="CA Certificate"
                      placeholder="-----BEGIN CERTIFICATE-----"
                      value={form.caCert}
                      onValueChange={(v) => update("caCert", v)}
                      minRows={2}
                      maxRows={6}
                    />
                    <Input
                      label="Context name"
                      placeholder="my-cluster-context"
                      value={form.contextName}
                      onValueChange={(v) => update("contextName", v)}
                    />
                  </div>
                </div>
              )}

              {/* Connection config - Docker */}
              {form.type === "docker" && (
                <div className="border border-divider rounded-lg p-4">
                  <p className="text-sm font-medium mb-1">Docker Connection</p>
                  <p className="text-xs text-default-400 mb-3">Leave empty for local Docker socket. All credentials are encrypted at rest.</p>
                  <div className="flex flex-col gap-3">
                    <Input
                      label="Docker host"
                      placeholder="tcp://docker.example.com:2376"
                      value={form.dockerHost}
                      onValueChange={(v) => update("dockerHost", v)}
                      description="Leave empty for local Docker socket"
                    />
                    <Textarea
                      label="TLS Certificate"
                      placeholder="-----BEGIN CERTIFICATE-----"
                      value={form.tlsCert}
                      onValueChange={(v) => update("tlsCert", v)}
                      minRows={2}
                      maxRows={6}
                    />
                    <Textarea
                      label="TLS Key"
                      placeholder="-----BEGIN RSA PRIVATE KEY-----"
                      value={form.tlsKey}
                      onValueChange={(v) => update("tlsKey", v)}
                      minRows={2}
                      maxRows={6}
                    />
                    <Textarea
                      label="TLS CA"
                      placeholder="-----BEGIN CERTIFICATE-----"
                      value={form.tlsCa}
                      onValueChange={(v) => update("tlsCa", v)}
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
                Add Environment
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
