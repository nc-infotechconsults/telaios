import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from "typeorm";
import type { Relation } from "typeorm";
import { ProjectMember } from "./ProjectMember.entity";

export type SystemRole = "admin" | "member";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  password_hash!: string;

  @Column()
  display_name!: string;

  @Column({ type: "varchar", default: "member" })
  system_role!: SystemRole;

  @Column({ default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;

  @OneToMany(() => ProjectMember, (pm) => pm.user, { cascade: true })
  projectMemberships!: Relation<ProjectMember[]>;
}
