import { AppDataSource } from "../data-source";
import { Message } from "../entities/Message";
import type { CreateMessageDto } from "../schemas/message.schema";

const repo = () => AppDataSource.getRepository(Message);

export async function listMessages(filters: { projectId?: string; planId?: string }): Promise<Message[]> {
  const where: Record<string, string> = {};
  if (filters.planId) where.plan_id = filters.planId;
  else if (filters.projectId) where.project_id = filters.projectId;
  return repo().find({ where, order: { created_at: "ASC" } });
}

export async function createMessage(dto: CreateMessageDto): Promise<Message> {
  return repo().save(repo().create(dto));
}
