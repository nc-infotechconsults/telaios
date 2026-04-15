import { CreatePlanSchema, PatchPlanSchema } from "../../../schemas/plan.schema";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("CreatePlanSchema", () => {
  it("accepts valid input with only required field", () => {
    const result = CreatePlanSchema.safeParse({ project_id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with all fields", () => {
    const result = CreatePlanSchema.safeParse({
      project_id: VALID_UUID,
      title: "My plan",
      status: "draft",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing project_id", () => {
    const result = CreatePlanSchema.safeParse({ title: "My plan" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid project_id (not a uuid)", () => {
    const result = CreatePlanSchema.safeParse({ project_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status enum value", () => {
    const result = CreatePlanSchema.safeParse({
      project_id: VALID_UUID,
      status: "archived",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["draft", "confirmed", "executing", "completed", "failed"]) {
      const result = CreatePlanSchema.safeParse({ project_id: VALID_UUID, status });
      expect(result.success).toBe(true);
    }
  });

  it("strips unknown fields", () => {
    const result = CreatePlanSchema.safeParse({
      project_id: VALID_UUID,
      unknown_field: "value",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).unknown_field).toBeUndefined();
    }
  });
});

describe("PatchPlanSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = PatchPlanSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid partial input", () => {
    const result = PatchPlanSchema.safeParse({ title: "Updated title", status: "confirmed" });
    expect(result.success).toBe(true);
  });

  it("accepts valid confirmed_at as date string", () => {
    const result = PatchPlanSchema.safeParse({ confirmed_at: "2024-01-01T00:00:00.000Z" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status enum", () => {
    const result = PatchPlanSchema.safeParse({ status: "unknown" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid confirmed_at value", () => {
    const result = PatchPlanSchema.safeParse({ confirmed_at: "not-a-date" });
    expect(result.success).toBe(false);
  });
});
