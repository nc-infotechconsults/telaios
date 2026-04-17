import { useState } from "react";
import {
  Button,
  Input,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Textarea,
} from "@heroui/react";
import { installHelmChart, scanProjectCharts } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { HelmRelease } from "../../types";

interface Props {
  isOpen: boolean;
  onOpenChange: () => void;
  environmentId: string;
  onInstall: (release: HelmRelease) => void;
}

interface ProjectChart {
  name: string;
  version: string;
  description: string;
  localPath?: string;
}

const EMPTY_FORM = {
  releaseName: "",
  chartName: "",
  chartRepoUrl: "",
  chartVersion: "",
  namespace: "",
  valuesOverride: "",
};

export default function HelmInstallModal({
  isOpen,
  onOpenChange,
  environmentId,
  onInstall,
}: Props) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [projectCharts, setProjectCharts] = useState<ProjectChart[]>([]);

  const isFormValid = form.releaseName.trim().length > 0 && form.chartName.trim().length > 0;

  function resetForm() {
    setForm(EMPTY_FORM);
    setProjectCharts([]);
  }

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleScan() {
    setScanning(true);
    try {
      const charts = await scanProjectCharts(environmentId);
      setProjectCharts(charts);
      if (charts.length === 0) {
        toast.info("No charts found", "No Helm charts detected in project repositories");
      }
    } catch {
      toast.error("Failed to scan for charts");
    } finally {
      setScanning(false);
    }
  }

  function selectProjectChart(chart: ProjectChart) {
    setForm((f) => ({
      ...f,
      chartName: chart.name,
      chartVersion: chart.version,
    }));
  }

  async function handleInstall() {
    if (!isFormValid) return;
    setSaving(true);
    try {
      // Parse values override JSON
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

      const release = await installHelmChart(environmentId, {
        release_name: form.releaseName.trim(),
        chart_name: form.chartName.trim(),
        chart_repo_url: form.chartRepoUrl.trim() || undefined,
        chart_version: form.chartVersion.trim() || undefined,
        namespace: form.namespace.trim() || undefined,
        values_override: valuesOverride,
      });
      toast.success("Chart installed", release.name);
      onInstall(release);
      resetForm();
      onOpenChange();
    } catch {
      toast.error("Failed to install Helm chart");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl" scrollBehavior="inside">
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader>Install Helm Chart</ModalHeader>
            <ModalBody className="flex flex-col gap-5">
              {/* Scan project charts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Discover Charts</p>
                  <Button size="sm" variant="flat" onPress={handleScan} isLoading={scanning}>
                    Scan Project
                  </Button>
                </div>
                {projectCharts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {projectCharts.map((chart) => (
                      <div
                        key={chart.name}
                        className="flex items-center gap-3 p-2 rounded-lg border border-divider hover:border-primary/30 cursor-pointer transition-all"
                        onClick={() => selectProjectChart(chart)}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{chart.name}</p>
                          <p className="text-xs text-default-400">
                            v{chart.version}{chart.description ? ` — ${chart.description}` : ""}
                          </p>
                        </div>
                        <Button size="sm" variant="light" color="primary">
                          Use
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Form */}
              <Input
                label="Release name"
                placeholder="my-release"
                value={form.releaseName}
                onValueChange={(v) => update("releaseName", v)}
                isRequired
              />
              <Input
                label="Chart name"
                placeholder="nginx or bitnami/nginx"
                value={form.chartName}
                onValueChange={(v) => update("chartName", v)}
                isRequired
              />
              <Input
                label="Chart repository URL"
                placeholder="https://charts.bitnami.com/bitnami"
                value={form.chartRepoUrl}
                onValueChange={(v) => update("chartRepoUrl", v)}
                description="Required for remote charts"
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
                isDisabled={!isFormValid}
                onPress={handleInstall}
              >
                Install
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
