import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser, createTestAgentProfile } from "../helpers/factories";
import * as authService from "../../services/auth.service";

let adminToken: string;
let memberToken: string;

beforeAll(async () => {
  await initTestDb();
});

beforeEach(async () => {
  await clearAllTables();
  const admin = await createTestUser({ email: "admin@test.com", system_role: "admin" });
  adminToken = authService.signToken(admin);
  const member = await createTestUser({ email: "member@test.com", system_role: "member" });
  memberToken = authService.signToken(member);
});

afterAll(async () => {
  await destroyTestDb();
});

describe("GET /agent-profiles", () => {
  it("any authenticated user can list agent profiles", async () => {
    await createTestAgentProfile();
    const res = await request(app)
      .get("/agent-profiles")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it("admin can list agent profiles", async () => {
    const res = await request(app)
      .get("/agent-profiles")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/agent-profiles");
    expect(res.status).toBe(401);
  });
});

describe("POST /agent-profiles", () => {
  it("admin can create an agent profile", async () => {
    const res = await request(app)
      .post("/agent-profiles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "New Agent", agent_type: "langgraph" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("New Agent");
    expect(res.body.agent_type).toBe("langgraph");
  });

  it("member gets 403", async () => {
    const res = await request(app)
      .post("/agent-profiles")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "New Agent" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for missing name", async () => {
    const res = await request(app)
      .post("/agent-profiles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ agent_type: "langgraph" });
    expect(res.status).toBe(400);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/agent-profiles").send({ name: "Agent" });
    expect(res.status).toBe(401);
  });
});

describe("GET /agent-profiles/:id", () => {
  it("any authenticated user can get an agent profile by id", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app)
      .get(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(profile.id);
    expect(res.body.name).toBe("Test Agent");
  });

  it("admin can get an agent profile by id", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app)
      .get(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(profile.id);
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(app)
      .get("/agent-profiles/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it("returns 401 without token", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app).get(`/agent-profiles/${profile.id}`);
    expect(res.status).toBe(401);
  });
});

describe("PATCH /agent-profiles/:id", () => {
  it("admin can update an agent profile", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app)
      .patch(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Updated Agent", llm_provider: "openai" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Agent");
    expect(res.body.llm_provider).toBe("openai");
  });

  it("member gets 403", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app)
      .patch(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ name: "Hacked" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown id", async () => {
    const res = await request(app)
      .patch("/agent-profiles/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Ghost" });
    expect(res.status).toBe(404);
  });

  it("returns 401 without token", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app)
      .patch(`/agent-profiles/${profile.id}`)
      .send({ name: "Updated" });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /agent-profiles/:id", () => {
  it("admin can delete an agent profile", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app)
      .delete(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(204);
  });

  it("member gets 403", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app)
      .delete(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app).delete(`/agent-profiles/${profile.id}`);
    expect(res.status).toBe(401);
  });
});
