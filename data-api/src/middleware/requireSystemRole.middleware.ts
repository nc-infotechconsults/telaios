import type { Request, Response, NextFunction } from "express";
import type { SystemRole } from "../entities/User.entity";

export function requireSystemRole(role: SystemRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (req.user.system_role !== role) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
}
