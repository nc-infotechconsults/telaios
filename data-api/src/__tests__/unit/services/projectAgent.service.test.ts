import {
  listProjectAgents,
  assignAgent,
  patchProjectAgent,
  removeProjectAgent,
} from "../../../services/projectAgent.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { ProjectAgent } from "../../../entities/ProjectAgent.entity";

jest.mock("../../../configs/data-source.config", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

const mockRepo = {
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  softDelete: jest.fn(),
};

beforeEach(() => {
  (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
});

describe("listProjectAgents", () => {
  it("returns agents ordered by assigned_at ASC with agent_profile relation", async () => {
    const agents = [{ id: "a1", project_id: "p1" }] as ProjectAgent[];
    mockRepo.find.mockResolvedValue(agents);

    const result = await listProjectAgents("p1");

    expect(result).toEqual(agents);
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { project_id: "p1" },
      relations: ["agent_profile"],
      order: { assigned_at: "ASC" },
    });
  });
});

describe("assignAgent", () => {
  it("restores a soft-deleted assignment with updated role/scope", async () => {
    const existing = {
      id: "a1",
      project_id: "p1",
      agent_profile_id: "ap1",
      role: "coder",
      scope: null,
      deleted_at: new Date(),
    } as ProjectAgent;
    mockRepo.findOne.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue({ ...existing, role: "planner", deleted_at: null });

    const result = await assignAgent("p1", { agent_profile_id: "ap1", role: "planner", scope: null });

    expect(result.role).toBe("planner");
    expect(result.deleted_at).toBeNull();
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it("creates a new assignment when none exists", async () => {
    mockRepo.findOne.mockResolvedValue(null);
    const created = { id: "a2", project_id: "p1", agent_profile_id: "ap2", role: "tester", scope: null } as ProjectAgent;
    mockRepo.create.mockReturnValue(created);
    mockRepo.save.mockResolvedValue(created);

    const result = await assignAgent("p1", { agent_profile_id: "ap2", role: "tester", scope: null });

    expect(result.id).toBe("a2");
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ agent_profile_id: "ap2", role: "tester", scope: null }),
    );
  });
});

describe("patchProjectAgent", () => {
  it("updates role when assignment exists", async () => {
    const existing = { id: "a1", project_id: "p1", role: "coder", scope: null } as ProjectAgent;
    mockRepo.findOneBy.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue({ ...existing, role: "reviewer" });

    const result = await patchProjectAgent("p1", "a1", { role: "reviewer" });

    expect(result?.role).toBe("reviewer");
  });

  it("returns null when assignment not found", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);

    const result = await patchProjectAgent("p1", "missing", { role: "coder" });

    expect(result).toBeNull();
  });
});

describe("removeProjectAgent", () => {
  it("soft-deletes by id and project_id", async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await removeProjectAgent("p1", "a1");

    expect(mockRepo.softDelete).toHaveBeenCalledWith({ id: "a1", project_id: "p1" });
  });
});
