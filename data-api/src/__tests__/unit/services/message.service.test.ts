import { listMessages, createMessage } from "../../../services/message.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { Message } from "../../../entities/Message.entity";

jest.mock("../../../configs/data-source.config", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

const mockRepo = {
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

beforeEach(() => {
  (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
});

describe("listMessages", () => {
  it("filters by plan_id when planId is provided", async () => {
    const messages = [{ id: "m1", plan_id: "plan1" }] as Message[];
    mockRepo.find.mockResolvedValue(messages);

    const result = await listMessages({ planId: "plan1" });

    expect(result).toEqual(messages);
    expect(mockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { plan_id: "plan1" } })
    );
  });

  it("filters by project_id when projectId is provided (and no planId)", async () => {
    const messages = [{ id: "m2", project_id: "proj1" }] as Message[];
    mockRepo.find.mockResolvedValue(messages);

    const result = await listMessages({ projectId: "proj1" });

    expect(result).toEqual(messages);
    expect(mockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { project_id: "proj1" } })
    );
  });

  it("uses an empty where clause when no filters are provided", async () => {
    mockRepo.find.mockResolvedValue([]);

    await listMessages({});

    expect(mockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it("prioritises planId over projectId when both are provided", async () => {
    mockRepo.find.mockResolvedValue([]);

    await listMessages({ planId: "plan1", projectId: "proj1" });

    expect(mockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { plan_id: "plan1" } })
    );
  });
});

describe("createMessage", () => {
  it("creates and saves a message then returns it", async () => {
    const message = { id: "m1", content: "Hello", project_id: "proj1" } as Message;
    mockRepo.create.mockReturnValue(message);
    mockRepo.save.mockResolvedValue(message);

    const result = await createMessage({ content: "Hello", project_id: "proj1", role: "user" });

    expect(mockRepo.create).toHaveBeenCalledWith({ content: "Hello", project_id: "proj1", role: "user" });
    expect(mockRepo.save).toHaveBeenCalledWith(message);
    expect(result).toEqual(message);
  });
});
