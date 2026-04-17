import { AssignAgentSchema, PatchProjectAgentSchema } from "../../../schemas/projectAgent.schema";

describe("AssignAgentSchema", () => {
  it("accepts a valid assignment with required fields", () => {
    const result = AssignAgentSchema.safeParse({
      agent_profile_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "planner",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid role values", () => {
    const roles = ["planner", "coder", "reviewer", "tester", "infra", "knowledge", "custom"];
    for (const role of roles) {
      const result = AssignAgentSchema.safeParse({
        agent_profile_id: "550e8400-e29b-41d4-a716-446655440000",
        role,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts optional scope as an object", () => {
    const result = AssignAgentSchema.safeParse({
      agent_profile_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "coder",
      scope: { language: "typescript" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts scope as null", () => {
    const result = AssignAgentSchema.safeParse({
      agent_profile_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "coder",
      scope: null,
    });
    expect(result.success).toBe(true);
  });

  it("defaults scope to null when omitted", () => {
    const result = AssignAgentSchema.safeParse({
      agent_profile_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "planner",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scope).toBeNull();
    }
  });

  it("rejects missing agent_profile_id", () => {
    const result = AssignAgentSchema.safeParse({ role: "planner" });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID agent_profile_id", () => {
    const result = AssignAgentSchema.safeParse({ agent_profile_id: "not-a-uuid", role: "planner" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = AssignAgentSchema.safeParse({
      agent_profile_id: "550e8400-e29b-41d4-a716-446655440000",
      role: "manager",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing role", () => {
    const result = AssignAgentSchema.safeParse({
      agent_profile_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });
});

describe("PatchProjectAgentSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    const result = PatchProjectAgentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid partial role update", () => {
    const result = PatchProjectAgentSchema.safeParse({ role: "reviewer" });
    expect(result.success).toBe(true);
  });

  it("accepts scope update to null", () => {
    const result = PatchProjectAgentSchema.safeParse({ scope: null });
    expect(result.success).toBe(true);
  });

  it("accepts scope update to object", () => {
    const result = PatchProjectAgentSchema.safeParse({ scope: { area: "backend" } });
    expect(result.success).toBe(true);
  });

  it("rejects invalid role enum", () => {
    const result = PatchProjectAgentSchema.safeParse({ role: "admin" });
    expect(result.success).toBe(false);
  });
});
