import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser, createTestProject } from "../helpers/factories";
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

    // Create an agent first
    await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "Coder Agent", role: "coder" });

    const res = await request(app)
      .get(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe("Coder Agent");
    // Ensure llm_api_key is not returned (sanitized)
    expect(res.body[0].llm_api_key).toBeUndefined();
    expect(typeof res.body[0].has_llm_api_key).toBe("boolean");
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app).get(`/projects/${project.id}/agents`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-member", async () => {
    const project = await createTestProject("Test", memberId);
    const stranger = await createTestUser({ email: "stranger@test.com" });
    const strangerToken = authService.signToken(stranger);
    const res = await request(app)
      .get(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
  });
});

describe("POST /projects/:projectId/agents", () => {
  it("editor can create a custom agent", async () => {
    const project = await createTestProject("Test", memberId);
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: editor.id, project_id: project.id, role: "editor" }),
    );

    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ name: "Planner Agent", role: "planner" });

    expect(res.status).toBe(201);
    expect(res.body.project_id).toBe(project.id);
    expect(res.body.name).toBe("Planner Agent");
    expect(res.body.role).toBe("planner");
    expect(res.body.llm_api_key).toBeUndefined();
    expect(typeof res.body.has_llm_api_key).toBe("boolean");
  });

  it("owner can create a custom agent", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "Coder", role: "coder" });
    expect(res.status).toBe(201);
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" }),
    );

    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ name: "Coder", role: "coder" });

    expect(res.status).toBe(403);
  });

  it("returns 400 for missing name", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ role: "planner" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid role", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "Bad Agent", role: "invalid_role" });
    expect(res.status).toBe(400);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/agents`)
      .send({ name: "Agent", role: "planner" });
    expect(res.status).toBe(401);
  });
});

describe("PUT /projects/:projectId/agents/:agentId", () => {
  it("editor can update agent config", async () => {
    const project = await createTestProject("Test", memberId);
    const createRes = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "Planner", role: "planner" });
    const agentId = createRes.body.id as string;

    const res = await request(app)
      .put(`/projects/${project.id}/agents/${agentId}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ role: "reviewer", name: "Reviewer" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("reviewer");
    expect(res.body.name).toBe("Reviewer");
    expect(res.body.llm_api_key).toBeUndefined();
    expect(typeof res.body.has_llm_api_key).toBe("boolean");
  });

  it("returns 404 for unknown agentId", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .put(`/projects/${project.id}/agents/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ role: "coder" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /projects/:projectId/agents/:agentId", () => {
  it("editor can remove an agent", async () => {
    const project = await createTestProject("Test", memberId);
    const createRes = await request(app)
      .post(`/projects/${project.id}/agents`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "Tester", role: "tester" });
    const agentId = createRes.body.id as string;

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
