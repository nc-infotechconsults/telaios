import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser, createTestProject, createTestPlan, createTestTask } from "../helpers/factories";
import * as authService from "../../services/auth.service";
import { AppDataSource } from "../../configs/data-source.config";
import { ProjectMember } from "../../entities/ProjectMember.entity";
import { Task } from "../../entities/Task.entity";

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

describe("GET /plans", () => {
  it("any authenticated user can list plans", async () => {
    const project = await createTestProject("Test", memberId);
    await createTestPlan(project.id);

    const res = await request(app)
      .get("/plans")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("can filter plans by project_id", async () => {
    const project = await createTestProject("Test", memberId);
    await createTestPlan(project.id);

    const res = await request(app)
      .get(`/plans?project_id=${project.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].project_id).toBe(project.id);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/plans");
    expect(res.status).toBe(401);
  });
});

describe("POST /plans", () => {
  it("editor can create a plan", async () => {
    const project = await createTestProject("Test", memberId);
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: editor.id, project_id: project.id, role: "editor" })
    );

    const res = await request(app)
      .post("/plans")
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ project_id: project.id, title: "Sprint 1" });
    expect(res.status).toBe(201);
    expect(res.body.project_id).toBe(project.id);
  });

  it("owner can create a plan", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post("/plans")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ project_id: project.id });
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
      .post("/plans")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ project_id: project.id });
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing project_id", async () => {
    // Use an invalid uuid so Zod validation fails, not project access
    const res = await request(app)
      .post("/plans")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ title: "No project" });
    expect(res.status).toBe(400);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const res = await request(app)
      .post("/plans")
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ project_id: project.id });
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/plans").send({ project_id: "some-id" });
    expect(res.status).toBe(401);
  });
});

describe("GET /plans/:id", () => {
  it("viewer can get a plan by id", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" })
    );

    const res = await request(app)
      .get(`/plans/${plan.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(plan.id);
  });

  it("owner can get a plan by id", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const res = await request(app)
      .get(`/plans/${plan.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(plan.id);
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(app)
      .get("/plans/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const res = await request(app)
      .get(`/plans/${plan.id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const res = await request(app).get(`/plans/${plan.id}`);
    expect(res.status).toBe(401);
  });
});

describe("PATCH /plans/:id", () => {
  it("editor can update a plan", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: editor.id, project_id: project.id, role: "editor" })
    );

    const res = await request(app)
      .patch(`/plans/${plan.id}`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ title: "Updated Plan" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated Plan");
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
      .patch(`/plans/${plan.id}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ title: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const res = await request(app).patch(`/plans/${plan.id}`).send({ title: "Updated" });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /plans/:id", () => {
  it("editor can delete a plan", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const res = await request(app)
      .delete(`/plans/${plan.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(204);
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
      .delete(`/plans/${plan.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(app)
      .delete("/plans/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const res = await request(app).delete(`/plans/${plan.id}`);
    expect(res.status).toBe(401);
  });
});

describe("POST /plans/:id/cancel", () => {
  it("owner can cancel all pending/ready tasks in a plan", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const taskRepo = AppDataSource.getRepository(Task);
    await taskRepo.save(taskRepo.create({ plan_id: plan.id, title: "Task 1", status: "pending" }));
    await taskRepo.save(taskRepo.create({ plan_id: plan.id, title: "Task 2", status: "ready" }));
    await taskRepo.save(taskRepo.create({ plan_id: plan.id, title: "Task 3", status: "done" }));

    const res = await request(app)
      .post(`/plans/${plan.id}/cancel`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(2); // only pending + ready cancelled

    const tasks = await taskRepo.find({ where: { plan_id: plan.id } });
    const statuses = tasks.map((t) => t.status).sort();
    expect(statuses).toEqual(["cancelled", "cancelled", "done"]);
  });

  it("returns 0 when no cancellable tasks", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const taskRepo = AppDataSource.getRepository(Task);
    await taskRepo.save(taskRepo.create({ plan_id: plan.id, title: "Done Task", status: "done" }));

    const res = await request(app)
      .post(`/plans/${plan.id}/cancel`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.cancelled).toBe(0);
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const viewer = await createTestUser({ email: "viewer-cancel-plan@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({ user_id: viewer.id, project_id: project.id, role: "viewer" })
    );

    const res = await request(app)
      .post(`/plans/${plan.id}/cancel`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const res = await request(app).post(`/plans/${plan.id}/cancel`);
    expect(res.status).toBe(401);
  });
});
