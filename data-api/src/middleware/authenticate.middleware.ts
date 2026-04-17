import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { verifyToken, getUserById } from "../services/auth.service";
import type { User } from "../entities/User.entity";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.slice(7);

  // Service-to-service internal key bypass
  if (INTERNAL_API_KEY) {
    const a = Buffer.from(token);
    const b = Buffer.from(INTERNAL_API_KEY);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      req.user = {
        id: "service",
        email: "service@internal",
        display_name: "Internal Service",
        system_role: "admin",
        is_active: true,
      } as User;
      return next();
    }
  }

  try {
    const payload = verifyToken(token);
    const user = await getUserById(payload.sub);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: "Invalid or inactive account" });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
