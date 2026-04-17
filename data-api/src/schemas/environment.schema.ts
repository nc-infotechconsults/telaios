import { z } from "zod";

export const EnvironmentTypeSchema = z.enum(["kubernetes", "docker"]);
export const EnvironmentStatusSchema = z.enum(["connected", "disconnected", "error"]);

export const KubernetesConnectionSchema = z.object({
  type: z.literal("kubernetes"),
  kubeconfig: z.string().optional(),
  cluster_url: z.string().optional(),
  token: z.string().optional(),
  ca_cert: z.string().optional(),
  context_name: z.string().optional(),
});

export const DockerConnectionSchema = z.object({
  type: z.literal("docker"),
  host: z.string().optional(),
  tls_cert: z.string().optional(),
  tls_key: z.string().optional(),
  tls_ca: z.string().optional(),
});

export const ConnectionConfigSchema = z.discriminatedUnion("type", [
  KubernetesConnectionSchema,
  DockerConnectionSchema,
]);

export const CreateEnvironmentSchema = z.object({
  name: z.string().min(1),
  type: EnvironmentTypeSchema,
  connection_config: ConnectionConfigSchema.optional(),
  namespace: z.string().optional(),
});

export const PatchEnvironmentSchema = z.object({
  name: z.string().min(1).optional(),
  type: EnvironmentTypeSchema.optional(),
  status: EnvironmentStatusSchema.optional(),
  connection_config: ConnectionConfigSchema.optional(),
  namespace: z.string().optional(),
});

export const HelmReleaseStatusSchema = z.enum(["pending", "deployed", "failed", "uninstalled"]);

export const InstallHelmChartSchema = z.object({
  release_name: z.string().min(1),
  chart_name: z.string().min(1),
  chart_repo_url: z.string().optional(),
  chart_version: z.string().optional(),
  namespace: z.string().optional(),
  values_override: z.record(z.string(), z.unknown()).optional(),
  /** Path to a Chart.yaml inside a cloned project repo, used for local charts */
  local_chart_path: z.string().optional(),
});

export const UpgradeHelmChartSchema = InstallHelmChartSchema.partial().extend({
  release_name: z.string().min(1),
});

export type CreateEnvironmentDto = z.infer<typeof CreateEnvironmentSchema>;
export type PatchEnvironmentDto = z.infer<typeof PatchEnvironmentSchema>;
export type InstallHelmChartDto = z.infer<typeof InstallHelmChartSchema>;
export type UpgradeHelmChartDto = z.infer<typeof UpgradeHelmChartSchema>;
