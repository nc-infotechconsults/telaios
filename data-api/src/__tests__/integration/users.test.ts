import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser } from "../helpers/factories";
import * as authService from "../../services/auth.service";

let adminToken: string;
let memberToken: string;
let adminId: string;
let memberId: string;

beforeAll(async () => {
  await initTestDb();
});

beforeEach(async () => {
  await clearAllTables();

  const admin = await createTestUser({ email: "admin@test.com", system_role: "admin" });
  adminId = admin.id;
  adminToken = authService.signToken(admin);

  const member = await createTestUser({ email: "member@test.com", system_role: "member" });
  memberId = member.id;
  memberToken = authService.signToken(member);
});

afterAll(async () => {
  await destroyTestDb();
});

describe("GET /users", () => {
  it("returns all users for admin", async () => {
    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    res.body.forEach((u: Record<string, unknown>) => {
      expect(u.password_hash).toBeUndefined();
    });
  });

  it("returns 403 for non-admin", async () => {
    const res = await request(app)
      .get("/users")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/users");
    expect(res.status).toBe(401);
  });
});

describe("GET /users/:id", () => {
  it("admin can fetch any user", async () => {
    const res = await request(app)
      .get(`/users/${memberId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(memberId);
    expect(res.body.password_hash).toBeUndefined();
  });

  it("returns 404 for unknown user", async () => {
    const res = await request(app)
      .get("/users/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /users/:id", () => {
  it("admin can update display_name", async () => {
    const res = await request(app)
      .patch(`/users/${memberId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ display_name: "Updated Name" });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe("Updated Name");
  });

  it("returns 403 for non-admin", async () => {
    const res = await request(app)
      .patch(`/users/${adminId}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ display_name: "Hacked" });
    expect(res.status).toBe(403);
  });
});

describe("DELETE /users/:id", () => {
  it("admin can delete a user", async () => {
    const res = await request(app)
      .delete(`/users/${memberId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });

  it("returns 403 for non-admin", async () => {
    const res = await request(app)
      .delete(`/users/${adminId}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });
});
