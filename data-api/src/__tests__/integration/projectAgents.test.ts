import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser, createTestProject, createTestAgentProfile } from "../helpers/factories";
import * as authService from "../../services/auth.service";
import { AppDataSource } from "../../configs/data-source.config";
import { ProjectMember } from "../../entities/ProjectMember.entity";

let adminToken: string;
let memberToken: string;
let memberId: string;

beforeAll(async () => {
  await initTestDb();
});

beforeEach(async () => {
  await clearAllTables();
  const admin = await createTestUser({ email: "admin@test.com", system_role: "admin" });
  adminToken = authService.signToken(admin);
  const member = await createTestUser({ email: "member@test.com", system_role: "member" });
  memberId = member.id;
  memberToken = authService.signToken(member);
});

afterAll(async () => {
  await destroyTestDb();
});

describe("GET /projects/:projectId/agents", () => {
  it("viewer can list project agents", async () => {
    const project = await createTestProject("Test", memberId);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" }),
    );

    const res = await request(app)
      .get(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app).get(`/projects/${project.id}/agents`);
    expect(res.status).toBe(401);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const res = await request(app)
      .get(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("admin bypasses membership check", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .get(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe("POST /projects/:projectId/agents", () => {
  it("editor can assign an agent", async () => {
    const project = await createTestProject("Test", memberId);
    const agentProfile = await createTestAgentProfile();
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: editor.id, project_id: project.id, role: "editor" }),
    );

    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ agent_profile_id: agentProfile.id, role: "planner" });

    expect(res.status).toBe(201);
    expect(res.body.project_id).toBe(project.id);
    expect(res.body.role).toBe("planner");
  });

  it("owner can assign an agent", async () => {
    const project = await createTestProject("Test", memberId);
    const agentProfile = await createTestAgentProfile();

    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ agent_profile_id: agentProfile.id, role: "coder" });

    expect(res.status).toBe(201);
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const agentProfile = await createTestAgentProfile();
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" }),
    );

    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ agent_profile_id: agentProfile.id, role: "coder" });

    expect(res.status).toBe(403);
  });

  it("returns 400 for missing agent_profile_id", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ role: "planner" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid role", async () => {
    const project = await createTestProject("Test", memberId);
    const agentProfile = await createTestAgentProfile();
    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ agent_profile_id: agentProfile.id, role: "invalid_role" });
    expect(res.status).toBe(400);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const agentProfile = await createTestAgentProfile();
    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .send({ agent_profile_id: agentProfile.id, role: "planner" });
    expect(res.status).toBe(401);
  });

  it("reassigning same agent restores the soft-deleted entry", async () => {
    const project = await createTestProject("Test", memberId);
    const agentProfile = await createTestAgentProfile();

    // Assign
    await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ agent_profile_id: agentProfile.id, role: "planner" });

    // Retrieve id
    const listRes = await request(app)
      .get(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`);
    const agentId = listRes.body[0].id as string;

    // Remove
    await request(app)
      .delete(`/projects/${project.id}/agents/${agentId}`)
      .set("Authorization", `Bearer ${memberToken}`);

    // Re-assign
    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ agent_profile_id: agentProfile.id, role: "coder" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("coder");
  });
});

describe("PATCH /projects/:projectId/agents/:agentId", () => {
  it("editor can patch role", async () => {
    const project = await createTestProject("Test", memberId);
    const agentProfile = await createTestAgentProfile();
    await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ agent_profile_id: agentProfile.id, role: "planner" });
    const listRes = await request(app)
      .get(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`);
    const agentId = listRes.body[0].id as string;

    const res = await request(app)
      .patch(`/projects/${project.id}/agents/${agentId}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ role: "reviewer" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("reviewer");
  });

  it("returns 404 for unknown agentId", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .patch(`/projects/${project.id}/agents/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ role: "coder" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /projects/:projectId/agents/:agentId", () => {
  it("editor can remove an assigned agent", async () => {
    const project = await createTestProject("Test", memberId);
    const agentProfile = await createTestAgentProfile();
    await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ agent_profile_id: agentProfile.id, role: "tester" });
    const listRes = await request(app)
      .get(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`);
    const agentId = listRes.body[0].id as string;

    const res = await request(app)
      .delete(`/projects/${project.id}/agents/${agentId}`)
      .set("Authorization", `Bearer ${memberToken}`);

    expect(res.status).toBe(204);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app).delete(
      `/projects/${project.id}/agents/00000000-0000-0000-0000-000000000000`,
    );
    expect(res.status).toBe(401);
  });
});
