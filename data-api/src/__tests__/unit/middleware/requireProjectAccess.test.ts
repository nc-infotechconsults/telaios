import type { Request, Response, NextFunction } from "express";
import { requireProjectAccess } from "../../../middleware/requireProjectAccess";
import * as projectMemberService from "../../../services/projectMember.service";
import { AppDataSource } from "../../../data-source";
import { User } from "../../../entities/User";
import { ProjectMember } from "../../../entities/ProjectMember";

jest.mock("../../../services/projectMember.service");
jest.mock("../../../data-source", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

const mockGetMembership = projectMemberService.getMembership as jest.Mock;
const mockHasMinRole = projectMemberService.hasMinRole as jest.Mock;

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { status, json };
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    baseUrl: "",
    ...overrides,
  } as Request;
}

describe("requireProjectAccess", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 401 when req.user is not set", async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();
    await requireProjectAccess("viewer")(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() immediately for admin (bypass)", async () => {
    const req = makeReq({ user: { system_role: "admin" } as User });
    const res = makeRes();
    const next = jest.fn();
    await requireProjectAccess("owner")(req, res as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when project context cannot be resolved", async () => {
    const req = makeReq({ user: { id: "uid", system_role: "member" } as User });
    const res = makeRes();
    const next = jest.fn();
    await requireProjectAccess("viewer")(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when user is not a project member", async () => {
    const req = makeReq({
      user: { id: "uid", system_role: "member" } as User,
      params: { projectId: "proj-1" },
    });
    mockGetMembership.mockResolvedValue(null);
    const res = makeRes();
    const next = jest.fn();
    await requireProjectAccess("viewer")(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 when user has insufficient project role", async () => {
    const req = makeReq({
      user: { id: "uid", system_role: "member" } as User,
      params: { projectId: "proj-1" },
    });
    mockGetMembership.mockResolvedValue({ role: "viewer" } as ProjectMember);
    mockHasMinRole.mockReturnValue(false);
    const res = makeRes();
    const next = jest.fn();
    await requireProjectAccess("editor")(req, res as unknown as Response, next as NextFunction);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("calls next() when user has sufficient project role", async () => {
    const req = makeReq({
      user: { id: "uid", system_role: "member" } as User,
      params: { projectId: "proj-1" },
    });
    mockGetMembership.mockResolvedValue({ role: "editor" } as ProjectMember);
    mockHasMinRole.mockReturnValue(true);
    const res = makeRes();
    const next = jest.fn();
    await requireProjectAccess("editor")(req, res as unknown as Response, next as NextFunction);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
