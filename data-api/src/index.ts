import "reflect-metadata";
import "express-async-errors";
import * as dotenv from "dotenv";
dotenv.config();

import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { AppDataSource } from "./data-source";
import { Repository as RepositoryEntity } from "./entities/Repository";
import { encrypt } from "./middleware/crypto";

import projectsRouter from "./routes/projects";
import repositoriesRouter from "./routes/repositories";
import plansRouter from "./routes/plans";
import tasksRouter from "./routes/tasks";
import messagesRouter from "./routes/messages";
import settingsRouter from "./routes/settings";
import agentProfilesRouter from "./routes/agentProfiles";

const app = express();
const PORT = parseInt(process.env.PORT ?? "3000", 10);

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/projects", projectsRouter);
app.use("/projects", repositoriesRouter);

// Standalone repository PATCH — used by agent-service to update clone status without project_id
app.patch("/repositories/:id", async (req, res) => {
  const repoRepo = AppDataSource.getRepository(RepositoryEntity);
  const body = { ...req.body };
  if (body.credentials) body.credentials = encrypt(body.credentials);
  await repoRepo.update(req.params.id, body);
  const updated = await repoRepo.findOneBy({ id: req.params.id });
  if (!updated) return res.status(404).json({ error: "Not found" });
  const { credentials, ...rest } = updated;
  return res.json({ ...rest, has_credentials: !!credentials });
});

app.use("/plans", plansRouter);
app.use("/tasks", tasksRouter);
app.use("/messages", messagesRouter);
app.use("/settings", settingsRouter);
app.use("/agent-profiles", agentProfilesRouter);

// Global error handler — prevents unhandled async errors from crashing the server
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

AppDataSource.initialize()
  .then(() => {
    console.log("Database connected");
    app.listen(PORT, () => {
      console.log(`Data API listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection failed:", err);
    process.exit(1);
  });
