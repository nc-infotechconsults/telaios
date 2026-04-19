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

@Entity("document_folders")
export class DocumentFolder {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  project_id!: string;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Relation<Project>;

  @Column({ nullable: true })
  parent_folder_id!: string | null;

  @ManyToOne(() => DocumentFolder, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "parent_folder_id" })
  parent_folder!: Relation<DocumentFolder> | null;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar" })
  path!: string;

  @Column({ nullable: true })
  created_by!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by" })
  creator!: Relation<User> | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
