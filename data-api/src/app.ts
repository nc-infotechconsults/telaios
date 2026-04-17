import "reflect-metadata";
import "express-async-errors";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";

import authRouter from "./routes/auth.route";
import usersRouter from "./routes/users.route";
import projectMembersRouter from "./routes/projectMembers.route";
import projectAgentsRouter from "./routes/projectAgents.route";
import documentsRouter from "./routes/documents.route";
import internalRouter from "./routes/internal.route";
import projectsRouter from "./routes/projects.route";
import repositoriesRouter from "./routes/repositories.route";
import plansRouter from "./routes/plans.route";
import tasksRouter from "./routes/tasks.route";
import messagesRouter from "./routes/messages.route";
import settingsRouter from "./routes/settings.route";
import agentProfilesRouter from "./routes/agentProfiles.route";
import workspacesRouter from "./routes/workspaces.route";
import workspaceItemRouter from "./routes/workspaceItem.route";
import environmentsRouter from "./routes/environments.route";
import environmentItemRouter from "./routes/environmentItem.route";
import { patchRepositoryById } from "./controllers/repository.controller";
import { authenticate } from "./middleware/authenticate.middleware";
import logger from "./utils/logger";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || false,
    credentials: true,
  })
);
app.use(express.json());

// Open routes
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});
app.use("/auth", authRouter);

// All routes below require authentication
app.use(authenticate);

app.use("/users", usersRouter);
app.use("/projects", projectsRouter);
app.use("/projects", repositoriesRouter);
app.use("/projects", projectMembersRouter);
app.use("/projects", projectAgentsRouter);
app.use("/projects", documentsRouter);
app.use("/projects", workspacesRouter);
app.use("/projects", environmentsRouter);
app.use("/internal", internalRouter);

// Standalone repository PATCH — used by agent-service to update clone status without project_id
app.patch("/repositories/:id", patchRepositoryById);

app.use("/plans", plansRouter);
app.use("/tasks", tasksRouter);
app.use("/messages", messagesRouter);
app.use("/settings", settingsRouter);
app.use("/agent-profiles", agentProfilesRouter);
app.use("/workspaces", workspaceItemRouter);
app.use("/environments", environmentItemRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.statusCode ?? 500;
  logger.error({ err, status }, "Unhandled error");
  res.status(status).json({ error: status === 500 ? "Internal server error" : err.message });
});

export default app;
