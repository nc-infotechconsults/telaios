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

  @UpdateDateColumn()
  updated_at!: Date;
}
