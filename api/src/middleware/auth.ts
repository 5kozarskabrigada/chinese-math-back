import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role, UserSession } from "../types/domain.js";
import { config } from "../config.js";

declare global {
  namespace Express {
    interface Request {
      session?: UserSession;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  const token = authHeader.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as UserSession;
    req.session = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }

    if (!roles.includes(req.session.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}
