import { z } from "zod";

export const CreateFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parent_folder_id: z.string().uuid().nullable().optional().default(null),
});

export const PatchFolderSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parent_folder_id: z.string().uuid().nullable().optional(),
});

export type CreateFolderDto = z.infer<typeof CreateFolderSchema>;
export type PatchFolderDto = z.infer<typeof PatchFolderSchema>;
