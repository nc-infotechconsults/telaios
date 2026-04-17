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

// ── New configurable agent fields ──────────────────────────────────────────────

describe("POST /agent-profiles — configurable fields round-trip", () => {
  it("persists system_prompt and system_prompt_mode on create", async () => {
    const res = await request(app)
      .post("/agent-profiles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Custom Agent",
        system_prompt: "You specialise in security auditing.",
        system_prompt_mode: "extend",
      });
    expect(res.status).toBe(201);
    expect(res.body.system_prompt).toBe("You specialise in security auditing.");
    expect(res.body.system_prompt_mode).toBe("extend");
  });

  it("persists all LLM tuning parameters on create", async () => {
    const res = await request(app)
      .post("/agent-profiles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Tuned Agent",
        llm_temperature: 0.4,
        llm_max_tokens: 2048,
        llm_top_p: 0.9,
        llm_frequency_penalty: 0.1,
        llm_presence_penalty: -0.1,
      });
    expect(res.status).toBe(201);
    expect(res.body.llm_temperature).toBeCloseTo(0.4);
    expect(res.body.llm_max_tokens).toBe(2048);
    expect(res.body.llm_top_p).toBeCloseTo(0.9);
    expect(res.body.llm_frequency_penalty).toBeCloseTo(0.1);
    expect(res.body.llm_presence_penalty).toBeCloseTo(-0.1);
  });

  it("persists sub_agent_ids on create", async () => {
    const sub = await createTestAgentProfile();
    const res = await request(app)
      .post("/agent-profiles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Orchestrator",
        sub_agent_ids: [sub.id],
      });
    expect(res.status).toBe(201);
    expect(res.body.sub_agent_ids).toEqual([sub.id]);
  });

  it("returns 400 for invalid system_prompt_mode", async () => {
    const res = await request(app)
      .post("/agent-profiles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Bad Mode", system_prompt_mode: "replace" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for llm_temperature out of range", async () => {
    const res = await request(app)
      .post("/agent-profiles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Bad Temp", llm_temperature: 5.0 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-UUID in sub_agent_ids", async () => {
    const res = await request(app)
      .post("/agent-profiles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Bad Sub", sub_agent_ids: ["not-a-uuid"] });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /agent-profiles/:id — configurable fields round-trip", () => {
  it("can update system_prompt via patch", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app)
      .patch(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ system_prompt: "Updated prompt", system_prompt_mode: "override" });
    expect(res.status).toBe(200);
    expect(res.body.system_prompt).toBe("Updated prompt");
    expect(res.body.system_prompt_mode).toBe("override");
  });

  it("can clear system_prompt by patching null", async () => {
    const profile = await createTestAgentProfile();
    // First set it
    await request(app)
      .patch(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ system_prompt: "Some prompt" });
    // Then clear it
    const res = await request(app)
      .patch(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ system_prompt: null });
    expect(res.status).toBe(200);
    expect(res.body.system_prompt).toBeNull();
  });

  it("can update LLM tuning parameters via patch", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app)
      .patch(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ llm_temperature: 0.7, llm_max_tokens: 1024 });
    expect(res.status).toBe(200);
    expect(res.body.llm_temperature).toBeCloseTo(0.7);
    expect(res.body.llm_max_tokens).toBe(1024);
  });

  it("can update sub_agent_ids via patch", async () => {
    const sub = await createTestAgentProfile();
    const profile = await createTestAgentProfile();
    const res = await request(app)
      .patch(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ sub_agent_ids: [sub.id] });
    expect(res.status).toBe(200);
    expect(res.body.sub_agent_ids).toEqual([sub.id]);
  });
});

describe("GET /agent-profiles/:id — configurable fields present in response", () => {
  it("returns system_prompt field", async () => {
    const res = await request(app)
      .post("/agent-profiles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "With Prompt", system_prompt: "Custom instructions." });
    const id = res.body.id;

    const getRes = await request(app)
      .get(`/agent-profiles/${id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.system_prompt).toBe("Custom instructions.");
  });

  it("returns sub_agent_ids as empty array by default", async () => {
    const profile = await createTestAgentProfile();
    const res = await request(app)
      .get(`/agent-profiles/${profile.id}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sub_agent_ids)).toBe(true);
    expect(res.body.sub_agent_ids).toEqual([]);
  });
});

