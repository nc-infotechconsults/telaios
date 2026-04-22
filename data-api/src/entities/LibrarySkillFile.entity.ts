import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import type { LibrarySkill } from "./LibrarySkill.entity";

@Entity("library_skill_files")
export class LibrarySkillFile {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  skill_id!: string;

  // String-based reference avoids the circular ESM import cycle.
  // TypeORM resolves "LibrarySkill" via its metadata registry at runtime.
  @ManyToOne("LibrarySkill", "files", { onDelete: "CASCADE" })
  @JoinColumn({ name: "skill_id" })
  skill!: LibrarySkill;

  /** Relative path within the skill package, e.g. "scripts/deploy.sh" */
  @Column({ type: "varchar", length: 255 })
  path!: string;

  @Column({ type: "text" })
  content!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
