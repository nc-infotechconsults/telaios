import "reflect-metadata";
import * as dotenv from "dotenv";
import { DataSource } from "typeorm";
import { Project } from "./entities/Project";
import { Repository } from "./entities/Repository";
import { Plan } from "./entities/Plan";
import { Task } from "./entities/Task";
import { TaskDependency } from "./entities/TaskDependency";
import { TaskRepository } from "./entities/TaskRepository";
import { Message } from "./entities/Message";
import { Settings } from "./entities/Settings";
import { AgentProfile } from "./entities/AgentProfile";
import { User } from "./entities/User";
import { ProjectMember } from "./entities/ProjectMember";

import { EnableUuidExtension1743897000000 } from "./migrations/1743897000000-EnableUuidExtension";
import { CreateAgentProfiles1743897000001 } from "./migrations/1743897000001-CreateAgentProfiles";
import { CreateProjects1743897000002 } from "./migrations/1743897000002-CreateProjects";
import { CreateSettings1743897000003 } from "./migrations/1743897000003-CreateSettings";
import { CreateRepositories1743897000004 } from "./migrations/1743897000004-CreateRepositories";
import { CreatePlans1743897000005 } from "./migrations/1743897000005-CreatePlans";
import { CreateMessages1743897000006 } from "./migrations/1743897000006-CreateMessages";
import { CreateTasks1743897000007 } from "./migrations/1743897000007-CreateTasks";
import { CreateTaskDependencies1743897000008 } from "./migrations/1743897000008-CreateTaskDependencies";
import { CreateTaskRepositories1743897000009 } from "./migrations/1743897000009-CreateTaskRepositories";
import { CreateUsers1743897600000 } from "./migrations/1743897600000-CreateUsers";
import { CreateProjectMembers1743897600001 } from "./migrations/1743897600001-CreateProjectMembers";
import { AddSettingsLlmParams1743897600002 } from "./migrations/1743897600002-AddSettingsLlmParams";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  synchronize: false,
  migrationsRun: true,
  logging: process.env.NODE_ENV === "development",
  entities: [
    Project,
    Repository,
    Plan,
    Task,
    TaskDependency,
    TaskRepository,
    Message,
    Settings,
    AgentProfile,
    User,
    ProjectMember,
  ],
  migrations: [
    EnableUuidExtension1743897000000,
    CreateAgentProfiles1743897000001,
    CreateProjects1743897000002,
    CreateSettings1743897000003,
    CreateRepositories1743897000004,
    CreatePlans1743897000005,
    CreateMessages1743897000006,
    CreateTasks1743897000007,
    CreateTaskDependencies1743897000008,
    CreateTaskRepositories1743897000009,
    CreateUsers1743897600000,
    CreateProjectMembers1743897600001,
    AddSettingsLlmParams1743897600002,
  ],
});

