import { AppDataSource } from "../data-source";
import { ProjectMember, type ProjectRole } from "../entities/ProjectMember";
import type { AddMemberDto, PatchMemberDto } from "../schemas/projectMember.schema";

const repo = () => AppDataSource.getRepository(ProjectMember);

const ROLE_RANK: Record<ProjectRole, number> = { viewer: 0, editor: 1, owner: 2 };

export function hasMinRole(userRole: ProjectRole, minRole: ProjectRole): boolean {
  return ROLE_RANK[userRole] >= ROLE_RANK[minRole];
}

export async function getMembership(
  userId: string,
  projectId: string
): Promise<ProjectMember | null> {
  return repo().findOneBy({ user_id: userId, project_id: projectId });
}

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  display_name: true,
  system_role: true,
  is_active: true,
  created_at: true,
  updated_at: true,
} as const;

export async function listMembers(projectId: string) {
  return repo().find({
    where: { project_id: projectId },
    relations: ["user"],
    select: { user_id: true, project_id: true, role: true, joined_at: true, user: SAFE_USER_SELECT },
    order: { joined_at: "ASC" },
  });
}

export async function addMember(projectId: string, dto: AddMemberDto) {
  const existing = await repo().findOneBy({ user_id: dto.user_id, project_id: projectId });
  if (existing) {
    existing.role = dto.role;
    return repo().save(existing);
  }
  return repo().save(repo().create({ user_id: dto.user_id, project_id: projectId, role: dto.role }));
}

export async function patchMember(projectId: string, userId: string, dto: PatchMemberDto) {
  const member = await repo().findOneBy({ user_id: userId, project_id: projectId });
  if (!member) return null;
  member.role = dto.role;
  return repo().save(member);
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  await repo().delete({ user_id: userId, project_id: projectId });
}
