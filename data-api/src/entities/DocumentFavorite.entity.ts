import {
  Entity,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  PrimaryColumn,
} from "typeorm";
import type { Relation } from "typeorm";
import { Document } from "./Document.entity";
import { User } from "./User.entity";

@Entity("document_favorites")
export class DocumentFavorite {
  @PrimaryColumn()
  document_id!: string;

  @ManyToOne(() => Document, { onDelete: "CASCADE" })
  @JoinColumn({ name: "document_id" })
  document!: Relation<Document>;

  @PrimaryColumn()
  user_id!: string;

  @ManyToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @CreateDateColumn()
  created_at!: Date;
}
