import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import {
  createTestUser,
  createTestProject,
  createTestWorkspace,
} from "../helpers/factories";
import * as authService from "../../services/auth.service";
import { AppDataSource } from "../../configs/data-source.config";
import { ProjectMember } from "../../entities/ProjectMember.entity";

let memberToken: string;
let memberId: string;
let adminToken: string;

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

// ---------------------------------------------------------------------------
// GET /projects/:projectId/workspaces
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/workspaces", () => {
  it("returns empty list when no workspaces exist", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .get(`/projects/${project.id}/workspaces`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("lists workspaces for the project", async () => {
    const project = await createTestProject("Test", memberId);
    await createTestWorkspace(project.id, { name: "WS-1", createdBy: memberId });
    await createTestWorkspace(project.id, { name: "WS-2", createdBy: memberId });

    const res = await request(app)
      .get(`/projects/${project.id}/workspaces`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("viewer can list workspaces", async () => {
    const project = await createTestProject("Test", memberId);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({
        user_id: viewer.id,
        project_id: project.id,
        role: "viewer",
      }),
    );
    const res = await request(app)
      .get(`/projects/${project.id}/workspaces`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app).get(`/projects/${project.id}/workspaces`);
    expect(res.status).toBe(401);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const res = await request(app)
      .get(`/projects/${project.id}/workspaces`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("admin bypasses membership check", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .get(`/projects/${project.id}/workspaces`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:projectId/workspaces
// ---------------------------------------------------------------------------

describe("POST /projects/:projectId/workspaces", () => {
  it("owner can create a workspace", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/workspaces`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "My Workspace" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("My Workspace");
    expect(res.body.project_id).toBe(project.id);
    expect(res.body.status).toBe("idle");
  });

  it("editor can create a workspace", async () => {
    const project = await createTestProject("Test", memberId);
    const editor = await createTestUser({ email: "editor@test.com" });
    const editorToken = authService.signToken(editor);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({
        user_id: editor.id,
        project_id: project.id,
        role: "editor",
      }),
    );
    const res = await request(app)
      .post(`/projects/${project.id}/workspaces`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ name: "Editor WS" });
    expect(res.status).toBe(201);
  });

  it("creates workspace with config payload", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/workspaces`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        name: "Configured WS",
        config: {
          agent_profile_id: "ap-1",
          env_vars: { NODE_ENV: "development" },
          devcontainer_overrides: { image: "node:20" },
        },
      });
    expect(res.status).toBe(201);
    expect(res.body.config.agent_profile_id).toBe("ap-1");
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({
        user_id: viewer.id,
        project_id: project.id,
        role: "viewer",
      }),
    );
    const res = await request(app)
      .post(`/projects/${project.id}/workspaces`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ name: "Viewer WS" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing name", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/workspaces`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/workspaces`)
      .send({ name: "WS" });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /workspaces/:id
// ---------------------------------------------------------------------------

describe("GET /workspaces/:id", () => {
  it("project member can fetch workspace details", async () => {
    const project = await createTestProject("Test", memberId);
    const ws = await createTestWorkspace(project.id, { name: "Detail WS", createdBy: memberId });

    const res = await request(app)
      .get(`/workspaces/${ws.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(ws.id);
    expect(res.body.name).toBe("Detail WS");
  });

  it("returns 404 or 403 for unknown workspace id", async () => {
    const res = await request(app)
      .get("/workspaces/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${memberToken}`);
    // 403 from RBAC (can't resolve project_id for nonexistent entity) or 404 from controller
    expect([403, 404]).toContain(res.status);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const ws = await createTestWorkspace(project.id);
    const res = await request(app).get(`/workspaces/${ws.id}`);
    expect(res.status).toBe(401);
  });

  it("admin can access any workspace", async () => {
    const project = await createTestProject("Test", memberId);
    const ws = await createTestWorkspace(project.id);
    const res = await request(app)
      .get(`/workspaces/${ws.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PATCH /workspaces/:id
// ---------------------------------------------------------------------------

describe("PATCH /workspaces/:id", () => {
  it("owner can update workspace name", async () => {
    const project = await createTestProject("Test", memberId);
    const ws = await createTestWorkspace(project.id, { createdBy: memberId });

    const res = await request(app)
      .patch(`/workspaces/${ws.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "Renamed WS" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed WS");
  });

  it("owner can update workspace status", async () => {
    const project = await createTestProject("Test", memberId);
    const ws = await createTestWorkspace(project.id, { createdBy: memberId });

    const res = await request(app)
      .patch(`/workspaces/${ws.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ status: "running" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("running");
  });

  it("returns 400 for invalid status", async () => {
    const project = await createTestProject("Test", memberId);
    const ws = await createTestWorkspace(project.id, { createdBy: memberId });

    const res = await request(app)
      .patch(`/workspaces/${ws.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ status: "nonexistent" });
    expect(res.status).toBe(400);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const ws = await createTestWorkspace(project.id);
    const res = await request(app)
      .patch(`/workspaces/${ws.id}`)
      .send({ name: "x" });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /workspaces/:id
// ---------------------------------------------------------------------------

describe("DELETE /workspaces/:id", () => {
  it("owner can delete a workspace", async () => {
    const project = await createTestProject("Test", memberId);
    const ws = await createTestWorkspace(project.id, { createdBy: memberId });

    const res = await request(app)
      .delete(`/workspaces/${ws.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(204);
  });

  it("workspace is soft-deleted (GET returns 404 after deletion)", async () => {
    const project = await createTestProject("Test", memberId);
    const ws = await createTestWorkspace(project.id, { createdBy: memberId });

    await request(app)
      .delete(`/workspaces/${ws.id}`)
      .set("Authorization", `Bearer ${memberToken}`);

    const get = await request(app)
      .get(`/workspaces/${ws.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(get.status).toBe(404);
  });

  it("viewer gets 403 when trying to delete", async () => {
    const project = await createTestProject("Test", memberId);
    const ws = await createTestWorkspace(project.id);
    const viewer = await createTestUser({ email: "viewer@test.com" });
    const viewerToken = authService.signToken(viewer);
    await AppDataSource.getRepository(ProjectMember).save(
      AppDataSource.getRepository(ProjectMember).create({
        user_id: viewer.id,
        project_id: project.id,
        role: "viewer",
      }),
    );
    const res = await request(app)
      .delete(`/workspaces/${ws.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const ws = await createTestWorkspace(project.id);
    const res = await request(app).delete(`/workspaces/${ws.id}`);
    expect(res.status).toBe(401);
  });
});
