import "reflect-metadata";
import * as dotenv from "dotenv";
import {DataSource} from "typeorm";
import {Migration1775914943523} from "../migrations/1775914943523-migration";
import {Migration1775940945125} from "../migrations/1775940945125-migration";
import {Migration1775941000000} from "../migrations/1775941000000-migration";
import {Migration1775941100000} from "../migrations/1775941100000-migration";
import {Migration1775941200000} from "../migrations/1775941200000-migration";
import {Migration1775941300000} from "../migrations/1775941300000-migration";
import {Migration1775941400000} from "../migrations/1775941400000-migration";
import {Migration1775941500000} from "../migrations/1775941500000-migration";
import {Migration1775942000000} from "../migrations/1775942000000-migration";
import {Migration1775950000000} from "../migrations/1775950000000-migration";
import {Migration1775960000000} from "../migrations/1775960000000-migration";
import {Migration1775960100000} from "../migrations/1775960100000-migration";
import {Migration1775970000000} from "../migrations/1775970000000-migration";
import {Migration1776000000000} from "../migrations/1776000000000-migration";
import {Migration1776000100000} from "../migrations/1776000100000-migration";
import {Migration1776000200000} from "../migrations/1776000200000-migration";
import {Migration1776000300000} from "../migrations/1776000300000-migration";
import {Project} from "../entities/Project.entity";
import {Repository} from "../entities/Repository.entity";
import {Plan} from "../entities/Plan.entity";
import {Task} from "../entities/Task.entity";
import {TaskDependency} from "../entities/TaskDependency.entity";
import {TaskRepository} from "../entities/TaskRepository.entity";
import {Message} from "../entities/Message.entity";
import {Settings} from "../entities/Settings.entity";
import {LibraryAgent} from "../entities/LibraryAgent.entity";
import {LibraryMCP} from "../entities/LibraryMCP.entity";
import {LibrarySkill} from "../entities/LibrarySkill.entity";
import {LibrarySkillFile} from "../entities/LibrarySkillFile.entity";
import {User} from "../entities/User.entity";
import {ProjectMember} from "../entities/ProjectMember.entity";
import {ProjectAgent} from "../entities/ProjectAgent.entity";
import {Document} from "../entities/Document.entity";
import {DocumentChunk} from "../entities/DocumentChunk.entity";
import {TaskArtifact} from "../entities/TaskArtifact.entity";
import {Workspace} from "../entities/Workspace.entity";
import {Environment} from "../entities/Environment.entity";
import {HelmRelease} from "../entities/HelmRelease.entity";
import {DocumentFolder} from "../entities/DocumentFolder.entity";
import {DocumentVersion} from "../entities/DocumentVersion.entity";
import {DocumentTag} from "../entities/DocumentTag.entity";
import {DocumentComment} from "../entities/DocumentComment.entity";
import {DocumentActivity} from "../entities/DocumentActivity.entity";
import {DocumentTemplate} from "../entities/DocumentTemplate.entity";
import {DocumentFavorite} from "../entities/DocumentFavorite.entity";

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
    LibraryAgent,
    LibraryMCP,
    LibrarySkill,
    LibrarySkillFile,
    User,
    ProjectMember,
    ProjectAgent,
    Document,
    DocumentChunk,
    TaskArtifact,
    Workspace,
    Environment,
    HelmRelease,
    DocumentFolder,
    DocumentVersion,
    DocumentTag,
    DocumentComment,
    DocumentActivity,
    DocumentTemplate,
    DocumentFavorite,
  ],
  migrations: [
    Migration1775914943523,
    Migration1775940945125,
    Migration1775941000000,
    Migration1775941100000,
    Migration1775941200000,
    Migration1775941300000,
    Migration1775941400000,
    Migration1775941500000,
    Migration1775942000000,
    Migration1775950000000,
    Migration1775960000000,
    Migration1775960100000,
    Migration1775970000000,
    Migration1776000000000,
    Migration1776000100000,
    Migration1776000200000,
    Migration1776000300000,
  ],
});

