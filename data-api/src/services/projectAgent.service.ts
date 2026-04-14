import { AppDataSource } from "../configs/data-source.config";
import { ProjectAgent } from "../entities/ProjectAgent.entity";
import type { AssignAgentDto, PatchProjectAgentDto } from "../schemas/projectAgent.schema";

const repo = () => AppDataSource.getRepository(ProjectAgent);

export async function listProjectAgents(projectId: string): Promise<ProjectAgent[]> {
  return repo().find({
    where: { project_id: projectId },
    relations: ["agent_profile"],
    order: { assigned_at: "ASC" },
  });
}

export async function assignAgent(
  projectId: string,
  dto: AssignAgentDto,
): Promise<ProjectAgent> {
  // Restore a soft-deleted assignment rather than creating a duplicate.
  const existing = await repo().findOne({
    where: { project_id: projectId, agent_profile_id: dto.agent_profile_id },
    withDeleted: true,
  });

  if (existing) {
    existing.role = dto.role;
    existing.scope = dto.scope ?? null;
    existing.deleted_at = null;
    return repo().save(existing);
  }

  return repo().save(
    repo().create({
      project_id: projectId,
      agent_profile_id: dto.agent_profile_id,
      role: dto.role,
      scope: dto.scope ?? null,
    }),
  );
}

export async function patchProjectAgent(
  projectId: string,
  agentId: string,
  dto: PatchProjectAgentDto,
): Promise<ProjectAgent | null> {
  const assignment = await repo().findOneBy({ id: agentId, project_id: projectId });
  if (!assignment) return null;

  if (dto.role !== undefined) assignment.role = dto.role;
  if (dto.scope !== undefined) assignment.scope = dto.scope ?? null;

  return repo().save(assignment);
}

export async function removeProjectAgent(
  projectId: string,
  agentId: string,
): Promise<void> {
  await repo().softDelete({ id: agentId, project_id: projectId });
}
