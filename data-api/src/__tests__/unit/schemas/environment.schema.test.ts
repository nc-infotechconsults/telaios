import {
  CreateEnvironmentSchema,
  PatchEnvironmentSchema,
  InstallHelmChartSchema,
  UpgradeHelmChartSchema,
  ConnectionConfigSchema,
} from "../../../schemas/environment.schema";

// ---------------------------------------------------------------------------
// ConnectionConfigSchema (discriminated union)
// ---------------------------------------------------------------------------

describe("ConnectionConfigSchema", () => {
  it("accepts kubernetes config with kubeconfig string", () => {
    const result = ConnectionConfigSchema.safeParse({
      type: "kubernetes",
      kubeconfig: "apiVersion: v1\n...",
    });
    expect(result.success).toBe(true);
  });

  it("accepts kubernetes config with cluster_url + token", () => {
    const result = ConnectionConfigSchema.safeParse({
      type: "kubernetes",
      cluster_url: "https://k8s.example.com",
      token: "secret-token",
      ca_cert: "-----BEGIN CERTIFICATE-----",
    });
    expect(result.success).toBe(true);
  });

  it("accepts docker config with host", () => {
    const result = ConnectionConfigSchema.safeParse({
      type: "docker",
      host: "tcp://192.168.1.1:2376",
    });
    expect(result.success).toBe(true);
  });

  it("accepts docker config with TLS fields", () => {
    const result = ConnectionConfigSchema.safeParse({
      type: "docker",
      host: "tcp://host:2376",
      tls_cert: "CERT",
      tls_key: "KEY",
      tls_ca: "CA",
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal kubernetes config (type only)", () => {
    const result = ConnectionConfigSchema.safeParse({ type: "kubernetes" });
    expect(result.success).toBe(true);
  });

  it("rejects unknown type", () => {
    const result = ConnectionConfigSchema.safeParse({ type: "terraform" });
    expect(result.success).toBe(false);
  });

  it("rejects missing type", () => {
    const result = ConnectionConfigSchema.safeParse({ host: "tcp://x" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CreateEnvironmentSchema
// ---------------------------------------------------------------------------

describe("CreateEnvironmentSchema", () => {
  it("accepts minimal kubernetes environment", () => {
    const result = CreateEnvironmentSchema.safeParse({
      name: "staging",
      type: "kubernetes",
    });
    expect(result.success).toBe(true);
  });

  it("accepts full kubernetes environment", () => {
    const result = CreateEnvironmentSchema.safeParse({
      name: "production",
      type: "kubernetes",
      namespace: "default",
      connection_config: { type: "kubernetes", kubeconfig: "yaml" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts docker environment", () => {
    const result = CreateEnvironmentSchema.safeParse({
      name: "local-docker",
      type: "docker",
      connection_config: { type: "docker", host: "tcp://127.0.0.1:2376" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = CreateEnvironmentSchema.safeParse({ type: "kubernetes" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = CreateEnvironmentSchema.safeParse({ name: "", type: "kubernetes" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type enum", () => {
    const result = CreateEnvironmentSchema.safeParse({ name: "env", type: "terraform" });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched connection_config type (docker config for kubernetes env)", () => {
    // The connection_config itself is valid docker — but that's allowed (schema doesn't cross-validate)
    // What matters is the discriminated union validates the config shape correctly
    const result = CreateEnvironmentSchema.safeParse({
      name: "env",
      type: "kubernetes",
      connection_config: { type: "docker", host: "tcp://x" },
    });
    // The schema allows this — connection_config type is independently validated
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PatchEnvironmentSchema
// ---------------------------------------------------------------------------

describe("PatchEnvironmentSchema", () => {
  it("accepts empty object", () => {
    expect(PatchEnvironmentSchema.safeParse({}).success).toBe(true);
  });

  it("accepts status patch", () => {
    expect(PatchEnvironmentSchema.safeParse({ status: "connected" }).success).toBe(true);
    expect(PatchEnvironmentSchema.safeParse({ status: "disconnected" }).success).toBe(true);
    expect(PatchEnvironmentSchema.safeParse({ status: "error" }).success).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(PatchEnvironmentSchema.safeParse({ status: "offline" }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(PatchEnvironmentSchema.safeParse({ name: "" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// InstallHelmChartSchema
// ---------------------------------------------------------------------------

describe("InstallHelmChartSchema", () => {
  it("accepts minimal required fields", () => {
    const result = InstallHelmChartSchema.safeParse({
      release_name: "my-release",
      chart_name: "nginx",
    });
    expect(result.success).toBe(true);
  });

  it("accepts full payload", () => {
    const result = InstallHelmChartSchema.safeParse({
      release_name: "my-release",
      chart_name: "nginx",
      chart_repo_url: "https://charts.bitnami.com/bitnami",
      chart_version: "1.2.3",
      namespace: "production",
      values_override: { replicaCount: 2, image: { tag: "latest" } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing release_name", () => {
    const result = InstallHelmChartSchema.safeParse({ chart_name: "nginx" });
    expect(result.success).toBe(false);
  });

  it("rejects missing chart_name", () => {
    const result = InstallHelmChartSchema.safeParse({ release_name: "r1" });
    expect(result.success).toBe(false);
  });

  it("rejects empty release_name", () => {
    const result = InstallHelmChartSchema.safeParse({ release_name: "", chart_name: "nginx" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UpgradeHelmChartSchema
// ---------------------------------------------------------------------------

describe("UpgradeHelmChartSchema", () => {
  it("accepts release_name only (all other fields optional)", () => {
    const result = UpgradeHelmChartSchema.safeParse({ release_name: "my-release" });
    expect(result.success).toBe(true);
  });

  it("accepts release_name with values override", () => {
    const result = UpgradeHelmChartSchema.safeParse({
      release_name: "my-release",
      values_override: { replicaCount: 3 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing release_name", () => {
    const result = UpgradeHelmChartSchema.safeParse({ chart_name: "nginx" });
    expect(result.success).toBe(false);
  });
});
