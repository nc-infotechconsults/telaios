import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textarea,
} from "../ui";
import { upgradeHelmChart } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { HelmRelease } from "../../types";

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  environmentId: string;
  release: HelmRelease | null;
  onUpgrade: (release: HelmRelease) => void;
}

interface UpgradeForm {
  chartRepoUrl: string;
  chartVersion: string;
  namespace: string;
  valuesOverride: string;
}

export default function HelmUpgradeModal({
  isOpen,
  onOpenChange,
  environmentId,
  release,
  onUpgrade,
}: Props) {
  const [form, setForm] = useState<UpgradeForm>({
    chartRepoUrl: "",
    chartVersion: "",
    namespace: "",
    valuesOverride: "",
  });
  const [saving, setSaving] = useState(false);

  // Pre-fill form from release whenever the modal opens or the release changes
  useEffect(() => {
    if (release) {
      setForm({
        chartRepoUrl: release.chart_repo_url ?? "",
        chartVersion: release.chart_version ?? "",
        namespace: release.namespace ?? "",
        valuesOverride: release.values_override
          ? JSON.stringify(release.values_override, null, 2)
          : "",
      });
    }
  }, [release]);

  function update<K extends keyof UpgradeForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetForm() {
    setForm({ chartRepoUrl: "", chartVersion: "", namespace: "", valuesOverride: "" });
  }

  async function handleUpgrade() {
    if (!release) return;
    setSaving(true);
    try {
      let valuesOverride: Record<string, unknown> | undefined;
      if (form.valuesOverride.trim()) {
        try {
          valuesOverride = JSON.parse(form.valuesOverride.trim()) as Record<string, unknown>;
        } catch {
          toast.error("Invalid JSON", "Values override must be valid JSON");
          setSaving(false);
          return;
        }
      }

      const updated = await upgradeHelmChart(environmentId, release.name, {
        chart_repo_url: form.chartRepoUrl.trim() || undefined,
        chart_version: form.chartVersion.trim() || undefined,
        namespace: form.namespace.trim() || undefined,
        values_override: valuesOverride,
      });
      toast.success("Helm release upgraded", updated.name);
      onUpgrade(updated);
      resetForm();
      onOpenChange(false);
    } catch {
      toast.error("Failed to upgrade Helm release");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>
              Upgrade Helm Release — {release?.name}
            </ModalHeader>
            <ModalBody className="flex flex-col gap-5">
              {/* Read-only fields */}
              <Input
                label="Release name"
                value={release?.name ?? ""}
                isReadOnly
                description="Release name cannot be changed during upgrade"
              />
              <Input
                label="Chart name"
                value={release?.chart_name ?? ""}
                isReadOnly
                description="Chart name cannot be changed during upgrade"
              />

              {/* Editable fields */}
              <Input
                label="Chart repository URL"
                placeholder="https://charts.bitnami.com/bitnami or oci://ghcr.io/myorg"
                value={form.chartRepoUrl}
                onValueChange={(v) => update("chartRepoUrl", v)}
                description="HTTP, HTTPS, or OCI registry URL"
              />
              <Input
                label="Chart version"
                placeholder="1.0.0"
                value={form.chartVersion}
                onValueChange={(v) => update("chartVersion", v)}
              />
              <Input
                label="Namespace"
                placeholder="default"
                value={form.namespace}
                onValueChange={(v) => update("namespace", v)}
              />
              <Textarea
                label="Values override (JSON)"
                placeholder='{"replicaCount": 2, "service": {"type": "LoadBalancer"}}'
                value={form.valuesOverride}
                onValueChange={(v) => update("valuesOverride", v)}
                minRows={3}
                maxRows={8}
                description="Optional: Helm values override in JSON format"
              />
            </ModalBody>
            <ModalFooter>
              <Button variant="light" onPress={onClose} isDisabled={saving}>
                Cancel
              </Button>
              <Button
                color="primary"
                isLoading={saving}
                onPress={handleUpgrade}
              >
                Upgrade
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
