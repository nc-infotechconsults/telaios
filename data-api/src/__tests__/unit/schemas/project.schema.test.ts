import { CreateProjectSchema, PatchProjectSchema } from "../../../schemas/project.schema";

describe("CreateProjectSchema", () => {
  it("accepts valid input with only required field", () => {
    const result = CreateProjectSchema.safeParse({ name: "My project" });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with all fields", () => {
    const result = CreateProjectSchema.safeParse({
      name: "My project",
      description: "A description",
      status: "planning",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = CreateProjectSchema.safeParse({ description: "desc" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name (min 1)", () => {
    const result = CreateProjectSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status enum", () => {
    const result = CreateProjectSchema.safeParse({ name: "proj", status: "archived" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["planning", "executing", "done"]) {
      const result = CreateProjectSchema.safeParse({ name: "proj", status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects name as number", () => {
    const result = CreateProjectSchema.safeParse({ name: 123 });
    expect(result.success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = CreateProjectSchema.safeParse({ name: "proj", extra: "data" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extra).toBeUndefined();
    }
  });
});

describe("PatchProjectSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = PatchProjectSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid partial input", () => {
    const result = PatchProjectSchema.safeParse({ name: "New name" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name string (min 1)", () => {
    const result = PatchProjectSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status enum", () => {
    const result = PatchProjectSchema.safeParse({ status: "deleted" });
    expect(result.success).toBe(false);
  });
});
