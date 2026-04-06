import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { ProjectMember } from "./ProjectMember";

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

  @Column({ default: "member" })
  system_role!: SystemRole;

  @Column({ default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @OneToMany(() => ProjectMember, (pm) => pm.user, { cascade: true })
  projectMemberships!: ProjectMember[];
}
