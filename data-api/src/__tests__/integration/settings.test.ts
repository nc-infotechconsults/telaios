import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser } from "../helpers/factories";
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

describe("GET /settings", () => {
  it("any authenticated user can get settings", async () => {
    const res = await request(app)
      .get("/settings")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it("admin can get settings", async () => {
    const res = await request(app)
      .get("/settings")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("masked response does not include llm_api_key directly", async () => {
    await request(app)
      .patch("/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ llm_provider: "openai", llm_model: "gpt-4o", llm_api_key_raw: "sk-test-key" });

    const res = await request(app)
      .get("/settings")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body.llm_api_key).toBeUndefined();
    expect(res.body.has_api_key).toBe(true);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/settings");
    expect(res.status).toBe(401);
  });
});

describe("GET /settings/raw", () => {
  it("any authenticated user can get raw settings", async () => {
    const res = await request(app)
      .get("/settings/raw")
      .set("Authorization", `Bearer ${memberToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it("admin can get raw settings", async () => {
    const res = await request(app)
      .get("/settings/raw")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it("raw response includes llm_api_key_raw when set", async () => {
    await request(app)
      .patch("/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ llm_provider: "openai", llm_api_key_raw: "sk-raw-test" });

    const res = await request(app)
      .get("/settings/raw")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.llm_api_key_raw).toBe("sk-raw-test");
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/settings/raw");
    expect(res.status).toBe(401);
  });
});

describe("PATCH /settings", () => {
  it("admin can update settings", async () => {
    const res = await request(app)
      .patch("/settings")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ llm_provider: "openai", llm_model: "gpt-4o" });
    expect(res.status).toBe(200);
    expect(res.body.llm_provider).toBe("openai");
    expect(res.body.llm_model).toBe("gpt-4o");
  });

  it("member gets 403", async () => {
    const res = await request(app)
      .patch("/settings")
      .set("Authorization", `Bearer ${memberToken}`)
      .send({ llm_provider: "openai" });
    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const res = await request(app)
      .patch("/settings")
      .send({ llm_provider: "openai" });
    expect(res.status).toBe(401);
  });
});
