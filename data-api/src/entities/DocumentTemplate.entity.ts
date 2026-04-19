import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import type { DocumentFileType } from "./Document.entity";
import { Project } from "./Project.entity";
import { User } from "./User.entity";

@Entity("document_templates")
export class DocumentTemplate {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar" })
  file_type!: DocumentFileType;

  @Column({ type: "varchar", nullable: true })
  s3_key!: string | null;

  @Column({ type: "varchar", nullable: true })
  category!: string | null;

  @Column({ type: "boolean", default: true })
  is_global!: boolean;

  @Column({ nullable: true })
  project_id!: string | null;

  @ManyToOne(() => Project, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Relation<Project> | null;

  @Column({ nullable: true })
  created_by!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by" })
  creator!: Relation<User> | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
