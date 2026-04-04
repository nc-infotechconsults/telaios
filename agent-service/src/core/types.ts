export interface McpServer {
  name: string;
  transport: "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface Skill {
  name: string;
  description: string;
  parameters: Record<string, "string" | "number" | "boolean">;
  outputs?: Record<string, "string" | "number" | "boolean">;
  instructions: string;
}
