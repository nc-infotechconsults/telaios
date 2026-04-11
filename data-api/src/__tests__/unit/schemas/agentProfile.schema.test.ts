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
});
