import { AppDataSource } from "../../configs/data-source.config";
import { User } from "../../entities/User.entity";
import { Project } from "../../entities/Project.entity";
import { Plan } from "../../entities/Plan.entity";
import { ProjectMember } from "../../entities/ProjectMember.entity";
import { Repository } from "../../entities/Repository.entity";
import { Task } from "../../entities/Task.entity";
import { Message } from "../../entities/Message.entity";
import { AgentProfile } from "../../entities/AgentProfile.entity";
import { Document } from "../../entities/Document.entity";
import type { DocumentFileType, DocumentStatus } from "../../entities/Document.entity";
import { Workspace } from "../../entities/Workspace.entity";
import { Environment } from "../../entities/Environment.entity";
import { encrypt } from "../../utils/crypto.util";
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

export interface DocumentOpts {
  name?: string;
  file_type?: DocumentFileType;
  mime_type?: string;
  s3_key?: string;
  size_bytes?: number;
  checksum_sha256?: string;
  status?: DocumentStatus;
  uploaded_by?: string | null;
}

export async function createTestDocument(
  projectId: string,
  opts: DocumentOpts = {},
): Promise<Document> {
  const repo = AppDataSource.getRepository(Document);
  return repo.save(
    repo.create({
      project_id: projectId,
      name: opts.name ?? "test-doc.pdf",
      file_type: opts.file_type ?? "pdf",
      mime_type: opts.mime_type ?? "application/pdf",
      s3_key: opts.s3_key ?? `projects/${projectId}/documents/${Date.now()}/test-doc.pdf`,
      size_bytes: opts.size_bytes ?? 1024,
      checksum_sha256: opts.checksum_sha256 ?? "abc123def456",
      status: opts.status ?? "ready",
      uploaded_by: opts.uploaded_by ?? null,
    }),
  );
}

export async function createTestWorkspace(
  projectId: string,
  opts: { name?: string; createdBy?: string } = {},
): Promise<Workspace> {
  const repo = AppDataSource.getRepository(Workspace);
  return repo.save(
    repo.create({
      project_id: projectId,
      name: opts.name ?? "Test Workspace",
      config: {},
      created_by: opts.createdBy ?? null,
    } as Partial<Workspace>),
  );
}

export async function createTestEnvironment(
  projectId: string,
  opts: { name?: string; type?: "kubernetes" | "docker"; createdBy?: string } = {},
): Promise<Environment> {
  const repo = AppDataSource.getRepository(Environment);
  const cfg = { type: opts.type ?? "kubernetes", kubeconfig: "dummy" };
  return repo.save(
    repo.create({
      project_id: projectId,
      name: opts.name ?? "Test Environment",
      type: opts.type ?? "kubernetes",
      connection_config: encrypt(JSON.stringify(cfg)),
      created_by: opts.createdBy ?? null,
    } as Partial<Environment>),
  );
}
