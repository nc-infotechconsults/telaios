import "reflect-metadata";
import * as dotenv from "dotenv";
import {DataSource} from "typeorm";
import {Project} from "./entities/Project";
import {Repository} from "./entities/Repository";
import {Plan} from "./entities/Plan";
import {Task} from "./entities/Task";
import {TaskDependency} from "./entities/TaskDependency";
import {TaskRepository} from "./entities/TaskRepository";
import {Message} from "./entities/Message";
import {Settings} from "./entities/Settings";
import {AgentProfile} from "./entities/AgentProfile";
import {User} from "./entities/User";
import {ProjectMember} from "./entities/ProjectMember";

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
    "./src/migrations/*.ts"
  ],
});

