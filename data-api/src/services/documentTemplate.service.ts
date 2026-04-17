import { AppDataSource } from "../configs/data-source.config";
import { DocumentTemplate } from "../entities/DocumentTemplate.entity";
import type { CreateTemplateDto, PatchTemplateDto } from "../schemas/documentTemplate.schema";

const repo = () => AppDataSource.getRepository(DocumentTemplate);

export async function listGlobalTemplates(): Promise<DocumentTemplate[]> {
  return repo().find({
    where: { is_global: true },
    order: { category: "ASC", name: "ASC" },
  });
}

export async function listProjectTemplates(projectId: string): Promise<DocumentTemplate[]> {
  return repo().find({
    where: [
      { is_global: true },
      { project_id: projectId },
    ],
    order: { category: "ASC", name: "ASC" },
  });
}

export async function getTemplate(templateId: string): Promise<DocumentTemplate | null> {
  return repo().findOneBy({ id: templateId });
}

export async function createTemplate(
  projectId: string | null,
  createdBy: string | null,
  dto: CreateTemplateDto,
): Promise<DocumentTemplate> {
  return repo().save(
    repo().create({
      name: dto.name,
      description: dto.description ?? null,
      file_type: dto.file_type,
      category: dto.category ?? null,
      is_global: dto.is_global ?? true,
      project_id: projectId,
      created_by: createdBy,
    }),
  );
}

export async function patchTemplate(templateId: string, dto: PatchTemplateDto): Promise<DocumentTemplate | null> {
  const tmpl = await repo().findOneBy({ id: templateId });
  if (!tmpl) return null;
  if (dto.name !== undefined) tmpl.name = dto.name;
  if (dto.description !== undefined) tmpl.description = dto.description ?? null;
  if (dto.file_type !== undefined) tmpl.file_type = dto.file_type;
  if (dto.category !== undefined) tmpl.category = dto.category ?? null;
  if (dto.is_global !== undefined) tmpl.is_global = dto.is_global;
  return repo().save(tmpl);
}

export async function deleteTemplate(templateId: string): Promise<void> {
  await repo().delete({ id: templateId });
}
