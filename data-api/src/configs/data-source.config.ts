import "reflect-metadata";
import * as dotenv from "dotenv";
import {DataSource} from "typeorm";
import {Project} from "../entities/Project.entity";
import {Repository} from "../entities/Repository.entity";
import {Plan} from "../entities/Plan.entity";
import {Task} from "../entities/Task.entity";
import {TaskDependency} from "../entities/TaskDependency.entity";
import {TaskRepository} from "../entities/TaskRepository.entity";
import {Message} from "../entities/Message.entity";
import {Settings} from "../entities/Settings.entity";
import {AgentProfile} from "../entities/AgentProfile.entity";
import {User} from "../entities/User.entity";
import {ProjectMember} from "../entities/ProjectMember.entity";
import {ProjectAgent} from "../entities/ProjectAgent.entity";
import {Document} from "../entities/Document.entity";
import {DocumentChunk} from "../entities/DocumentChunk.entity";

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
    ProjectAgent,
    Document,
    DocumentChunk,
  ],
  migrations: [
    "../migrations/*.ts"
  ],
});

