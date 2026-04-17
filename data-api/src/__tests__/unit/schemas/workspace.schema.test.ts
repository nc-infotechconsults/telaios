import {
  CreateWorkspaceSchema,
  PatchWorkspaceSchema,
  WorkspaceConfigSchema,
} from "../../../schemas/workspace.schema";

// ---------------------------------------------------------------------------
// WorkspaceConfigSchema
// ---------------------------------------------------------------------------

describe("WorkspaceConfigSchema", () => {
  it("accepts an empty object (all optional)", () => {
    expect(WorkspaceConfigSchema.safeParse({}).success).toBe(true);
  });

  it("accepts full config object", () => {
    const result = WorkspaceConfigSchema.safeParse({
      repositories: { "my-repo": { branch: "main", enabled: true } },
      env_vars: { NODE_ENV: "production" },
      devcontainer_overrides: {
        image: "node:20",
        postCreateCommand: "npm install",
        extensions: ["ms-vscode.vscode-typescript-next"],
      },
      default_open_files: ["src/index.ts"],
      agent_profile_id: "ap-123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-string env_var values", () => {
    const result = WorkspaceConfigSchema.safeParse({
      env_vars: { NODE_ENV: 123 },
    });
    expect(result.success).toBe(false);
  });

  it("allows partial devcontainer_overrides", () => {
    const result = WorkspaceConfigSchema.safeParse({
      devcontainer_overrides: { image: "ubuntu:22.04" },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CreateWorkspaceSchema
// ---------------------------------------------------------------------------

describe("CreateWorkspaceSchema", () => {
  it("accepts name only", () => {
    const result = CreateWorkspaceSchema.safeParse({ name: "My Workspace" });
    expect(result.success).toBe(true);
  });

  it("accepts name with full config", () => {
    const result = CreateWorkspaceSchema.safeParse({
      name: "Full Workspace",
      config: { agent_profile_id: "ap-1" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = CreateWorkspaceSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty string name", () => {
    const result = CreateWorkspaceSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name as a number", () => {
    const result = CreateWorkspaceSchema.safeParse({ name: 42 });
    expect(result.success).toBe(false);
  });

  it("strips unknown top-level fields", () => {
    const result = CreateWorkspaceSchema.safeParse({ name: "ws", unknown_field: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).unknown_field).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// PatchWorkspaceSchema
// ---------------------------------------------------------------------------

describe("PatchWorkspaceSchema", () => {
  it("accepts empty object (all optional)", () => {
    expect(PatchWorkspaceSchema.safeParse({}).success).toBe(true);
  });

  it("accepts all patch fields", () => {
    const result = PatchWorkspaceSchema.safeParse({
      name: "Updated",
      status: "running",
      container_id: "c-abc",
      container_image: "node:20",
      ide_url: "https://ide.example.com",
      config: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status enum", () => {
    const result = PatchWorkspaceSchema.safeParse({ status: "broken" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["idle", "starting", "running", "sleeping", "error"]) {
      expect(PatchWorkspaceSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects empty name string", () => {
    const result = PatchWorkspaceSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});
