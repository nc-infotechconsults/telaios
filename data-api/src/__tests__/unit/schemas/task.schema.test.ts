import { CreateTaskSchema, PatchTaskSchema } from "../../../schemas/task.schema";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "660e8400-e29b-41d4-a716-446655440001";

describe("CreateTaskSchema", () => {
  it("accepts valid input with required fields only", () => {
    const result = CreateTaskSchema.safeParse({
      plan_id: VALID_UUID,
      title: "Implement login",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with all fields", () => {
    const result = CreateTaskSchema.safeParse({
      plan_id: VALID_UUID,
      title: "Implement login",
      description: "Add JWT login endpoint",
      type: "code",
      status: "pending",
      execution_order: 1,
      agent_profile_id: VALID_UUID_2,
      repository_ids: [VALID_UUID],
      depends_on_task_ids: [VALID_UUID_2],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing plan_id", () => {
    const result = CreateTaskSchema.safeParse({ title: "Task" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid plan_id (not a uuid)", () => {
    const result = CreateTaskSchema.safeParse({ plan_id: "not-uuid", title: "Task" });
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const result = CreateTaskSchema.safeParse({ plan_id: VALID_UUID });
    expect(result.success).toBe(false);
  });

  it("rejects empty title (min 1)", () => {
    const result = CreateTaskSchema.safeParse({ plan_id: VALID_UUID, title: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid type enum", () => {
    const result = CreateTaskSchema.safeParse({ plan_id: VALID_UUID, title: "T", type: "debug" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid type values", () => {
    for (const type of ["code", "test", "review", "general", "knowledge", "infra"]) {
      const result = CreateTaskSchema.safeParse({ plan_id: VALID_UUID, title: "T", type });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status enum", () => {
    const result = CreateTaskSchema.safeParse({ plan_id: VALID_UUID, title: "T", status: "blocked" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["pending", "ready", "in_progress", "done", "failed", "cancelled", "skipped"]) {
      const result = CreateTaskSchema.safeParse({ plan_id: VALID_UUID, title: "T", status });
      expect(result.success).toBe(true);
    }
  });

  it("rejects negative execution_order", () => {
    const result = CreateTaskSchema.safeParse({ plan_id: VALID_UUID, title: "T", execution_order: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer execution_order", () => {
    const result = CreateTaskSchema.safeParse({ plan_id: VALID_UUID, title: "T", execution_order: 1.5 });
    expect(result.success).toBe(false);
  });

  it("accepts execution_order of 0", () => {
    const result = CreateTaskSchema.safeParse({ plan_id: VALID_UUID, title: "T", execution_order: 0 });
    expect(result.success).toBe(true);
  });

  it("rejects invalid uuid in repository_ids", () => {
    const result = CreateTaskSchema.safeParse({
      plan_id: VALID_UUID,
      title: "T",
      repository_ids: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid uuid in depends_on_task_ids", () => {
    const result = CreateTaskSchema.safeParse({
      plan_id: VALID_UUID,
      title: "T",
      depends_on_task_ids: ["bad"],
    });
    expect(result.success).toBe(false);
  });
});

describe("PatchTaskSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = PatchTaskSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid partial input", () => {
    const result = PatchTaskSchema.safeParse({ title: "Updated", status: "in_progress" });
    expect(result.success).toBe(true);
  });

  it("rejects empty title (min 1)", () => {
    const result = PatchTaskSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });

  it("accepts null for agent_profile_id (nullable)", () => {
    const result = PatchTaskSchema.safeParse({ agent_profile_id: null });
    expect(result.success).toBe(true);
  });

  it("rejects invalid type enum", () => {
    const result = PatchTaskSchema.safeParse({ type: "deploy" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid status enum", () => {
    const result = PatchTaskSchema.safeParse({ status: "archived" });
    expect(result.success).toBe(false);
  });
});
