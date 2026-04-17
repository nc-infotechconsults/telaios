import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Document } from "./Document.entity";
import { User } from "./User.entity";

export type DocumentActivityAction =
  | "created"
  | "viewed"
  | "edited"
  | "commented"
  | "shared"
  | "deleted"
  | "restored"
  | "version_created";

@Entity("document_activities")
export class DocumentActivity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  document_id!: string;

  @ManyToOne(() => Document, { onDelete: "CASCADE" })
  @JoinColumn({ name: "document_id" })
  document!: Relation<Document>;

  @Column({ nullable: true })
  user_id!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User> | null;

  @Column({ type: "varchar" })
  action!: DocumentActivityAction;

  @Column({ type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at!: Date;
}
