import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
} from "typeorm";
import { LibrarySkillFile } from "./LibrarySkillFile.entity";

@Entity("library_skills")
export class LibrarySkill {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ unique: true })
  slug!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  /** Full SKILL.md content */
  @Column({ type: "text" })
  content!: string;

  @Column({ type: "jsonb", default: "[]" })
  tags!: string[];

  @Column({ type: "varchar", nullable: true })
  published_by!: string | null;

  @Column({ type: "int", default: 0 })
  usage_count!: number;

  @Column({ type: "varchar", default: "1.0.0" })
  version!: string;

  @Column({ type: "varchar", nullable: true })
  license!: string | null;

  @Column({ type: "varchar", nullable: true })
  compatibility!: string | null;

  @Column({ type: "jsonb", nullable: true })
  skill_metadata!: Record<string, string> | null;

  @OneToMany(() => LibrarySkillFile, (f) => f.skill)
  files!: LibrarySkillFile[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
