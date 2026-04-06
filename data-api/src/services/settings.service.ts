import { AppDataSource } from "../data-source";
import { Settings } from "../entities/Settings";
import { encrypt, decrypt } from "../middleware/crypto";
import type { PutSettingsDto } from "../schemas/settings.schema";

const repo = () => AppDataSource.getRepository(Settings);

function sanitizeSettings(s: Settings) {
  const hasKey = !!(s.llm_api_key && decrypt(s.llm_api_key));
  const { llm_api_key, ...rest } = s;
  return { ...rest, has_api_key: hasKey };
}

export async function getRawSettings() {
  let settings = await repo().findOneBy({ id: 1 });
  if (!settings) {
    settings = repo().create({ id: 1 });
    await repo().save(settings);
  }
  const { llm_api_key, ...rest } = settings;
  return {
    ...rest,
    llm_api_key_raw: llm_api_key ? decrypt(llm_api_key) : undefined,
  };
}

export async function getSettings() {
  let settings = await repo().findOneBy({ id: 1 });
  if (!settings) {
    settings = repo().create({ id: 1 });
    await repo().save(settings);
  }
  return sanitizeSettings(settings);
}

export async function putSettings(dto: PutSettingsDto) {
  const { llm_api_key_raw, ...rest } = dto;
  const data: Record<string, unknown> = { ...rest, id: 1 };
  if (llm_api_key_raw) data.llm_api_key = encrypt(llm_api_key_raw);
  await repo().save(repo().create(data as Partial<Settings>));
  const updated = await repo().findOneBy({ id: 1 });
  return sanitizeSettings(updated!);
}
