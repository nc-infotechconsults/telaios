import {
  findArtifactsByTaskId,
  createArtifactsBulk,
  deleteArtifactsByTaskId,
} from "../../../services/task_artifact.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { TaskArtifact } from "../../../entities/TaskArtifact.entity";

jest.mock("../../../configs/data-source.config", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

const mockRepo = {
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  softDelete: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (AppDataSource.getRepository as jest.Mock).mockImplementation((entity) => {
    if (entity === TaskArtifact) return mockRepo;
  });
});

describe("findArtifactsByTaskId", () => {
  it("finds artifacts ordered by sort_order then created_at", async () => {
    const fakeArtifacts = [
      { id: "a1", task_id: "t1", type: "log", sort_order: 0 },
      { id: "a2", task_id: "t1", type: "diff", sort_order: 1 },
    ];
    mockRepo.find.mockResolvedValue(fakeArtifacts);

    const result = await findArtifactsByTaskId("t1");

    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { task_id: "t1" },
      order: { sort_order: "ASC", created_at: "ASC" },
    });
    expect(result).toEqual(fakeArtifacts);
  });
});

describe("createArtifactsBulk", () => {
  it("creates artifacts with correct defaults and sort_order fallback", async () => {
    const dtos = [
      { type: "log" as const, title: "Execution Log", content: "step 1\nstep 2" },
      { type: "diff" as const, title: "Git Diff", content: "diff --git...", content_type: "text/x-diff" },
    ];

    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((entities) => entities.map((e: unknown) => ({ ...e as object, id: "uuid" })));

    const result = await createArtifactsBulk("t1", dtos);

    expect(mockRepo.create).toHaveBeenCalledTimes(2);
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: "t1", type: "log", sort_order: 0, content_type: "text/plain" })
    );
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: "t1", type: "diff", sort_order: 1, content_type: "text/x-diff" })
    );
    expect(result).toHaveLength(2);
  });

  it("uses dto.sort_order when provided", async () => {
    const dtos = [
      { type: "review" as const, title: "Review", content: "{}", sort_order: 5 },
    ];
    mockRepo.create.mockImplementation((data) => data);
    mockRepo.save.mockImplementation((entities) => entities);

    await createArtifactsBulk("t1", dtos);

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ sort_order: 5 })
    );
  });
});

describe("deleteArtifactsByTaskId", () => {
  it("soft-deletes all artifacts for a task", async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 3 });

    await deleteArtifactsByTaskId("t1");

    expect(mockRepo.softDelete).toHaveBeenCalledWith({ task_id: "t1" });
  });
});
