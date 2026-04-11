import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from "typeorm";

@Entity("settings")
export class Settings {
  @PrimaryColumn({ default: 1 })
  id!: number;

  @Column({ nullable: true })
  llm_provider!: string;

  @Column({ nullable: true })
  llm_model!: string;

  @Column({ nullable: true })
  llm_api_key!: string;

  @Column({ nullable: true })
  llm_base_url!: string;

  @Column({ type: "double precision", nullable: true })
  llm_temperature!: number;

  @Column({ type: "integer", nullable: true })
  llm_max_tokens!: number;

  @Column({ type: "double precision", nullable: true })
  llm_top_p!: number;

  @Column({ type: "double precision", nullable: true })
  llm_frequency_penalty!: number;

  @Column({ type: "double precision", nullable: true })
  llm_presence_penalty!: number;

  @UpdateDateColumn()
  updated_at!: Date;
}
