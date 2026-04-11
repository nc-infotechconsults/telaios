import type { Request, Response, NextFunction } from "express";
import { authenticate } from "../../../middleware/authenticate.middleware";
import * as authService from "../../../services/auth.service";
import { User } from "../../../entities/User.entity";

jest.mock("../../../services/auth.service");

const mockVerify = authService.verifyToken as jest.Mock;
const mockGetUser = authService.getUserById as jest.Mock;

function makeReq(authHeader?: string): Partial<Request> {
  return { headers: { authorization: authHeader } } as Partial<Request>;
}

function makeRes(): { status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json };
}

const next = jest.fn() as unknown as NextFunction;

describe("authenticate middleware", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when Authorization header is missing", async () => {
    const req = makeReq();
    const res = makeRes();
    await authenticate(req as Request, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header doesn't start with 'Bearer '", async () => {
    const req = makeReq("Basic abc123");
    const res = makeRes();
    await authenticate(req as Request, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when token is invalid", async () => {
    mockVerify.mockImplementation(() => { throw new Error("invalid"); });
    const req = makeReq("Bearer bad.token");
    const res = makeRes();
    await authenticate(req as Request, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when user is not found in DB", async () => {
    mockVerify.mockReturnValue({ sub: "uid", email: "u@t.com", system_role: "member" });
    mockGetUser.mockResolvedValue(null);
    const req = makeReq("Bearer valid.token");
    const res = makeRes();
    await authenticate(req as Request, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when user account is inactive", async () => {
    mockVerify.mockReturnValue({ sub: "uid", email: "u@t.com", system_role: "member" });
    mockGetUser.mockResolvedValue({ id: "uid", is_active: false } as User);
    const req = makeReq("Bearer valid.token");
    const res = makeRes();
    await authenticate(req as Request, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() and sets req.user for a valid active user", async () => {
    const user = { id: "uid", email: "u@t.com", is_active: true, system_role: "member" } as User;
    mockVerify.mockReturnValue({ sub: "uid", email: "u@t.com", system_role: "member" });
    mockGetUser.mockResolvedValue(user);
    const req = makeReq("Bearer valid.token") as Request;
    const res = makeRes();
    const nextFn = jest.fn();
    await authenticate(req, res as unknown as Response, nextFn as NextFunction);
    expect(nextFn).toHaveBeenCalled();
    expect(req.user).toBe(user);
    expect(res.status).not.toHaveBeenCalled();
  });
});
