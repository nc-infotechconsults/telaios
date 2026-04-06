import "reflect-metadata";
import "express-async-errors";
import express, { type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";

import authRouter from "./routes/auth";
import usersRouter from "./routes/users";
import projectMembersRouter from "./routes/projectMembers";
import projectsRouter from "./routes/projects";
import repositoriesRouter from "./routes/repositories";
import plansRouter from "./routes/plans";
import tasksRouter from "./routes/tasks";
import messagesRouter from "./routes/messages";
import settingsRouter from "./routes/settings";
import agentProfilesRouter from "./routes/agentProfiles";
import { patchRepositoryById } from "./controllers/repository.controller";
import { authenticate } from "./middleware/authenticate";

const app = express();

app.use(helmet());
app.use(cors());
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

// Standalone repository PATCH — used by agent-service to update clone status without project_id
app.patch("/repositories/:id", patchRepositoryById);

app.use("/plans", plansRouter);
app.use("/tasks", tasksRouter);
app.use("/messages", messagesRouter);
app.use("/settings", settingsRouter);
app.use("/agent-profiles", agentProfilesRouter);

// Global error handler — prevents unhandled async errors from crashing the server
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error & { statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.statusCode ?? 500;
  console.error("Unhandled error:", err.message);
  res.status(status).json({ error: status === 500 ? "Internal server error" : err.message });
});

export default app;
