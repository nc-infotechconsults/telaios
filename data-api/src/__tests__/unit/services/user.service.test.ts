import { listUsers, getUser, patchUser, deleteUser } from "../../../services/user.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { User } from "../../../entities/User.entity";

jest.mock("../../../configs/data-source.config", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

const mockRepo = {
  findOneBy: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
};

beforeEach(() => {
  (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
});

describe("listUsers", () => {
  it("strips password_hash from every user", async () => {
    const users = [
      {
        id: "u1",
        email: "a@b.com",
        password_hash: "secret",
        display_name: "Alice",
        system_role: "member",
        is_active: true,
      },
    ] as User[];
    mockRepo.find.mockResolvedValue(users);

    const result = await listUsers();

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("a@b.com");
    expect((result[0] as Record<string, unknown>).password_hash).toBeUndefined();
  });

  it("returns an empty array when no users exist", async () => {
    mockRepo.find.mockResolvedValue([]);

    const result = await listUsers();

    expect(result).toEqual([]);
  });
});

describe("getUser", () => {
  it("returns null when user is not found", async () => {
    mockRepo.findOne.mockResolvedValue(null);

    expect(await getUser("nonexistent")).toBeNull();
  });

  it("returns the sanitized user when found", async () => {
    const user = {
      id: "u1",
      email: "a@b.com",
      password_hash: "secret",
      system_role: "member",
      is_active: true,
    } as User;
    mockRepo.findOne.mockResolvedValue(user);

    const result = await getUser("u1");

    expect(result!.email).toBe("a@b.com");
    expect((result as Record<string, unknown>).password_hash).toBeUndefined();
    expect(mockRepo.findOne).toHaveBeenCalledWith({
      where: { id: "u1" },
      relations: ["projectMemberships"],
    });
  });
});

describe("patchUser", () => {
  it("returns null when user is not found after update", async () => {
    mockRepo.update.mockResolvedValue({ affected: 0 });
    mockRepo.findOneBy.mockResolvedValue(null);

    const result = await patchUser("nonexistent", { display_name: "New Name" });

    expect(result).toBeNull();
  });

  it("returns the sanitized updated user when found", async () => {
    const updated = {
      id: "u1",
      email: "a@b.com",
      password_hash: "hash",
      display_name: "New Name",
      system_role: "member",
      is_active: true,
    } as User;
    mockRepo.update.mockResolvedValue({ affected: 1 });
    mockRepo.findOneBy.mockResolvedValue(updated);

    const result = await patchUser("u1", { display_name: "New Name" });

    expect(mockRepo.update).toHaveBeenCalledWith("u1", { display_name: "New Name" });
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: "u1" });
    expect(result!.display_name).toBe("New Name");
    expect((result as Record<string, unknown>).password_hash).toBeUndefined();
  });
});

describe("deleteUser", () => {
  it("calls softDelete with the given id", async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await deleteUser("u1");

    expect(mockRepo.softDelete).toHaveBeenCalledWith("u1");
  });
});
