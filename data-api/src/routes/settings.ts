import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Settings } from "../entities/Settings";
import { encrypt, decrypt } from "../middleware/crypto";

const router = Router();
const repo = () => AppDataSource.getRepository(Settings);

router.get("/", async (_req, res) => {
  let settings = await repo().findOneBy({ id: 1 });
  if (!settings) {
    settings = repo().create({ id: 1 });
    await repo().save(settings);
  }
  res.json(sanitize(settings));
});

router.put("/", async (req, res) => {
  const { llm_api_key_raw, ...rest } = req.body;
  const body: Record<string, unknown> = { ...rest, id: 1 };
  if (llm_api_key_raw) body.llm_api_key = encrypt(llm_api_key_raw);
  await repo().save(repo().create(body as Partial<Settings>));
  const updated = await repo().findOneBy({ id: 1 });
  res.json(sanitize(updated!));
});

function sanitize(s: Settings) {
  const hasKey = !!(s.llm_api_key && decrypt(s.llm_api_key));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { llm_api_key, ...rest } = s;
  return { ...rest, has_api_key: hasKey };
}

export default router;
