import { PatchUserSchema } from "../../../schemas/user.schema";

describe("PatchUserSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = PatchUserSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid full input", () => {
    const result = PatchUserSchema.safeParse({
      display_name: "Alice",
      system_role: "admin",
      is_active: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid partial input", () => {
    const result = PatchUserSchema.safeParse({ display_name: "Bob" });
    expect(result.success).toBe(true);
  });

  it("rejects empty display_name (min 1)", () => {
    const result = PatchUserSchema.safeParse({ display_name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid system_role enum", () => {
    const result = PatchUserSchema.safeParse({ system_role: "superadmin" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid system_role values", () => {
    for (const system_role of ["admin", "member"]) {
      const result = PatchUserSchema.safeParse({ system_role });
      expect(result.success).toBe(true);
    }
  });

  it("rejects string for is_active (must be boolean)", () => {
    const result = PatchUserSchema.safeParse({ is_active: "true" });
    expect(result.success).toBe(false);
  });

  it("accepts is_active as false", () => {
    const result = PatchUserSchema.safeParse({ is_active: false });
    expect(result.success).toBe(true);
  });

  it("strips unknown fields", () => {
    const result = PatchUserSchema.safeParse({ extra: "data" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).extra).toBeUndefined();
    }
  });
});
