import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser, createTestProject, createTestPlan, createTestTask } from "../helpers/factories";
import * as authService from "../../services/auth.service";
import { AppDataSource } from "../../configs/data-source.config";
import { ProjectMember } from "../../entities/ProjectMember.entity";

const INTERNAL_TOKEN = process.env.INTERNAL_API_KEY ?? "internal-secret";

let adminToken: string;
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
});

afterAll(async () => {
  await destroyTestDb();
});

// ── GET /tasks/:id/artifacts ──────────────────────────────────────────────────

describe("GET /tasks/:id/artifacts", () => {
  it("returns empty array for a task with no artifacts", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);

    const res = await request(app)
      .get(`/tasks/${task.id}/artifacts`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("returns artifacts after they are created via internal endpoint", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);

    // Create via internal route
    await request(app)
      .post(`/internal/tasks/${task.id}/artifacts`)
      .set("Authorization", `Bearer ${INTERNAL_TOKEN}`)
      .send({
        artifacts: [
          { type: "log", title: "Execution Log", content: "step 1\nstep 2" },
          { type: "diff", title: "Git Diff", content: "diff --git a/foo.ts b/foo.ts", content_type: "text/x-diff" },
        ],
      });

    const res = await request(app)
      .get(`/tasks/${task.id}/artifacts`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].type).toBe("log");
    expect(res.body[1].type).toBe("diff");
    expect(res.body[0].task_id).toBe(task.id);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);

    const res = await request(app).get(`/tasks/${task.id}/artifacts`);
    expect(res.status).toBe(401);
  });

  it("viewer role can access artifacts", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);

    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({
        user_id: viewer.id,
        project_id: project.id,
        role: "viewer",
      })
    );

    const res = await request(app)
      .get(`/tasks/${task.id}/artifacts`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
  });
});

// ── POST /internal/tasks/:id/artifacts ───────────────────────────────────────

describe("POST /internal/tasks/:id/artifacts", () => {
  it("creates artifacts in bulk with internal token", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);

    const res = await request(app)
      .post(`/internal/tasks/${task.id}/artifacts`)
      .set("Authorization", `Bearer ${INTERNAL_TOKEN}`)
      .send({
        artifacts: [
          { type: "log", title: "Tool Log", content: "called tool X" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    expect(res.body.artifacts).toHaveLength(1);
    expect(res.body.artifacts[0].type).toBe("log");
    expect(res.body.artifacts[0].task_id).toBe(task.id);
  });

  it("returns 400 for invalid artifact type", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);

    const res = await request(app)
      .post(`/internal/tasks/${task.id}/artifacts`)
      .set("Authorization", `Bearer ${INTERNAL_TOKEN}`)
      .send({
        artifacts: [{ type: "invalid_type", title: "Bad", content: "x" }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation error");
  });

  it("returns 400 if artifacts array is empty", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);

    const res = await request(app)
      .post(`/internal/tasks/${task.id}/artifacts`)
      .set("Authorization", `Bearer ${INTERNAL_TOKEN}`)
      .send({ artifacts: [] });

    expect(res.status).toBe(400);
  });

  it("returns 401 with regular user token", async () => {
    const project = await createTestProject("Test", memberId);
    const plan = await createTestPlan(project.id);
    const task = await createTestTask(plan.id);

    const res = await request(app)
      .post(`/internal/tasks/${task.id}/artifacts`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        artifacts: [{ type: "log", title: "Log", content: "x" }],
      });

    expect(res.status).toBe(401);
  });
});
