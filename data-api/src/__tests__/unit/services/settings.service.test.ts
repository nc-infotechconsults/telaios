import { getSettings, getRawSettings, patchSettings } from "../../../services/settings.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { Settings } from "../../../entities/Settings.entity";
import { encrypt, decrypt } from "../../../utils/crypto.util";

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
  create: jest.fn(),
  save: jest.fn(),
};

beforeEach(() => {
  (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
});

describe("getSettings", () => {
  it("creates and saves default settings when none exist", async () => {
    const defaultSettings = { id: 1 } as Settings;
    mockRepo.findOneBy.mockResolvedValue(null);
    mockRepo.create.mockReturnValue(defaultSettings);
    mockRepo.save.mockResolvedValue(defaultSettings);

    const result = await getSettings();

    expect(mockRepo.create).toHaveBeenCalledWith({ id: 1 });
    expect(mockRepo.save).toHaveBeenCalledWith(defaultSettings);
    expect(result.has_api_key).toBe(false);
  });

  it("returns has_api_key=true when an encrypted key is present", async () => {
    const settings = { id: 1, llm_api_key: "enc:mykey" } as Settings;
    mockRepo.findOneBy.mockResolvedValue(settings);

    const result = await getSettings();

    expect(result.has_api_key).toBe(true);
    expect((result as Record<string, unknown>).llm_api_key).toBeUndefined();
  });

  it("returns has_api_key=false when no key is stored", async () => {
    const settings = { id: 1, llm_api_key: null } as unknown as Settings;
    mockRepo.findOneBy.mockResolvedValue(settings);

    const result = await getSettings();

    expect(result.has_api_key).toBe(false);
  });
});

describe("getRawSettings", () => {
  it("returns llm_api_key_raw as the decrypted value", async () => {
    const settings = { id: 1, llm_api_key: "enc:mykey" } as Settings;
    mockRepo.findOneBy.mockResolvedValue(settings);

    const result = await getRawSettings();

    expect(result.llm_api_key_raw).toBe("mykey");
    expect(decrypt).toHaveBeenCalledWith("enc:mykey");
  });

  it("returns llm_api_key_raw as undefined when no key is stored", async () => {
    const settings = { id: 1, llm_api_key: null } as unknown as Settings;
    mockRepo.findOneBy.mockResolvedValue(settings);

    const result = await getRawSettings();

    expect(result.llm_api_key_raw).toBeUndefined();
  });

  it("creates default settings when none exist", async () => {
    const defaultSettings = { id: 1 } as Settings;
    mockRepo.findOneBy.mockResolvedValue(null);
    mockRepo.create.mockReturnValue(defaultSettings);
    mockRepo.save.mockResolvedValue(defaultSettings);

    const result = await getRawSettings();

    expect(mockRepo.create).toHaveBeenCalledWith({ id: 1 });
    expect(result.llm_api_key_raw).toBeUndefined();
  });
});

describe("patchSettings", () => {
  it("encrypts llm_api_key_raw before saving", async () => {
    const updated = { id: 1, llm_api_key: "enc:mykey" } as Settings;
    mockRepo.create.mockReturnValue(updated);
    mockRepo.save.mockResolvedValue(updated);
    mockRepo.findOneBy.mockResolvedValue(updated);

    const result = await patchSettings({ llm_api_key_raw: "mykey" });

    expect(encrypt).toHaveBeenCalledWith("mykey");
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, llm_api_key: "enc:mykey" })
    );
    expect(result.has_api_key).toBe(true);
  });

  it("does not set llm_api_key when llm_api_key_raw is not provided", async () => {
    const updated = { id: 1 } as Settings;
    mockRepo.create.mockReturnValue(updated);
    mockRepo.save.mockResolvedValue(updated);
    mockRepo.findOneBy.mockResolvedValue(updated);

    await patchSettings({ llm_provider: "openai" });

    expect(encrypt).not.toHaveBeenCalled();
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ llm_api_key: expect.anything() })
    );
  });
});
