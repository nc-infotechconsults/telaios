import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Message } from "../entities/Message";

const router = Router();
const repo = () => AppDataSource.getRepository(Message);

router.get("/", async (req, res) => {
  const { project_id } = req.query;
  const where = project_id ? { project_id: project_id as string } : {};
  const messages = await repo().find({ where, order: { created_at: "ASC" } });
  res.json(messages);
});

router.post("/", async (req, res) => {
  const msg = await repo().save(repo().create(req.body));
  res.status(201).json(msg);
});

export default router;
