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

describe("POST /projects", () => {
  it("creates a project and auto-adds creator as owner", async () => {
    const res = await request(app)
      .post("/projects")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "My Project", description: "Desc" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("My Project");

    const membership = await AppDataSource.getRepository(ProjectMember).findOneBy({
      user_id: memberId,
      project_id: res.body.id,
    });
    expect(membership?.role).toBe("owner");
  });

  it("returns 400 for missing name", async () => {
    const res = await request(app)
      .post("/projects")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ description: "No name" });
    expect(res.status).toBe(400);
  });

  it("returns 401 without token", async () => {
    const res = await request(app)
      .post("/projects")
      .send({ name: "X" });
    expect(res.status).toBe(401);
  });
});

describe("GET /projects", () => {
  it("returns project list for authenticated user", async () => {
    await createTestProject("Project A", memberId);
    const res = await request(app)
      .get("/projects")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe("GET /projects/:id", () => {
  it("project member can fetch project details", async () => {
    const proj = await createTestProject("Visible Project", memberId);
    const res = await request(app)
      .get(`/projects/${proj.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(proj.id);
  });

  it("non-member gets 403", async () => {
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const proj = await createTestProject("Private Project", memberId);

    const res = await request(app)
      .get(`/projects/${proj.id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("admin bypasses membership check", async () => {
    const proj = await createTestProject("Admin Accessible", memberId);
    const res = await request(app)
      .get(`/projects/${proj.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("returns 404 for unknown project", async () => {
    const res = await request(app)
      .get("/projects/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /projects/:id", () => {
  it("owner can update the project", async () => {
    const proj = await createTestProject("Old Name", memberId);
    const res = await request(app)
      .patch(`/projects/${proj.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "New Name" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
  });

  it("viewer cannot update the project (403)", async () => {
    const proj = await createTestProject("Protected", memberId);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({
        user_id: viewer.id,
        project_id: proj.id,
        role: "viewer",
      })
    );

    const res = await request(app)
      .patch(`/projects/${proj.id}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ name: "Hacked" });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /projects/:id", () => {
  it("owner can delete the project", async () => {
    const proj = await createTestProject("To Delete", memberId);
    const res = await request(app)
      .delete(`/projects/${proj.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(204);
  });

  it("editor cannot delete the project (403)", async () => {
    const proj = await createTestProject("Protected", memberId);
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({
        user_id: editor.id,
        project_id: proj.id,
        role: "editor",
      })
    );

    const res = await request(app)
      .delete(`/projects/${proj.id}`)
      .set("Authorization", `Bearer ${editorToken}`);
    expect(res.status).toBe(403);
  });
});
