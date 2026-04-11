import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser, createTestProject, createTestPlan, createTestMessage } from "../helpers/factories";
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

describe("GET /messages", () => {
  it("viewer can list messages for a project", async () => {
    const project = await createTestProject("Test", memberId);
    await createTestMessage(project.id);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" })
    );

    const res = await request(app)
      .get(`/messages?project_id=${project.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].project_id).toBe(project.id);
  });

  it("owner can list messages", async () => {
    const project = await createTestProject("Test", memberId);
    await createTestMessage(project.id);

    const res = await request(app)
      .get(`/messages?project_id=${project.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const res = await request(app)
      .get(`/messages?project_id=${project.id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("admin bypasses membership check", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .get(`/messages?project_id=${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app).get(`/messages?project_id=${project.id}`);
    expect(res.status).toBe(401);
  });
});

describe("POST /messages", () => {
  it("editor can create a message", async () => {
    const project = await createTestProject("Test", memberId);
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: editor.id, project_id: project.id, role: "editor" })
    );

    const res = await request(app)
      .post("/messages")
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ project_id: project.id, role: "user", content: "Hello" });
    expect(res.status).toBe(201);
    expect(res.body.project_id).toBe(project.id);
    expect(res.body.content).toBe("Hello");
  });

  it("owner can create a message", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post("/messages")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ project_id: project.id, role: "user", content: "Hello owner" });
    expect(res.status).toBe(201);
  });

  it("can create a message with plan_id", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const res = await request(app)
      .post("/messages")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ project_id: project.id, plan_id: plan.id, role: "assistant", content: "Response" });
    expect(res.status).toBe(201);
    expect(res.body.plan_id).toBe(plan.id);
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" })
    );

    const res = await request(app)
      .post("/messages")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ project_id: project.id, role: "user", content: "Viewer message" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing required fields", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post("/messages")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ project_id: project.id });
    expect(res.status).toBe(400);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const res = await request(app)
      .post("/messages")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ project_id: project.id, role: "user", content: "Hello" });
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const res = await request(app)
      .post("/messages")
      .send({ project_id: "some-id", role: "user", content: "Hello" });
    expect(res.status).toBe(401);
  });
});
