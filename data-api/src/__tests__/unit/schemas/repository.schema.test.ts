import { CreateRepositorySchema, PatchRepositorySchema } from "../../../schemas/repository.schema";

describe("CreateRepositorySchema", () => {
  it("accepts valid input with only required field", () => {
    const result = CreateRepositorySchema.safeParse({ name: "my-repo" });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with all fields", () => {
    const result = CreateRepositorySchema.safeParse({
      name: "my-repo",
      remote_url: "https://github.com/org/repo",
      branch: "main",
      auth_type: "token",
      credentials: "ghp_token123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = CreateRepositorySchema.safeParse({ remote_url: "https://github.com/org/repo" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name (min 1)", () => {
    const result = CreateRepositorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid auth_type enum", () => {
    const result = CreateRepositorySchema.safeParse({ name: "repo", auth_type: "oauth" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid auth_type values", () => {
    for (const auth_type of ["none", "token", "ssh"]) {
      const result = CreateRepositorySchema.safeParse({ name: "repo", auth_type });
      expect(result.success).toBe(true);
    }
  });

  it("strips unknown fields", () => {
    const result = CreateRepositorySchema.safeParse({ name: "repo", unknown: "field" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).unknown).toBeUndefined();
    }
  });
});

describe("PatchRepositorySchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = PatchRepositorySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid partial input", () => {
    const result = PatchRepositorySchema.safeParse({ branch: "develop", status: "ready" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name string (min 1)", () => {
    const result = PatchRepositorySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid auth_type enum", () => {
    const result = PatchRepositorySchema.safeParse({ auth_type: "password" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status enum", () => {
    const result = PatchRepositorySchema.safeParse({ status: "syncing" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["unconfigured", "cloning", "ready", "error"]) {
      const result = PatchRepositorySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });
});
