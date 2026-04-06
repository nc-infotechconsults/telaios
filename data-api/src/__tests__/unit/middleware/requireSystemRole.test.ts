import type { Request, Response, NextFunction } from "express";
import { requireSystemRole } from "../../../middleware/requireSystemRole";
import { User } from "../../../entities/User";

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json };
}

describe("requireSystemRole", () => {
  const next = jest.fn();

  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when req.user is not set", () => {
    const req = {} as Request;
    const res = makeRes();
    requireSystemRole("admin")(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when user has wrong system_role", () => {
    const req = { user: { system_role: "member" } as User } as Request;
    const res = makeRes();
    requireSystemRole("admin")(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when user has the required role", () => {
    const req = { user: { system_role: "admin" } as User } as Request;
    const res = makeRes();
    requireSystemRole("admin")(req, res as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
