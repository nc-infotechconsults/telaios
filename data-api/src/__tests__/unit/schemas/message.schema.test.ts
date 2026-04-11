import { CreateMessageSchema } from "../../../schemas/message.schema";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "660e8400-e29b-41d4-a716-446655440001";

describe("CreateMessageSchema", () => {
  it("accepts valid input with required fields only", () => {
    const result = CreateMessageSchema.safeParse({
      project_id: VALID_UUID,
      role: "user",
      content: "Hello, agent!",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with optional plan_id", () => {
    const result = CreateMessageSchema.safeParse({
      project_id: VALID_UUID,
      plan_id: VALID_UUID_2,
      role: "assistant",
      content: "Sure, I can help.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing project_id", () => {
    const result = CreateMessageSchema.safeParse({ role: "user", content: "Hi" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid project_id (not a uuid)", () => {
    const result = CreateMessageSchema.safeParse({
      project_id: "not-a-uuid",
      role: "user",
      content: "Hi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid plan_id (not a uuid)", () => {
    const result = CreateMessageSchema.safeParse({
      project_id: VALID_UUID,
      plan_id: "bad-id",
      role: "user",
      content: "Hi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing role", () => {
    const result = CreateMessageSchema.safeParse({ project_id: VALID_UUID, content: "Hi" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role enum", () => {
    const result = CreateMessageSchema.safeParse({
      project_id: VALID_UUID,
      role: "bot",
      content: "Hi",
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid role values", () => {
    for (const role of ["user", "assistant", "system"]) {
      const result = CreateMessageSchema.safeParse({
        project_id: VALID_UUID,
        role,
        content: "Hello",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects missing content", () => {
    const result = CreateMessageSchema.safeParse({ project_id: VALID_UUID, role: "user" });
    expect(result.success).toBe(false);
  });

  it("rejects empty content (min 1)", () => {
    const result = CreateMessageSchema.safeParse({
      project_id: VALID_UUID,
      role: "user",
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = CreateMessageSchema.safeParse({
      project_id: VALID_UUID,
      role: "user",
      content: "Hi",
      extra: "field",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extra).toBeUndefined();
    }
  });
});
