import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Project } from "./Project.entity";
import { User } from "./User.entity";
import { HelmRelease } from "./HelmRelease.entity";

export type EnvironmentType = "kubernetes" | "docker";
export type EnvironmentStatus = "connected" | "disconnected" | "error";

@Entity("environments")
export class Environment {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  project_id!: string;

  @ManyToOne(() => Project, { onDelete: "CASCADE" })
  @JoinColumn({ name: "project_id" })
  project!: Relation<Project>;

  @Column()
  name!: string;

  @Column({ type: "varchar", default: "kubernetes" })
  type!: EnvironmentType;

  @Column({ type: "varchar", default: "disconnected" })
  status!: EnvironmentStatus;

  /** Encrypted JSON: kubeconfig / docker tls certs */
  @Column({ type: "text", nullable: true })
  connection_config!: string;

  @Column({ nullable: true })
  namespace!: string;

  @Column({ nullable: true })
  created_by!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by" })
  creator!: Relation<User>;

  @OneToMany(() => HelmRelease, (hr) => hr.environment, { cascade: true })
  helm_releases!: Relation<HelmRelease[]>;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
