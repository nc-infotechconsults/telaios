import jwt from "jsonwebtoken";
import { signToken, verifyToken, sanitizeUser, register, login } from "../../../services/auth.service";
import { AppDataSource } from "../../../data-source";
import { User } from "../../../entities/User";
import bcrypt from "bcryptjs";

// Mock the entire data-source module so no real DB is needed
jest.mock("../../../data-source", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

const mockRepo = {
  findOneBy: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

beforeEach(() => {
  (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
});

// ─── signToken / verifyToken ──────────────────────────────────────────────────

describe("signToken", () => {
  it("returns a valid JWT with correct payload", () => {
    const user = { id: "uuid-1", email: "a@b.com", system_role: "admin" } as User;
    const token = signToken(user);
    const payload = jwt.decode(token) as Record<string, unknown>;
    expect(payload.sub).toBe("uuid-1");
    expect(payload.email).toBe("a@b.com");
    expect(payload.system_role).toBe("admin");
  });
});

describe("verifyToken", () => {
  it("returns payload for a valid token", () => {
    const user = { id: "uuid-1", email: "a@b.com", system_role: "member" } as User;
    const token = signToken(user);
    const payload = verifyToken(token);
    expect(payload.sub).toBe("uuid-1");
    expect(payload.email).toBe("a@b.com");
  });

  it("throws for an invalid token", () => {
    expect(() => verifyToken("not.a.token")).toThrow();
  });

  it("throws for a tampered token", () => {
    const user = { id: "uuid-1", email: "a@b.com", system_role: "member" } as User;
    const token = signToken(user);
    expect(() => verifyToken(token + "tampered")).toThrow();
  });
});

// ─── sanitizeUser ─────────────────────────────────────────────────────────────

describe("sanitizeUser", () => {
  it("strips password_hash from the user object", () => {
    const user = {
      id: "uuid-1",
      email: "a@b.com",
      password_hash: "secret",
      display_name: "Alice",
      system_role: "member",
      is_active: true,
    } as User;
    const safe = sanitizeUser(user);
    expect((safe as Record<string, unknown>).password_hash).toBeUndefined();
    expect(safe.email).toBe("a@b.com");
  });
});

// ─── register ─────────────────────────────────────────────────────────────────

describe("register", () => {
  it("first user becomes admin", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);
    mockRepo.count.mockResolvedValue(0);
    const saved = {
      id: "uid",
      email: "first@test.com",
      display_name: "First",
      system_role: "admin",
      is_active: true,
      password_hash: "hash",
    } as User;
    mockRepo.create.mockReturnValue(saved);
    mockRepo.save.mockResolvedValue(saved);

    const result = await register({ email: "First@Test.com", password: "pass1234", display_name: "First" });

    expect(result.user.system_role).toBe("admin");
    expect((result.user as Record<string, unknown>).password_hash).toBeUndefined();
  });

  it("subsequent users become member", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);
    mockRepo.count.mockResolvedValue(5);
    const saved = {
      id: "uid2",
      email: "second@test.com",
      display_name: "Second",
      system_role: "member",
      is_active: true,
      password_hash: "hash",
    } as User;
    mockRepo.create.mockReturnValue(saved);
    mockRepo.save.mockResolvedValue(saved);

    const result = await register({ email: "second@test.com", password: "pass1234", display_name: "Second" });
    expect(result.user.system_role).toBe("member");
  });

  it("throws 409 when email is already registered", async () => {
    mockRepo.findOneBy.mockResolvedValue({ id: "existing" });
    await expect(
      register({ email: "taken@test.com", password: "pass1234", display_name: "X" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("normalises email to lowercase", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);
    mockRepo.count.mockResolvedValue(1);
    const saved = {
      id: "u3",
      email: "upper@test.com",
      display_name: "Upper",
      system_role: "member",
      is_active: true,
      password_hash: "hash",
    } as User;
    mockRepo.create.mockReturnValue(saved);
    mockRepo.save.mockResolvedValue(saved);

    await register({ email: "UPPER@TEST.COM", password: "pass1234", display_name: "Upper" });
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ email: "upper@test.com" });
  });
});

// ─── login ────────────────────────────────────────────────────────────────────

describe("login", () => {
  it("returns token and safe user for correct credentials", async () => {
    const hash = await bcrypt.hash("password123", 4);
    const user = {
      id: "uid",
      email: "user@test.com",
      password_hash: hash,
      system_role: "member",
      is_active: true,
      display_name: "User",
    } as User;
    mockRepo.findOneBy.mockResolvedValue(user);

    const result = await login({ email: "user@test.com", password: "password123" });
    expect(result.token).toBeTruthy();
    expect((result.user as Record<string, unknown>).password_hash).toBeUndefined();
  });

  it("throws 401 for wrong password", async () => {
    const hash = await bcrypt.hash("correct", 4);
    const user = { id: "uid", email: "u@t.com", password_hash: hash, is_active: true } as User;
    mockRepo.findOneBy.mockResolvedValue(user);

    await expect(login({ email: "u@t.com", password: "wrong" })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("throws 401 when user not found", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);
    await expect(login({ email: "nobody@t.com", password: "x" })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("throws 401 for inactive account", async () => {
    const hash = await bcrypt.hash("password123", 4);
    const user = { id: "uid", email: "u@t.com", password_hash: hash, is_active: false } as User;
    mockRepo.findOneBy.mockResolvedValue(user);

    await expect(login({ email: "u@t.com", password: "password123" })).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});
