import { AddMemberSchema, PatchMemberSchema } from "../../../schemas/projectMember.schema";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("AddMemberSchema", () => {
  it("accepts valid input with only required field", () => {
    const result = AddMemberSchema.safeParse({ user_id: VALID_UUID });
    expect(result.success).toBe(true);
  });

  it("defaults role to 'viewer' when omitted", () => {
    const result = AddMemberSchema.safeParse({ user_id: VALID_UUID });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe("viewer");
    }
  });

  it("accepts valid role values", () => {
    for (const role of ["owner", "editor", "viewer"]) {
      const result = AddMemberSchema.safeParse({ user_id: VALID_UUID, role });
      expect(result.success).toBe(true);
    }
  });

  it("rejects missing user_id", () => {
    const result = AddMemberSchema.safeParse({ role: "viewer" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid user_id (not a uuid)", () => {
    const result = AddMemberSchema.safeParse({ user_id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role enum", () => {
    const result = AddMemberSchema.safeParse({ user_id: VALID_UUID, role: "admin" });
    expect(result.success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = AddMemberSchema.safeParse({ user_id: VALID_UUID, extra: "data" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extra).toBeUndefined();
    }
  });
});

describe("PatchMemberSchema", () => {
  it("accepts valid role", () => {
    const result = PatchMemberSchema.safeParse({ role: "editor" });
    expect(result.success).toBe(true);
  });

  it("rejects missing role", () => {
    const result = PatchMemberSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid role enum", () => {
    const result = PatchMemberSchema.safeParse({ role: "superuser" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid role values", () => {
    for (const role of ["owner", "editor", "viewer"]) {
      const result = PatchMemberSchema.safeParse({ role });
      expect(result.success).toBe(true);
    }
  });
});
