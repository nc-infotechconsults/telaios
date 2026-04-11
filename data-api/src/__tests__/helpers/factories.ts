import { AppDataSource } from "../../configs/data-source.config";
import { User } from "../../entities/User.entity";
import { Project } from "../../entities/Project.entity";
import { Plan } from "../../entities/Plan.entity";
import { ProjectMember } from "../../entities/ProjectMember.entity";
import { Repository } from "../../entities/Repository.entity";
import { Task } from "../../entities/Task.entity";
import { Message } from "../../entities/Message.entity";
import { AgentProfile } from "../../entities/AgentProfile.entity";
import bcrypt from "bcryptjs";

export interface UserOpts {
  email?: string;
  password?: string;
  display_name?: string;
  system_role?: "admin" | "member";
  is_active?: boolean;
}

export async function createTestUser(opts: UserOpts = {}): Promise<User> {
  const repo = AppDataSource.getRepository(User);
  const password_hash = await bcrypt.hash(opts.password ?? "password123", 4); // low cost for speed
  const user = repo.create({
    email: opts.email ?? `user-${Date.now()}@test.com`,
    password_hash,
    display_name: opts.display_name ?? "Test User",
    system_role: opts.system_role ?? "member",
    is_active: opts.is_active ?? true,
  } as Partial<User>);
  return repo.save(user);
}

export async function createTestProject(
  name = "Test Project",
  ownerId?: string
): Promise<Project> {
  const repo = AppDataSource.getRepository(Project);
  const project = await repo.save(repo.create({ name, description: "A test project" }));
  if (ownerId) {
    const memberRepo = AppDataSource.getRepository(ProjectMember);
    await memberRepo.save(
      memberRepo.create({ user_id: ownerId, project_id: project.id, role: "owner" })
    );
  }
  return project;
}

export async function createTestPlan(projectId: string): Promise<Plan> {
  const repo = AppDataSource.getRepository(Plan);
  return repo.save(repo.create({ project_id: projectId, status: "draft" }));
}

export async function createTestRepository(projectId: string): Promise<Repository> {
  const repo = AppDataSource.getRepository(Repository);
  return repo.save(repo.create({ name: "Test Repo", project_id: projectId }));
}

export async function createTestTask(planId: string): Promise<Task> {
  const repo = AppDataSource.getRepository(Task);
  return repo.save(repo.create({ plan_id: planId, title: "Test Task" }));
}

export async function createTestMessage(projectId: string, planId?: string): Promise<Message> {
  const repo = AppDataSource.getRepository(Message);
  return repo.save(repo.create({ project_id: projectId, plan_id: planId ?? null, role: "user", content: "Hello" }));
}

export async function createTestAgentProfile(): Promise<AgentProfile> {
  const repo = AppDataSource.getRepository(AgentProfile);
  return repo.save(repo.create({ name: "Test Agent", agent_type: "langgraph" }));
}
