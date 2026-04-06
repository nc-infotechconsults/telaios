import type { Request, Response, NextFunction } from "express";
import { verifyToken, getUserById } from "../services/auth.service";
import type { User } from "../entities/User";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.slice(7);
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
