import { CreateAgentProfileSchema, PatchAgentProfileSchema } from "../../../schemas/agentProfile.schema";

describe("CreateAgentProfileSchema", () => {
  it("accepts valid input with only required field", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "My Agent" });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with all scalar fields", () => {
    const result = CreateAgentProfileSchema.safeParse({
      name: "My Agent",
      description: "Handles code tasks",
      agent_type: "langgraph",
      llm_provider: "openai",
      llm_model: "gpt-4o",
      llm_api_key: "sk-abc",
      llm_base_url: "https://api.openai.com/v1",
      github_token: "ghp_token",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing name", () => {
    const result = CreateAgentProfileSchema.safeParse({ agent_type: "langgraph" });
    expect(result.success).toBe(false);
  });

  it("rejects empty name (min 1)", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid agent_type enum", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", agent_type: "custom-bot" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid agent_type values", () => {
    for (const agent_type of ["langgraph", "opencode", "github-copilot"]) {
      const result = CreateAgentProfileSchema.safeParse({ name: "Agent", agent_type });
      expect(result.success).toBe(true);
    }
  });

  it("accepts valid mcp_servers array", () => {
    const result = CreateAgentProfileSchema.safeParse({
      name: "Agent",
      mcp_servers: [
        {
          name: "filesystem",
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid mcp_server transport", () => {
    const result = CreateAgentProfileSchema.safeParse({
      name: "Agent",
      mcp_servers: [{ name: "srv", transport: "websocket" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid skills array", () => {
    const result = CreateAgentProfileSchema.safeParse({
      name: "Agent",
      skills: [
        {
          name: "run_code",
          description: "Runs code in a sandbox",
          instructions: "Execute the provided code snippet",
          inputSchema: {
            type: "object",
            properties: { code: { type: "string" } },
            required: ["code"],
          },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects skill with missing required fields", () => {
    const result = CreateAgentProfileSchema.safeParse({
      name: "Agent",
      skills: [{ name: "broken_skill" }],
    });
    expect(result.success).toBe(false);
  });

  it("strips unknown fields", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", unknown: "field" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).unknown).toBeUndefined();
    }
  });

  // ── New configurable fields ─────────────────────────────────────────────────

  it("accepts system_prompt as a non-empty string", () => {
    const result = CreateAgentProfileSchema.safeParse({
      name: "Agent",
      system_prompt: "You are a specialized agent.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts system_prompt as null", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", system_prompt: null });
    expect(result.success).toBe(true);
  });

  it("accepts valid system_prompt_mode values", () => {
    for (const mode of ["override", "extend"]) {
      const result = CreateAgentProfileSchema.safeParse({ name: "Agent", system_prompt_mode: mode });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid system_prompt_mode", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", system_prompt_mode: "append" });
    expect(result.success).toBe(false);
  });

  it("accepts llm_temperature within 0–2", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", llm_temperature: 0.7 });
    expect(result.success).toBe(true);
  });

  it("rejects llm_temperature below 0", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", llm_temperature: -0.1 });
    expect(result.success).toBe(false);
  });

  it("rejects llm_temperature above 2", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", llm_temperature: 2.5 });
    expect(result.success).toBe(false);
  });

  it("accepts llm_max_tokens as a positive integer", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", llm_max_tokens: 4096 });
    expect(result.success).toBe(true);
  });

  it("rejects llm_max_tokens as zero", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", llm_max_tokens: 0 });
    expect(result.success).toBe(false);
  });

  it("accepts llm_top_p within 0–1", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", llm_top_p: 0.9 });
    expect(result.success).toBe(true);
  });

  it("rejects llm_top_p above 1", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", llm_top_p: 1.1 });
    expect(result.success).toBe(false);
  });

  it("accepts llm_frequency_penalty within -2 to 2", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", llm_frequency_penalty: -1.5 });
    expect(result.success).toBe(true);
  });

  it("rejects llm_frequency_penalty outside -2 to 2", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", llm_frequency_penalty: 3.0 });
    expect(result.success).toBe(false);
  });

  it("accepts llm_presence_penalty within -2 to 2", () => {
    const result = CreateAgentProfileSchema.safeParse({ name: "Agent", llm_presence_penalty: 0.5 });
    expect(result.success).toBe(true);
  });

  it("accepts sub_agent_ids as an array of UUIDs", () => {
    const result = CreateAgentProfileSchema.safeParse({
      name: "Agent",
      sub_agent_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects sub_agent_ids containing non-UUID strings", () => {
    const result = CreateAgentProfileSchema.safeParse({
      name: "Agent",
      sub_agent_ids: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all new configurable fields together", () => {
    const result = CreateAgentProfileSchema.safeParse({
      name: "Configurable Agent",
      system_prompt: "You specialise in security auditing.",
      system_prompt_mode: "extend",
      llm_temperature: 0.4,
      llm_max_tokens: 2048,
      llm_top_p: 0.95,
      llm_frequency_penalty: 0.1,
      llm_presence_penalty: -0.1,
      sub_agent_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts null for all nullable LLM params", () => {
    const result = CreateAgentProfileSchema.safeParse({
      name: "Agent",
      llm_temperature: null,
      llm_max_tokens: null,
      llm_top_p: null,
      llm_frequency_penalty: null,
      llm_presence_penalty: null,
    });
    expect(result.success).toBe(true);
  });
});

describe("PatchAgentProfileSchema", () => {
  it("accepts empty object (all fields optional)", () => {
    const result = PatchAgentProfileSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts valid partial input", () => {
    const result = PatchAgentProfileSchema.safeParse({ description: "Updated description" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name when provided (min 1)", () => {
    const result = PatchAgentProfileSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid agent_type enum when provided", () => {
    const result = PatchAgentProfileSchema.safeParse({ agent_type: "unknown-agent" });
    expect(result.success).toBe(false);
  });

  it("accepts system_prompt and system_prompt_mode", () => {
    const result = PatchAgentProfileSchema.safeParse({
      system_prompt: "New prompt",
      system_prompt_mode: "override",
    });
    expect(result.success).toBe(true);
  });

  it("accepts sub_agent_ids update", () => {
    const result = PatchAgentProfileSchema.safeParse({
      sub_agent_ids: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts llm_temperature update", () => {
    const result = PatchAgentProfileSchema.safeParse({ llm_temperature: 1.2 });
    expect(result.success).toBe(true);
  });

  it("rejects invalid llm_temperature in patch", () => {
    const result = PatchAgentProfileSchema.safeParse({ llm_temperature: 5 });
    expect(result.success).toBe(false);
  });
});
