import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";

beforeAll(async () => {
  await initTestDb();
});

beforeEach(async () => {
  await clearAllTables();
});

afterAll(async () => {
  await destroyTestDb();
});

describe("POST /auth/register", () => {
  it("registers the first user as admin", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "first@test.com",
      password: "password123",
      display_name: "First",
    });
    expect(res.status).toBe(201);
    expect(res.body.user.system_role).toBe("admin");
    expect(res.body.user.password_hash).toBeUndefined();
    expect(res.body.token).toBeTruthy();
  });

  it("registers the second user as member", async () => {
    await request(app).post("/auth/register").send({
      email: "first@test.com",
      password: "password123",
      display_name: "First",
    });
    const res = await request(app).post("/auth/register").send({
      email: "second@test.com",
      password: "password123",
      display_name: "Second",
    });
    expect(res.status).toBe(201);
    expect(res.body.user.system_role).toBe("member");
  });

  it("returns 409 for duplicate email", async () => {
    await request(app).post("/auth/register").send({
      email: "dup@test.com",
      password: "password123",
      display_name: "Dup",
    });
    const res = await request(app).post("/auth/register").send({
      email: "DUP@TEST.COM",
      password: "password123",
      display_name: "Dup2",
    });
    expect(res.status).toBe(409);
  });

  it("returns 400 for invalid payload", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "not-an-email",
      password: "short",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/auth/register").send({
      email: "user@test.com",
      password: "password123",
      display_name: "User",
    });
  });

  it("returns token for valid credentials", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "user@test.com",
      password: "password123",
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it("returns 401 for wrong password", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "user@test.com",
      password: "wrongpassword",
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for unknown email", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "nobody@test.com",
      password: "password123",
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    const res = await request(app).post("/auth/login").send({ email: "bad" });
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/me", () => {
  it("returns current user for valid token", async () => {
    const reg = await request(app).post("/auth/register").send({
      email: "me@test.com",
      password: "password123",
      display_name: "Me",
    });
    const token = reg.body.token as string;

    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.email).toBe("me@test.com");
    expect(res.body.password_hash).toBeUndefined();
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired/invalid token", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Authorization", "Bearer bad.token.here");
    expect(res.status).toBe(401);
  });
});
