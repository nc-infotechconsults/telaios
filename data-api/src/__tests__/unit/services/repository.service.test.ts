import {
  listRepositoriesByProject,
  createRepository,
  getRepository,
  patchRepository,
  deleteRepository,
} from "../../../services/repository.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { Repository } from "../../../entities/Repository.entity";

jest.mock("../../../configs/data-source.config", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

jest.mock("../../../utils/crypto.util", () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn((v: string | null | undefined) =>
    v?.startsWith("enc:") ? v.slice(4) : ""
  ),
}));

const mockRepo = {
  findOneBy: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
};

beforeEach(() => {
  (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
});

describe("listRepositoriesByProject", () => {
  it("returns sanitized repos (no credentials field, has has_credentials)", async () => {
    const raw = [
      { id: "r1", name: "Repo1", project_id: "p1", credentials: "enc:mysecret" },
    ] as Repository[];
    mockRepo.find.mockResolvedValue(raw);

    const result = await listRepositoriesByProject("p1");

    expect(result).toHaveLength(1);
    expect((result[0] as Record<string, unknown>).credentials).toBeUndefined();
    expect(result[0].has_credentials).toBe(true);
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { project_id: "p1" },
      order: { name: "ASC" },
    });
  });

  it("has_credentials is false when credentials are empty", async () => {
    const raw = [{ id: "r2", name: "Repo2", project_id: "p1", credentials: "" }] as Repository[];
    mockRepo.find.mockResolvedValue(raw);

    const result = await listRepositoriesByProject("p1");

    expect(result[0].has_credentials).toBe(false);
  });
});

describe("createRepository", () => {
  it("encrypts credentials when provided", async () => {
    const saved = {
      id: "r1",
      name: "Repo",
      project_id: "p1",
      credentials: "enc:mysecret",
    } as Repository;
    mockRepo.create.mockReturnValue(saved);
    mockRepo.save.mockResolvedValue(saved);

    const result = await createRepository("p1", { name: "Repo", credentials: "mysecret" });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ credentials: "enc:mysecret" })
    );
    expect(result.has_credentials).toBe(true);
    expect((result as Record<string, unknown>).credentials).toBeUndefined();
  });

  it("has_credentials is false when no credentials are provided", async () => {
    const saved = { id: "r2", name: "Repo", project_id: "p1", credentials: "" } as Repository;
    mockRepo.create.mockReturnValue(saved);
    mockRepo.save.mockResolvedValue(saved);

    const result = await createRepository("p1", { name: "Repo" });

    expect(result.has_credentials).toBe(false);
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ credentials: expect.stringContaining("enc:") })
    );
  });
});

describe("getRepository", () => {
  it("returns null when not found", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);

    const result = await getRepository("r1", "p1");

    expect(result).toBeNull();
  });

  it("returns sanitized repository when found", async () => {
    const raw = { id: "r1", project_id: "p1", credentials: "enc:secret" } as Repository;
    mockRepo.findOneBy.mockResolvedValue(raw);

    const result = await getRepository("r1", "p1");

    expect(result).not.toBeNull();
    expect(result!.has_credentials).toBe(true);
    expect((result as Record<string, unknown>).credentials).toBeUndefined();
  });
});

describe("patchRepository", () => {
  it("encrypts credentials before updating when provided", async () => {
    const updated = { id: "r1", project_id: "p1", credentials: "enc:newcreds" } as Repository;
    mockRepo.update.mockResolvedValue({ affected: 1 });
    mockRepo.findOneBy.mockResolvedValue(updated);

    const result = await patchRepository("r1", { credentials: "newcreds" });

    expect(mockRepo.update).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ credentials: "enc:newcreds" })
    );
    expect(result!.has_credentials).toBe(true);
  });

  it("returns null when repository is not found after update", async () => {
    mockRepo.update.mockResolvedValue({ affected: 0 });
    mockRepo.findOneBy.mockResolvedValue(null);

    const result = await patchRepository("nonexistent", { name: "X" });

    expect(result).toBeNull();
  });
});

describe("deleteRepository", () => {
  it("calls softDelete with the given id", async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await deleteRepository("r1");

    expect(mockRepo.softDelete).toHaveBeenCalledWith("r1");
  });
});
