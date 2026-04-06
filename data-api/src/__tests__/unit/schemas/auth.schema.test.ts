import { RegisterSchema, LoginSchema } from "../../../schemas/auth.schema";

describe("RegisterSchema", () => {
  it("accepts valid input", () => {
    const result = RegisterSchema.safeParse({
      email: "user@example.com",
      password: "password123",
      display_name: "Alice",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = RegisterSchema.safeParse({
      email: "not-an-email",
      password: "password123",
      display_name: "Alice",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password shorter than 8 characters", () => {
    const result = RegisterSchema.safeParse({
      email: "user@example.com",
      password: "short",
      display_name: "Alice",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty display_name", () => {
    const result = RegisterSchema.safeParse({
      email: "user@example.com",
      password: "password123",
      display_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing fields", () => {
    const result = RegisterSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(false);
  });
});

describe("LoginSchema", () => {
  it("accepts valid input", () => {
    const result = LoginSchema.safeParse({
      email: "user@example.com",
      password: "any",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = LoginSchema.safeParse({ email: "bad", password: "pass" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = LoginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});
