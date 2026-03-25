import { Router } from "express";
import { z } from "zod";
import { db, createWarning, generateExamCode, logViolation, markPersistDirty } from "../data/store.js";
import { broadcastMonitorEvent, broadcastStudentUpdate, broadcastWarningCreated } from "../realtime/hub.js";

export const adminRouter = Router();

adminRouter.get("/dashboard", (_req, res) => {
  res.json({
    students: db.students.length,
    classrooms: db.classrooms.length,
    exams: db.exams.length,
    flagged: db.students.filter((student) => student.status === "flagged").length,
    terminated: db.students.filter((student) => student.status === "terminated").length
  });
});

adminRouter.get("/students", (_req, res) => {
  res.json(db.students);
});

adminRouter.post("/students", (req, res) => {
  const studentSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    password: z.string().min(1),
    classroomId: z.string().optional()
  });

  const parseResult = studentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid student payload" });
    return;
  }

  db.students.push({
    ...parseResult.data,
    cameraVerified: false,
    phoneLinked: false,
    status: "not_started"
  });

  db.users.push({
    id: parseResult.data.id,
    name: parseResult.data.name,
    password: parseResult.data.password,
    role: "student"
  });

  markPersistDirty();

  res.status(201).json({ created: true });
});

adminRouter.get("/classrooms", (_req, res) => {
  res.json(db.classrooms);
});

adminRouter.post("/classrooms", (req, res) => {
  const classroomSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1)
  });

  const parseResult = classroomSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid classroom payload" });
    return;
  }

  db.classrooms.push(parseResult.data);
  markPersistDirty();
  res.status(201).json({ created: true });
});

adminRouter.get("/exams", (_req, res) => {
  res.json(db.exams);
});

adminRouter.post("/exams", (req, res) => {
  const examSchema = z.object({
    title: z.string().min(1),
    timeLimitMinutes: z.number().int().min(1),
    classroomIds: z.array(z.string()).optional()
  });

  const parseResult = examSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid exam payload" });
    return;
  }

  db.exams.push({
    id: `exam-${db.exams.length + 1}`,
    code: generateExamCode(),
    isActive: false,
    ...parseResult.data
  });

  markPersistDirty();

  res.status(201).json({ created: true });
});

adminRouter.patch("/exams/:examId/activation", (req, res) => {
  const activationSchema = z.object({ isActive: z.boolean() });
  const parseResult = activationSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid activation payload" });
    return;
  }

  const exam = db.exams.find((current) => current.id === req.params.examId);
  if (!exam) {
    res.status(404).json({ error: "Exam not found" });
    return;
  }

  exam.isActive = parseResult.data.isActive;
  markPersistDirty();
  res.json({ updated: true, exam });
});

adminRouter.get("/logs", (_req, res) => {
  res.json(db.events);
});

adminRouter.post("/warnings", (req, res) => {
  const warningSchema = z.object({
    studentId: z.string().min(1),
    examId: z.string().min(1),
    message: z.string().min(1)
  });

  const parseResult = warningSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid warning payload" });
    return;
  }

  const warning = createWarning(parseResult.data);
  const event = logViolation({
    studentId: parseResult.data.studentId,
    examId: parseResult.data.examId,
    type: "manual_flag",
    severity: "warning",
    metadata: { warningId: warning.id }
  });

  broadcastWarningCreated(warning);
  broadcastMonitorEvent(event);

  res.status(201).json(warning);
});

adminRouter.post("/terminate", (req, res) => {
  const terminateSchema = z.object({
    studentId: z.string().min(1),
    examId: z.string().min(1),
    reason: z.string().min(1)
  });

  const parseResult = terminateSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid terminate payload" });
    return;
  }

  const student = db.students.find((current) => current.id === parseResult.data.studentId);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  student.status = "terminated";
  markPersistDirty();
  const event = logViolation({
    studentId: parseResult.data.studentId,
    examId: parseResult.data.examId,
    type: "manual_flag",
    severity: "critical",
    metadata: { reason: parseResult.data.reason }
  });

  broadcastStudentUpdate(student);
  broadcastMonitorEvent(event);

  res.json({ terminated: true });
});
