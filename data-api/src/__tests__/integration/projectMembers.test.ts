import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser, createTestProject } from "../helpers/factories";
import * as authService from "../../services/auth.service";
import { AppDataSource } from "../../configs/data-source.config";
import { ProjectMember } from "../../entities/ProjectMember.entity";

let ownerToken: string;
let ownerId: string;
let adminToken: string;
let projectId: string;
let secondUserId: string;

beforeAll(async () => {
  await initTestDb();
});

beforeEach(async () => {
  await clearAllTables();

  const admin = await createTestUser({ email: "admin@test.com", system_role: "admin" });
  adminToken = authService.signToken(admin);

  const owner = await createTestUser({ email: "owner@test.com" });
  ownerId = owner.id;
  ownerToken = authService.signToken(owner);

  const second = await createTestUser({ email: "second@test.com" });
  secondUserId = second.id;

  const project = await createTestProject("Test Project", ownerId);
  projectId = project.id;
});

afterAll(async () => {
  await destroyTestDb();
});

describe("GET /projects/:projectId/members", () => {
  it("returns members without password_hash", async () => {
    const res = await request(app)
      .get(`/projects/${projectId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].role).toBe("owner");
    expect(res.body[0].user?.password_hash).toBeUndefined();
    expect(res.body[0].user?.email).toBe("owner@test.com");
  });

  it("non-member gets 403", async () => {
    const outsider = await createTestUser({ email: "out@test.com" });
    const token = authService.signToken(outsider);
    const res = await request(app)
      .get(`/projects/${projectId}/members`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe("POST /projects/:projectId/members", () => {
  it("owner can add a new member", async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ user_id: secondUserId, role: "editor" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("editor");
    expect(res.body.user_id).toBe(secondUserId);
  });

  it("upserts role when member already exists", async () => {
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({
        user_id: secondUserId,
        project_id: projectId,
        role: "viewer",
      })
    );
    const res = await request(app)
      .post(`/projects/${projectId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ user_id: secondUserId, role: "editor" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("editor");
  });

  it("editor cannot add members (requires owner)", async () => {
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({
        user_id: editor.id,
        project_id: projectId,
        role: "editor",
      })
    );
    const res = await request(app)
      .post(`/projects/${projectId}/members`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ user_id: secondUserId, role: "viewer" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid role", async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/members`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ user_id: secondUserId, role: "superadmin" });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /projects/:projectId/members/:userId", () => {
  beforeEach(async () => {
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({
        user_id: secondUserId,
        project_id: projectId,
        role: "viewer",
      })
    );
  });

  it("owner can update member role", async () => {
    const res = await request(app)
      .patch(`/projects/${projectId}/members/${secondUserId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ role: "editor" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("editor");
  });

  it("returns 404 for non-existent member", async () => {
    const res = await request(app)
      .patch(`/projects/${projectId}/members/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ role: "editor" });
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid role value", async () => {
    const res = await request(app)
      .patch(`/projects/${projectId}/members/${secondUserId}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ role: "god" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /projects/:projectId/members/:userId", () => {
  beforeEach(async () => {
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({
        user_id: secondUserId,
        project_id: projectId,
        role: "viewer",
      })
    );
  });

  it("owner can remove a member", async () => {
    const res = await request(app)
      .delete(`/projects/${projectId}/members/${secondUserId}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(204);

    const gone = await AppDataSource.getRepository(ProjectMember).findOneBy({
      user_id: secondUserId,
      project_id: projectId,
    });
    expect(gone).toBeNull();
  });

  it("admin can remove a member", async () => {
    const res = await request(app)
      .delete(`/projects/${projectId}/members/${secondUserId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });
});
