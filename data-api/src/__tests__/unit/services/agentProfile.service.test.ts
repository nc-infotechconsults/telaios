import {
  listAgentProfiles,
  createAgentProfile,
  getAgentProfile,
  patchAgentProfile,
  deleteAgentProfile,
} from "../../../services/agentProfile.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { AgentProfile } from "../../../entities/AgentProfile.entity";
import { encrypt } from "../../../utils/crypto.util";

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

describe("listAgentProfiles", () => {
  it("masks llm_api_key and github_token in all profiles", async () => {
    const profiles = [
      {
        id: "ap1",
        name: "Agent",
        llm_api_key: "enc:mykey",
        github_token: "enc:mytoken",
      },
    ] as AgentProfile[];
    mockRepo.find.mockResolvedValue(profiles);

    const result = await listAgentProfiles();

    expect(result).toHaveLength(1);
    expect(result[0].llm_api_key).toBe("***");
    expect(result[0].github_token).toBe("***");
  });

  it("sets llm_api_key and github_token to empty string when not set", async () => {
    const profiles = [
      { id: "ap2", name: "Agent2", llm_api_key: "", github_token: "" },
    ] as AgentProfile[];
    mockRepo.find.mockResolvedValue(profiles);

    const result = await listAgentProfiles();

    expect(result[0].llm_api_key).toBe("");
    expect(result[0].github_token).toBe("");
  });
});

describe("createAgentProfile", () => {
  it("encrypts sensitive fields before saving", async () => {
    const saved = {
      id: "ap1",
      name: "Agent",
      llm_api_key: "enc:mykey",
      github_token: "enc:mytoken",
    } as AgentProfile;
    mockRepo.create.mockReturnValue(saved);
    mockRepo.save.mockResolvedValue(saved);

    const result = await createAgentProfile({
      name: "Agent",
      llm_api_key: "mykey",
      github_token: "mytoken",
    } as Parameters<typeof createAgentProfile>[0]);

    expect(encrypt).toHaveBeenCalledWith("mykey");
    expect(encrypt).toHaveBeenCalledWith("mytoken");
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ llm_api_key: "enc:mykey", github_token: "enc:mytoken" })
    );
    expect(result.llm_api_key).toBe("***");
    expect(result.github_token).toBe("***");
  });
});

describe("getAgentProfile", () => {
  it("returns null when profile is not found", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);

    const result = await getAgentProfile("nonexistent");

    expect(result).toBeNull();
  });

  it("returns the sanitized profile when found", async () => {
    const profile = {
      id: "ap1",
      name: "Agent",
      llm_api_key: "enc:mykey",
      github_token: "enc:mytoken",
    } as AgentProfile;
    mockRepo.findOneBy.mockResolvedValue(profile);

    const result = await getAgentProfile("ap1");

    expect(result).not.toBeNull();
    expect(result!.llm_api_key).toBe("***");
    expect(result!.github_token).toBe("***");
  });
});

describe("patchAgentProfile", () => {
  it("encrypts sensitive fields before updating", async () => {
    const updated = {
      id: "ap1",
      name: "Agent",
      llm_api_key: "enc:newkey",
      github_token: "",
    } as AgentProfile;
    mockRepo.update.mockResolvedValue({ affected: 1 });
    mockRepo.findOneBy.mockResolvedValue(updated);

    const result = await patchAgentProfile("ap1", { llm_api_key: "newkey" });

    expect(encrypt).toHaveBeenCalledWith("newkey");
    expect(mockRepo.update).toHaveBeenCalledWith(
      "ap1",
      expect.objectContaining({ llm_api_key: "enc:newkey" })
    );
    expect(result!.llm_api_key).toBe("***");
  });

  it("returns null when profile is not found after update", async () => {
    mockRepo.update.mockResolvedValue({ affected: 0 });
    mockRepo.findOneBy.mockResolvedValue(null);

    const result = await patchAgentProfile("nonexistent", { name: "X" });

    expect(result).toBeNull();
  });
});

describe("deleteAgentProfile", () => {
  it("calls softDelete with the given id", async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await deleteAgentProfile("ap1");

    expect(mockRepo.softDelete).toHaveBeenCalledWith("ap1");
  });
});
