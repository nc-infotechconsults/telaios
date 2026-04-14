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

@Entity("document_chunks")
export class DocumentChunk {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  document_id!: string;

  @ManyToOne(() => Document, { onDelete: "CASCADE" })
  @JoinColumn({ name: "document_id" })
  document!: Relation<Document>;

  @Column({ type: "int" })
  chunk_index!: number;

  @Column({ type: "text" })
  content!: string;

  /** pgvector column — stored as text in TypeORM, cast to vector in raw queries. */
  @Column({ type: "text", nullable: true, name: "embedding" })
  embedding!: string | null;

  @Column({ type: "jsonb", nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at!: Date;
}
