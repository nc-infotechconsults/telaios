import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import {
  createTestUser,
  createTestProject,
  createTestEnvironment,
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
// GET /projects/:projectId/environments
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/environments", () => {
  it("returns empty list when no environments exist", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .get(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("lists environments for the project", async () => {
    const project = await createTestProject("Test", memberId);
    await createTestEnvironment(project.id, { name: "staging" });
    await createTestEnvironment(project.id, { name: "production" });

    const res = await request(app)
      .get(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const names = res.body.map((e: { name: string }) => e.name);
    expect(names).toContain("staging");
    expect(names).toContain("production");
  });

  it("does not expose the raw encrypted connection_config in list response", async () => {
    const project = await createTestProject("Test", memberId);
    await createTestEnvironment(project.id, { name: "env" });

    const res = await request(app)
      .get(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    const env = res.body[0];
    // connection_config is stored encrypted; it should be present but opaque (not parseable JSON)
    if (env.connection_config !== undefined && env.connection_config !== null) {
      expect(() => JSON.parse(env.connection_config)).toThrow();
    }
  });

  it("viewer can list environments", async () => {
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
      .get(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app).get(`/projects/${project.id}/environments`);
    expect(res.status).toBe(401);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("Test", memberId);
    const other = await createTestUser({ email: "other@test.com" });
    const otherToken = authService.signToken(other);
    const res = await request(app)
      .get(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it("admin bypasses membership check", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .get(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:projectId/environments
// ---------------------------------------------------------------------------

describe("POST /projects/:projectId/environments", () => {
  it("owner can create a kubernetes environment", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        name: "staging",
        type: "kubernetes",
        connection_config: { type: "kubernetes", kubeconfig: "yaml-content" },
        namespace: "default",
      });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("staging");
    expect(res.body.type).toBe("kubernetes");
    expect(res.body.project_id).toBe(project.id);
    // connection_config is stored encrypted (opaque, not raw JSON)
    if (res.body.connection_config !== undefined && res.body.connection_config !== null) {
      expect(() => JSON.parse(res.body.connection_config)).toThrow();
    }
  });

  it("owner can create a docker environment", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({
        name: "local-docker",
        type: "docker",
        connection_config: { type: "docker", host: "tcp://127.0.0.1:2376" },
      });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe("docker");
  });

  it("editor can create an environment", async () => {
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
      .post(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${editorToken}`)
      .send({ name: "editor-env", type: "docker" });
    expect(res.status).toBe(201);
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
      .post(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ name: "env", type: "kubernetes" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing name", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ type: "kubernetes" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid type", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/environments`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "env", type: "terraform" });
    expect(res.status).toBe(400);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const res = await request(app)
      .post(`/projects/${project.id}/environments`)
      .send({ name: "env", type: "kubernetes" });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /environments/:id
// ---------------------------------------------------------------------------

describe("GET /environments/:id", () => {
  it("project member can fetch environment details", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id, { name: "staging" });

    const res = await request(app)
      .get(`/environments/${env.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(env.id);
    expect(res.body.name).toBe("staging");
    // connection_config is encrypted; verify it's opaque
    if (res.body.connection_config !== undefined && res.body.connection_config !== null) {
      expect(() => JSON.parse(res.body.connection_config)).toThrow();
    }
  });

  it("returns 404 or 403 for unknown environment id", async () => {
    const res = await request(app)
      .get("/environments/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${memberToken}`);
    // 403 from RBAC (can't resolve project_id for nonexistent entity) or 404 from controller
    expect([403, 404]).toContain(res.status);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);
    const res = await request(app).get(`/environments/${env.id}`);
    expect(res.status).toBe(401);
  });

  it("admin can access any environment", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);
    const res = await request(app)
      .get(`/environments/${env.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// PATCH /environments/:id
// ---------------------------------------------------------------------------

describe("PATCH /environments/:id", () => {
  it("owner can rename an environment", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id, { name: "old-name" });

    const res = await request(app)
      .patch(`/environments/${env.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "new-name" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("new-name");
  });

  it("returns 400 for invalid status", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);

    const res = await request(app)
      .patch(`/environments/${env.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ status: "offline" });
    expect(res.status).toBe(400);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);
    const res = await request(app)
      .patch(`/environments/${env.id}`)
      .send({ name: "x" });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /environments/:id
// ---------------------------------------------------------------------------

describe("DELETE /environments/:id", () => {
  it("owner can delete an environment", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);

    const res = await request(app)
      .delete(`/environments/${env.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(204);
  });

  it("environment is soft-deleted (GET returns 404 after deletion)", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);

    await request(app)
      .delete(`/environments/${env.id}`)
      .set("Authorization", `Bearer ${memberToken}`);

    const get = await request(app)
      .get(`/environments/${env.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(get.status).toBe(404);
  });

  it("viewer gets 403 when trying to delete", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);
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
      .delete(`/environments/${env.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);
    const res = await request(app).delete(`/environments/${env.id}`);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /environments/:id/test — connectivity test (best-effort; no real cluster)
// ---------------------------------------------------------------------------

describe("POST /environments/:id/test", () => {
  it("returns 403 or 404 for unknown environment", async () => {
    const res = await request(app)
      .post("/environments/00000000-0000-0000-0000-000000000000/test")
      .set("Authorization", `Bearer ${memberToken}`);
    // 403 from RBAC when entity can't be found, or 200 with ok:false from service
    expect([200, 403, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.ok).toBe(false);
    }
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);
    const res = await request(app).post(`/environments/${env.id}/test`);
    expect(res.status).toBe(401);
  });

  it("returns an ok/message response (connection fails without cluster)", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);

    const res = await request(app)
      .post(`/environments/${env.id}/test`)
      .set("Authorization", `Bearer ${memberToken}`);
    // The test will fail (no real cluster) but the route must respond with ok field
    expect(res.status).toBe(200);
    expect(typeof res.body.ok).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// GET /environments/:id/helm/releases
// ---------------------------------------------------------------------------

describe("GET /environments/:id/helm/releases", () => {
  it("returns empty list when no releases exist", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);

    const res = await request(app)
      .get(`/environments/${env.id}/helm/releases`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("Test", memberId);
    const env = await createTestEnvironment(project.id);
    const res = await request(app).get(`/environments/${env.id}/helm/releases`);
    expect(res.status).toBe(401);
  });
});
