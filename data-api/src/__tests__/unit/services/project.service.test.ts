import { listProjects, createProject, getProject, patchProject, deleteProject } from "../../../services/project.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { Project } from "../../../entities/Project.entity";

jest.mock("../../../configs/data-source.config", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

jest.mock("../../../services/projectMember.service", () => ({
  addMember: jest.fn(),
}));

import { addMember } from "../../../services/projectMember.service";

const mockRepo = {
  findOneBy: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  delete: jest.fn(),
};

beforeEach(() => {
  (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
});

describe("listProjects", () => {
  it("returns the result of repo.find()", async () => {
    const projects = [{ id: "p1" }, { id: "p2" }] as Project[];
    mockRepo.find.mockResolvedValue(projects);

    const result = await listProjects();

    expect(result).toEqual(projects);
    expect(mockRepo.find).toHaveBeenCalledWith({ order: { created_at: "DESC" } });
  });
});

describe("createProject", () => {
  it("saves project and returns it without calling addMember when no creatorId", async () => {
    const project = { id: "p1", name: "Test" } as Project;
    mockRepo.create.mockReturnValue(project);
    mockRepo.save.mockResolvedValue(project);

    const result = await createProject({ name: "Test" });

    expect(mockRepo.create).toHaveBeenCalledWith({ name: "Test" });
    expect(mockRepo.save).toHaveBeenCalledWith(project);
    expect(result).toEqual(project);
    expect(addMember).not.toHaveBeenCalled();
  });

  it("calls addMember with owner role when creatorId is provided", async () => {
    const project = { id: "p1", name: "Test" } as Project;
    mockRepo.create.mockReturnValue(project);
    mockRepo.save.mockResolvedValue(project);
    (addMember as jest.Mock).mockResolvedValue(undefined);

    const result = await createProject({ name: "Test" }, "user-1");

    expect(result).toEqual(project);
    expect(addMember).toHaveBeenCalledWith("p1", { user_id: "user-1", role: "owner" });
  });
});

describe("getProject", () => {
  it("returns null when project is not found", async () => {
    mockRepo.findOne.mockResolvedValue(null);

    const result = await getProject("nonexistent");

    expect(result).toBeNull();
  });

  it("returns the project with relations when found", async () => {
    const project = { id: "p1", repositories: [], plans: [] } as unknown as Project;
    mockRepo.findOne.mockResolvedValue(project);

    const result = await getProject("p1");

    expect(result).toEqual(project);
    expect(mockRepo.findOne).toHaveBeenCalledWith({
      where: { id: "p1" },
      relations: ["repositories", "plans"],
    });
  });
});

describe("patchProject", () => {
  it("calls update then findOneBy and returns the updated project", async () => {
    const project = { id: "p1", name: "Updated" } as Project;
    mockRepo.update.mockResolvedValue({ affected: 1 });
    mockRepo.findOneBy.mockResolvedValue(project);

    const result = await patchProject("p1", { name: "Updated" });

    expect(mockRepo.update).toHaveBeenCalledWith("p1", { name: "Updated" });
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: "p1" });
    expect(result).toEqual(project);
  });
});

describe("deleteProject", () => {
  it("calls softDelete with the given id", async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await deleteProject("p1");

    expect(mockRepo.softDelete).toHaveBeenCalledWith("p1");
  });
});
