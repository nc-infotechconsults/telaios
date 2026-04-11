import { listPlans, createPlan, getPlan, deletePlan, patchPlan } from "../../../services/plan.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { Plan } from "../../../entities/Plan.entity";

jest.mock("../../../configs/data-source.config", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

jest.mock("../../../services/task.service", () => ({
  serializeTask: jest.fn((task: unknown) => task),
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

describe("listPlans", () => {
  it("returns all plans when no projectId is given", async () => {
    const plans = [{ id: "plan1" }, { id: "plan2" }] as Plan[];
    mockRepo.find.mockResolvedValue(plans);

    const result = await listPlans();

    expect(result).toEqual(plans);
    expect(mockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });

  it("filters by project_id when projectId is provided", async () => {
    const plans = [{ id: "plan1", project_id: "proj1" }] as Plan[];
    mockRepo.find.mockResolvedValue(plans);

    const result = await listPlans("proj1");

    expect(result).toEqual(plans);
    expect(mockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { project_id: "proj1" } })
    );
  });
});

describe("createPlan", () => {
  it("creates and saves a plan then returns it", async () => {
    const plan = { id: "plan1", project_id: "proj1", title: "My Plan" } as unknown as Plan;
    mockRepo.create.mockReturnValue(plan);
    mockRepo.save.mockResolvedValue(plan);

    const result = await createPlan({ project_id: "proj1", title: "My Plan" });

    expect(mockRepo.create).toHaveBeenCalledWith({ project_id: "proj1", title: "My Plan" });
    expect(mockRepo.save).toHaveBeenCalledWith(plan);
    expect(result).toEqual(plan);
  });
});

describe("getPlan", () => {
  it("returns null when plan is not found", async () => {
    mockRepo.findOne.mockResolvedValue(null);

    const result = await getPlan("nonexistent");

    expect(result).toBeNull();
  });

  it("returns the plan with serialized tasks when found", async () => {
    const plan = { id: "plan1", tasks: [] } as unknown as Plan;
    mockRepo.findOne.mockResolvedValue(plan);

    const result = await getPlan("plan1");

    expect(result).not.toBeNull();
    expect(result!.tasks).toEqual([]);
  });
});

describe("deletePlan", () => {
  it("returns false when plan is not found", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);

    const result = await deletePlan("nonexistent");

    expect(result).toBe(false);
    expect(mockRepo.softDelete).not.toHaveBeenCalled();
  });

  it("calls softDelete and returns true when plan is found", async () => {
    const plan = { id: "plan1" } as Plan;
    mockRepo.findOneBy.mockResolvedValue(plan);
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    const result = await deletePlan("plan1");

    expect(result).toBe(true);
    expect(mockRepo.softDelete).toHaveBeenCalledWith("plan1");
  });
});

describe("patchPlan", () => {
  it("calls update then findOneBy and returns the updated plan", async () => {
    const plan = { id: "plan1", project_id: "proj1", title: "Updated" } as unknown as Plan;
    mockRepo.update.mockResolvedValue({ affected: 1 });
    mockRepo.findOneBy.mockResolvedValue(plan);

    const result = await patchPlan("plan1", { title: "Updated" });

    expect(mockRepo.update).toHaveBeenCalledWith("plan1", { title: "Updated" });
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: "plan1" });
    expect(result).toEqual(plan);
  });

  it("returns null when plan is not found after update", async () => {
    mockRepo.update.mockResolvedValue({ affected: 0 });
    mockRepo.findOneBy.mockResolvedValue(null);

    const result = await patchPlan("nonexistent", { title: "X" });

    expect(result).toBeNull();
  });
});
