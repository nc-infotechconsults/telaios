import {
  listWorkspacesByProject,
  createWorkspace,
  getWorkspace,
  patchWorkspace,
  deleteWorkspace,
} from "../../../services/workspace.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { Workspace } from "../../../entities/Workspace.entity";

jest.mock("../../../configs/data-source.config", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

const mockRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
});

// ---------------------------------------------------------------------------
// listWorkspacesByProject
// ---------------------------------------------------------------------------

describe("listWorkspacesByProject", () => {
  it("queries by project_id ordered by created_at DESC", async () => {
    const workspaces = [{ id: "ws-1" }, { id: "ws-2" }] as Workspace[];
    mockRepo.find.mockResolvedValue(workspaces);

    const result = await listWorkspacesByProject("proj-1");

    expect(result).toBe(workspaces);
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { project_id: "proj-1" },
      order: { created_at: "DESC" },
    });
  });

  it("returns empty array when no workspaces exist", async () => {
    mockRepo.find.mockResolvedValue([]);
    const result = await listWorkspacesByProject("proj-empty");
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createWorkspace
// ---------------------------------------------------------------------------

describe("createWorkspace", () => {
  it("creates a workspace with the given dto fields", async () => {
    const ws = { id: "ws-1", project_id: "proj-1", name: "My Workspace", config: {} } as Workspace;
    mockRepo.create.mockReturnValue(ws);
    mockRepo.save.mockResolvedValue(ws);

    const result = await createWorkspace("proj-1", { name: "My Workspace" }, "user-1");

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "proj-1",
        name: "My Workspace",
        created_by: "user-1",
      }),
    );
    expect(mockRepo.save).toHaveBeenCalledWith(ws);
    expect(result).toBe(ws);
  });

  it("uses empty config when dto.config is not provided", async () => {
    const ws = { id: "ws-2", config: {} } as Workspace;
    mockRepo.create.mockReturnValue(ws);
    mockRepo.save.mockResolvedValue(ws);

    await createWorkspace("proj-1", { name: "No Config" });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ config: {} }),
    );
  });

  it("uses provided config when supplied", async () => {
    const cfg = { agent_profile_id: "ap-1", default_open_files: ["src/index.ts"] };
    const ws = { id: "ws-3", config: cfg } as unknown as Workspace;
    mockRepo.create.mockReturnValue(ws);
    mockRepo.save.mockResolvedValue(ws);

    await createWorkspace("proj-1", { name: "With Config", config: cfg });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ config: cfg }),
    );
  });

  it("omits created_by when not provided", async () => {
    const ws = { id: "ws-4" } as Workspace;
    mockRepo.create.mockReturnValue(ws);
    mockRepo.save.mockResolvedValue(ws);

    await createWorkspace("proj-1", { name: "Anonymous" });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ created_by: undefined }),
    );
  });
});

// ---------------------------------------------------------------------------
// getWorkspace
// ---------------------------------------------------------------------------

describe("getWorkspace", () => {
  it("loads workspace with project relation", async () => {
    const ws = { id: "ws-1", project: { id: "proj-1" } } as unknown as Workspace;
    mockRepo.findOne.mockResolvedValue(ws);

    const result = await getWorkspace("ws-1");

    expect(result).toBe(ws);
    expect(mockRepo.findOne).toHaveBeenCalledWith({
      where: { id: "ws-1" },
      relations: ["project"],
    });
  });

  it("returns null when workspace not found", async () => {
    mockRepo.findOne.mockResolvedValue(null);
    const result = await getWorkspace("missing");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// patchWorkspace
// ---------------------------------------------------------------------------

describe("patchWorkspace", () => {
  it("calls update then findOneBy and returns updated workspace", async () => {
    const ws = { id: "ws-1", name: "Updated", status: "running" } as Workspace;
    mockRepo.update.mockResolvedValue({ affected: 1 });
    mockRepo.findOneBy.mockResolvedValue(ws);

    const result = await patchWorkspace("ws-1", { name: "Updated", status: "running" });

    expect(mockRepo.update).toHaveBeenCalledWith("ws-1", { name: "Updated", status: "running" });
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: "ws-1" });
    expect(result).toBe(ws);
  });

  it("returns null when workspace does not exist", async () => {
    mockRepo.update.mockResolvedValue({ affected: 0 });
    mockRepo.findOneBy.mockResolvedValue(null);

    const result = await patchWorkspace("missing", { name: "X" });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deleteWorkspace
// ---------------------------------------------------------------------------

describe("deleteWorkspace", () => {
  it("calls softDelete with the workspace id", async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await deleteWorkspace("ws-1");

    expect(mockRepo.softDelete).toHaveBeenCalledWith("ws-1");
  });
});
