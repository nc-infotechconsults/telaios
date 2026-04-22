import { z } from "zod";

const StdioMcpSchema = z.object({
  transport: z.literal("stdio"),
  command: z.string().min(1, "command is required for stdio transport"),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  url: z.undefined().optional(),
  headers: z.undefined().optional(),
});

const HttpMcpSchema = z.object({
  transport: z.literal("streamable-http"),
  url: z.string().url("url must be a valid URL for streamable-http transport"),
  headers: z.record(z.string(), z.string()).optional(),
  command: z.undefined().optional(),
  args: z.undefined().optional(),
  env: z.undefined().optional(),
});

const TransportSchema = z.discriminatedUnion("transport", [StdioMcpSchema, HttpMcpSchema]);

const BaseLibraryMcpFields = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case"),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().optional(),
});

export const CreateLibraryMcpSchema = BaseLibraryMcpFields.and(TransportSchema);

export const PatchLibraryMcpSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    version: z.string().optional(),
    // transport fields — all optional on patch; validated together below
    transport: z.enum(["stdio", "streamable-http"]).optional(),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    url: z.string().url().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  })
  .refine(
    (d) => {
      if (d.transport === "stdio" && d.url !== undefined) return false;
      if (d.transport === "streamable-http" && d.command !== undefined) return false;
      return true;
    },
    { message: "command is for stdio, url/headers are for streamable-http" },
  );

export const LibraryMcpQuerySchema = z.object({
  q: z.string().optional(),
  tags: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type CreateLibraryMcpDto = z.infer<typeof CreateLibraryMcpSchema>;
export type PatchLibraryMcpDto = z.infer<typeof PatchLibraryMcpSchema>;
export type LibraryMcpQueryDto = z.infer<typeof LibraryMcpQuerySchema>;
