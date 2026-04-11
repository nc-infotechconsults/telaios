import { AppDataSource } from "../configs/data-source.config";
import { User } from "../entities/User.entity";
import { sanitizeUser } from "./auth.service";
import type { PatchUserDto } from "../schemas/user.schema";

const repo = () => AppDataSource.getRepository(User);

export async function listUsers() {
  const users = await repo().find({ order: { created_at: "ASC" } });
  return users.map(sanitizeUser);
}

export async function getUser(id: string) {
  const user = await repo().findOne({ where: { id }, relations: ["projectMemberships"] });
  return user ? sanitizeUser(user) : null;
}

export async function patchUser(id: string, dto: PatchUserDto) {
  await repo().update(id, dto);
  const updated = await repo().findOneBy({ id });
  return updated ? sanitizeUser(updated) : null;
}

export async function deleteUser(id: string): Promise<void> {
  await repo().softDelete(id);
}
