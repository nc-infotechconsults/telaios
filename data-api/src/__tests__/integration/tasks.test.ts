import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser, createTestProject, createTestPlan, createTestTask } from "../helpers/factories";
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

describe("GET /tasks", () => {
  it("any authenticated user can list tasks", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    await createTestTask(plan.id);

    const res = await request(app)
      .get("/tasks")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("can filter tasks by plan_id", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    await createTestTask(plan.id);

    const res = await request(app)
      .get(`/tasks?plan_id=${plan.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].plan_id).toBe(plan.id);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/tasks");
    expect(res.status).toBe(401);
  });
});

describe("POST /tasks", () => {
  it("editor can create a task", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: editor.id, project_id: project.id, role: "editor" })
    );

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ plan_id: plan.id, title: "My Task" });
    expect(res.status).toBe(201);
    expect(res.body.plan_id).toBe(plan.id);
    expect(res.body.title).toBe("My Task");
  });

  it("owner can create a task", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ plan_id: plan.id, title: "Owner Task" });
    expect(res.status).toBe(201);
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" })
    );

    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ plan_id: plan.id, title: "Viewer Task" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing plan_id", async () => {
    // Admin bypasses project access check, so validation runs and returns 400
    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "No plan" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing title", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ plan_id: plan.id });
    expect(res.status).toBe(400);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const res = await request(app)
      .post("/tasks")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ plan_id: plan.id, title: "Task" });
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/tasks").send({ plan_id: "some-id", title: "Task" });
    expect(res.status).toBe(401);
  });
});

describe("GET /tasks/:id", () => {
  it("viewer can get a task by id", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" })
    );

    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(task.id);
  });

  it("owner can get a task by id", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);
    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(task.id);
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(app)
      .get("/tasks/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const res = await request(app)
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);
    const res = await request(app).get(`/tasks/${task.id}`);
    expect(res.status).toBe(401);
  });
});

describe("PATCH /tasks/:id", () => {
  it("editor can update a task", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: editor.id, project_id: project.id, role: "editor" })
    );

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ title: "Updated Task" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated Task");
  });

  it("owner can update a task", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);
    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ status: "done" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("done");
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" })
    );

    const res = await request(app)
      .patch(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ title: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);
    const res = await request(app).patch(`/tasks/${task.id}`).send({ title: "Updated" });
    expect(res.status).toBe(401);
  });
});
