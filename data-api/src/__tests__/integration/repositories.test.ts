import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser, createTestProject, createTestRepository } from "../helpers/factories";
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

describe("GET /projects/:projectId/repositories", () => {
  it("viewer can list repositories", async () => {
    const project = await createTestProject("Test", memberId);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" })
    );
    await createTestRepository(project.id);

    const res = await request(app)
      .get(`/projects/${project.id}/repositories`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app).get(`/projects/${project.id}/repositories`);
    expect(res.status).toBe(401);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const res = await request(app)
      .get(`/projects/${project.id}/repositories`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("admin bypasses membership check", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .get(`/projects/${project.id}/repositories`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe("POST /projects/:projectId/repositories", () => {
  it("editor can create a repository", async () => {
    const project = await createTestProject("Test", memberId);
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: editor.id, project_id: project.id, role: "editor" })
    );

    const res = await request(app)
      .post(`/projects/${project.id}/repositories`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ name: "My Repo" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("My Repo");
    expect(res.body.project_id).toBe(project.id);
  });

  it("owner can create a repository", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/repositories`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "Owner Repo" });
    expect(res.status).toBe(201);
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" })
    );
    const res = await request(app)
      .post(`/projects/${project.id}/repositories`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ name: "Repo" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing name", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/repositories`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/repositories`)
      .send({ name: "Repo" });
    expect(res.status).toBe(401);
  });
});

describe("GET /projects/:projectId/repositories/:id", () => {
  it("viewer can get a repository by id", async () => {
    const project = await createTestProject("Test", memberId);
    const repo = await createTestRepository(project.id);
    const res = await request(app)
      .get(`/projects/${project.id}/repositories/${repo.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(repo.id);
  });

  it("returns 404 for unknown id", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .get(`/projects/${project.id}/repositories/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const repo = await createTestRepository(project.id);
    const res = await request(app).get(`/projects/${project.id}/repositories/${repo.id}`);
    expect(res.status).toBe(401);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const repo = await createTestRepository(project.id);
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const res = await request(app)
      .get(`/projects/${project.id}/repositories/${repo.id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });
});

describe("PATCH /projects/:projectId/repositories/:id", () => {
  it("editor can update a repository", async () => {
    const project = await createTestProject("Test", memberId);
    const repo = await createTestRepository(project.id);
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: editor.id, project_id: project.id, role: "editor" })
    );

    const res = await request(app)
      .patch(`/projects/${project.id}/repositories/${repo.id}`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ name: "Updated Repo" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Repo");
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const repo = await createTestRepository(project.id);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" })
    );

    const res = await request(app)
      .patch(`/projects/${project.id}/repositories/${repo.id}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ name: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const repo = await createTestRepository(project.id);
    const res = await request(app)
      .patch(`/projects/${project.id}/repositories/${repo.id}`)
      .send({ name: "Updated" });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /projects/:projectId/repositories/:id", () => {
  it("owner can delete a repository", async () => {
    const project = await createTestProject("Test", memberId);
    const repo = await createTestRepository(project.id);
    const res = await request(app)
      .delete(`/projects/${project.id}/repositories/${repo.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(204);
  });

  it("editor gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const repo = await createTestRepository(project.id);
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: editor.id, project_id: project.id, role: "editor" })
    );

    const res = await request(app)
      .delete(`/projects/${project.id}/repositories/${repo.id}`)
      .set("Authorization", `Bearer ${editorToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const repo = await createTestRepository(project.id);
    const res = await request(app).delete(`/projects/${project.id}/repositories/${repo.id}`);
    expect(res.status).toBe(401);
  });
});
