import { PatchSettingsSchema } from "../../../schemas/settings.schema";

describe("PatchSettingsSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = PatchSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid full input", () => {
    const result = PatchSettingsSchema.safeParse({
      llm_provider: "openai",
      llm_model: "gpt-4o",
      llm_api_key_raw: "sk-abc123",
      llm_base_url: "https://api.openai.com/v1",
      llm_temperature: 0.7,
      llm_max_tokens: 2048,
      llm_top_p: 0.9,
      llm_frequency_penalty: 0.0,
      llm_presence_penalty: 0.0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts temperature at boundaries (0 and 2)", () => {
    expect(PatchSettingsSchema.safeParse({ llm_temperature: 0 }).success).toBe(true);
    expect(PatchSettingsSchema.safeParse({ llm_temperature: 2 }).success).toBe(true);
  });

  it("rejects temperature below 0", () => {
    const result = PatchSettingsSchema.safeParse({ llm_temperature: -0.1 });
    expect(result.success).toBe(false);
  });

  it("rejects temperature above 2", () => {
    const result = PatchSettingsSchema.safeParse({ llm_temperature: 2.1 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer llm_max_tokens", () => {
    const result = PatchSettingsSchema.safeParse({ llm_max_tokens: 1.5 });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive llm_max_tokens", () => {
    const result = PatchSettingsSchema.safeParse({ llm_max_tokens: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts top_p at boundaries (0 and 1)", () => {
    expect(PatchSettingsSchema.safeParse({ llm_top_p: 0 }).success).toBe(true);
    expect(PatchSettingsSchema.safeParse({ llm_top_p: 1 }).success).toBe(true);
  });

  it("rejects top_p above 1", () => {
    const result = PatchSettingsSchema.safeParse({ llm_top_p: 1.1 });
    expect(result.success).toBe(false);
  });

  it("accepts frequency_penalty at boundaries (-2 and 2)", () => {
    expect(PatchSettingsSchema.safeParse({ llm_frequency_penalty: -2 }).success).toBe(true);
    expect(PatchSettingsSchema.safeParse({ llm_frequency_penalty: 2 }).success).toBe(true);
  });

  it("rejects frequency_penalty out of range", () => {
    expect(PatchSettingsSchema.safeParse({ llm_frequency_penalty: -2.1 }).success).toBe(false);
    expect(PatchSettingsSchema.safeParse({ llm_frequency_penalty: 2.1 }).success).toBe(false);
  });

  it("accepts presence_penalty at boundaries (-2 and 2)", () => {
    expect(PatchSettingsSchema.safeParse({ llm_presence_penalty: -2 }).success).toBe(true);
    expect(PatchSettingsSchema.safeParse({ llm_presence_penalty: 2 }).success).toBe(true);
  });

  it("rejects presence_penalty out of range", () => {
    expect(PatchSettingsSchema.safeParse({ llm_presence_penalty: 2.5 }).success).toBe(false);
  });

  it("rejects string for numeric field", () => {
    const result = PatchSettingsSchema.safeParse({ llm_temperature: "hot" });
    expect(result.success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = PatchSettingsSchema.safeParse({ unknown_setting: "value" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).unknown_setting).toBeUndefined();
    }
  });
});
