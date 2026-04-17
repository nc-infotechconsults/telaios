import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Environment } from "./Environment.entity";
import { User } from "./User.entity";

export type HelmReleaseStatus = "pending" | "deployed" | "failed" | "uninstalled";

@Entity("helm_releases")
export class HelmRelease {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  environment_id!: string;

  @ManyToOne(() => Environment, (env) => env.helm_releases, { onDelete: "CASCADE" })
  @JoinColumn({ name: "environment_id" })
  environment!: Relation<Environment>;

  @Column()
  project_id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  chart_repo_url!: string;

  @Column()
  chart_name!: string;

  @Column({ nullable: true })
  chart_version!: string;

  @Column({ nullable: true })
  namespace!: string;

  @Column({ type: "jsonb", nullable: true })
  values_override!: Record<string, unknown>;

  @Column({ type: "varchar", default: "pending" })
  status!: HelmReleaseStatus;

  @Column({ type: "text", nullable: true })
  release_notes!: string;

  @Column({ nullable: true })
  deployed_by!: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "deployed_by" })
  deployer!: Relation<User>;

  @Column({ type: "timestamp", nullable: true })
  deployed_at!: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
