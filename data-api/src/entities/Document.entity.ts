import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Project } from "./Project.entity";
import { User } from "./User.entity";

export type DocumentFileType =
  | "pdf"
  | "docx"
  | "xlsx"
  | "md"
  | "txt"
  | "csv"
  | "json"
  | "other";

export type DocumentStatus =
  | "uploading"
  | "processing"
  | "ready"
  | "error";

@Entity("documents")
export class Document {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  project_id!: string;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Relation<Project>;

  @Column()
  name!: string;

  @Column({ type: "varchar" })
  file_type!: DocumentFileType;

  @Column()
  mime_type!: string;

  @Column({ unique: true })
  s3_key!: string;

  @Column({ type: "bigint" })
  size_bytes!: number;

  @Column()
  checksum_sha256!: string;

  @Column({ type: "varchar", default: "uploading" })
  status!: DocumentStatus;

  @Column({ type: "text", nullable: true })
  error_message!: string | null;

  @Column({ type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ nullable: true })
  uploaded_by!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "uploaded_by" })
  uploader!: Relation<User> | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
