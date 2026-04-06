import { AppDataSource } from "../data-source";
import { Message } from "../entities/Message";
import type { CreateMessageDto } from "../schemas/message.schema";

const repo = () => AppDataSource.getRepository(Message);

export async function listMessages(projectId?: string): Promise<Message[]> {
  const where = projectId ? { project_id: projectId } : {};
  return repo().find({ where, order: { created_at: "ASC" } });
}

export async function createMessage(dto: CreateMessageDto): Promise<Message> {
  return repo().save(repo().create(dto));
}
