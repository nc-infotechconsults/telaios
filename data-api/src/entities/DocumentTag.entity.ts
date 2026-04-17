import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Project } from "./Project.entity";

@Entity("document_tags")
export class DocumentTag {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  project_id!: string;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Relation<Project>;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar", default: "#3B82F6" })
  color!: string;

  @CreateDateColumn()
  created_at!: Date;
}
