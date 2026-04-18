import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../configs/data-source.config";
import { User } from "../entities/User.entity";
import type { RegisterDto, LoginDto } from "../schemas/auth.schema";

const repo = () => AppDataSource.getRepository(User);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
const JWT_TTL = "7d";

export function signToken(user: User): string {
  return jwt.sign(
    { sub: user.id, email: user.email, system_role: user.system_role },
    JWT_SECRET,
    { expiresIn: JWT_TTL }
  );
}

export function verifyToken(token: string): { sub: string; email: string; system_role: string } {
  return jwt.verify(token, JWT_SECRET) as { sub: string; email: string; system_role: string };
}

export function sanitizeUser(user: User) {
  const { password_hash, ...rest } = user;
  return rest;
}

export async function register(dto: RegisterDto) {
  const email = dto.email.toLowerCase();
  const existing = await repo().findOneBy({ email });
  if (existing) throw Object.assign(new Error("Email already registered"), { statusCode: 409 });

  const password_hash = await bcrypt.hash(dto.password, 12);

  // First user in the system becomes admin
  const count = await repo().count();
  const system_role = count === 0 ? "admin" : "member";

  const user = repo().create({ email, password_hash, display_name: dto.display_name, system_role } as Partial<User>);
  const saved = await repo().save(user);

  return { token: signToken(saved), user: sanitizeUser(saved) };
}

export async function login(dto: LoginDto) {
  const email = dto.email.toLowerCase();
  const user = await repo().findOneBy({ email });
  if (!user || !user.is_active) throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });

  const valid = await bcrypt.compare(dto.password, user.password_hash);
  if (!valid) throw Object.assign(new Error("Invalid credentials"), { statusCode: 401 });

  return { token: signToken(user), user: sanitizeUser(user) };
}

export async function getUserById(id: string): Promise<User | null> {
  return repo().findOneBy({ id });
}
