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
import { Document } from "./Document.entity";
import { User } from "./User.entity";

export type DocumentCommentAnchorType =
  | "page"
  | "cell"
  | "text_range"
  | "general";

@Entity("document_comments")
export class DocumentComment {
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

  @Column({ type: "text" })
  content!: string;

  @Column({ type: "varchar" })
  anchor_type!: DocumentCommentAnchorType;

  @Column({ type: "jsonb", nullable: true })
  anchor_data!: Record<string, unknown> | null;

  @Column({ type: "boolean", default: false })
  resolved!: boolean;

  @Column({ nullable: true })
  parent_comment_id!: string | null;

  @ManyToOne(() => DocumentComment, { nullable: true, onDelete: "CASCADE" })
  @JoinColumn({ name: "parent_comment_id" })
  parent_comment!: Relation<DocumentComment> | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
