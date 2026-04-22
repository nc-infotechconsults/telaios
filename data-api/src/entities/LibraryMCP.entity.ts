import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";

@Entity("library_mcps")
export class LibraryMCP {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ unique: true })
  slug!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "varchar", default: "stdio" })
  transport!: "stdio" | "streamable-http";

  /** Required when transport = stdio */
  @Column({ type: "varchar", nullable: true })
  command!: string | null;

  @Column({ type: "jsonb", default: "[]" })
  args!: string[];

  @Column({ type: "jsonb", default: "{}" })
  env!: Record<string, string>;

  /** Required when transport = streamable-http */
  @Column({ type: "varchar", nullable: true })
  url!: string | null;

  @Column({ type: "jsonb", default: "{}" })
  headers!: Record<string, string>;

  @Column({ type: "jsonb", default: "[]" })
  tags!: string[];

  @Column({ type: "varchar", nullable: true })
  published_by!: string | null;

  @Column({ type: "int", default: 0 })
  usage_count!: number;

  @Column({ type: "varchar", default: "1.0.0" })
  version!: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at", nullable: true })
  deleted_at!: Date | null;
}
