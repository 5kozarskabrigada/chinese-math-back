import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { config } from "../config.js";
import { db, logEvent } from "../data/store.js";

const loginSchema = z.object({
  id: z.string().min(1),
  password: z.string().min(1)
});

export const authRouter = Router();

authRouter.post("/login", (req: Request, res: Response) => {
  const parseResult = loginSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid login payload" });
    return;
  }

  const { id, password } = parseResult.data;
  const matched = db.users.find((user) => user.id === id && user.password === password);

  if (!matched) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = jwt.sign(
    {
      userId: matched.id,
      role: matched.role,
      classroomId: db.students.find((student) => student.id === matched.id)?.classroomId
    },
    config.jwtSecret,
    { expiresIn: config.tokenTtlSeconds }
  );

  if (matched.role === "student") {
    logEvent({
      studentId: matched.id,
      examId: "none",
      type: "exam_joined",
      metadata: { source: "login" }
    });
  }

  res.json({
    token,
    user: {
      id: matched.id,
      name: matched.name,
      role: matched.role
    }
  });
});
