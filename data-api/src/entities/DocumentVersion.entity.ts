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

@Entity("document_versions")
export class DocumentVersion {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  document_id!: string;

  @ManyToOne(() => Document, { onDelete: "CASCADE" })
  @JoinColumn({ name: "document_id" })
  document!: Relation<Document>;

  @Column({ type: "int" })
  version_number!: number;

  @Column({ type: "varchar" })
  s3_key!: string;

  @Column({ type: "bigint" })
  size_bytes!: number;

  @Column({ type: "varchar" })
  checksum_sha256!: string;

  @Column({ type: "text", nullable: true })
  change_description!: string | null;

  @Column({ nullable: true })
  created_by!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "created_by" })
  creator!: Relation<User> | null;

  @CreateDateColumn()
  created_at!: Date;
}
