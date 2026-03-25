import { Router } from "express";
import { z } from "zod";
import { db, logEvent, logViolation, markPersistDirty } from "../data/store.js";
import { broadcastMonitorEvent, broadcastStudentUpdate } from "../realtime/hub.js";

export const studentRouter = Router();

studentRouter.get("/me", (req, res) => {
  const session = req.session;
  if (!session) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  const student = db.students.find((current) => current.id === session.userId);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  res.json(student);
});

studentRouter.post("/verify-camera", (req, res) => {
  const student = db.students.find((current) => current.id === req.session?.userId);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  student.cameraVerified = true;
  markPersistDirty();
  broadcastStudentUpdate(student);
  res.json({ verified: true });
});

studentRouter.post("/link-phone", (req, res) => {
  const student = db.students.find((current) => current.id === req.session?.userId);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  student.phoneLinked = true;
  markPersistDirty();
  broadcastStudentUpdate(student);
  res.json({ linked: true, pairingCode: "246810" });
});

studentRouter.post("/join-exam", (req, res) => {
  const schema = z.object({ code: z.string().length(6) });
  const parseResult = schema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({ error: "Exam code must be 6 digits" });
    return;
  }

  const student = db.students.find((current) => current.id === req.session?.userId);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const exam = db.exams.find((current) => current.code === parseResult.data.code);
  if (!exam || !exam.isActive) {
    res.status(403).json({ error: "Exam is unavailable or inactive" });
    return;
  }

  const classroomAllowed =
    !exam.classroomIds || exam.classroomIds.length === 0 || !!(student.classroomId && exam.classroomIds.includes(student.classroomId));

  if (!classroomAllowed) {
    res.status(403).json({ error: "Student not authorized for this exam" });
    return;
  }

  if (!student.cameraVerified || !student.phoneLinked) {
    res.status(400).json({ error: "Verification required before joining exam" });
    return;
  }

  student.status = "in_progress";
  markPersistDirty();
  const event = logEvent({ studentId: student.id, examId: exam.id, type: "exam_started" });
  broadcastStudentUpdate(student);
  broadcastMonitorEvent(event);

  res.json({
    joined: true,
    exam: {
      id: exam.id,
      title: exam.title,
      timeLimitMinutes: exam.timeLimitMinutes
    }
  });
});

studentRouter.post("/monitor-event", (req, res) => {
  const schema = z.object({
    examId: z.string().min(1),
    type: z.enum([
      "fullscreen_exit",
      "tab_switch",
      "camera_disabled",
      "phone_camera_disconnected",
      "suspicious_inactivity"
    ]),
    severity: z.enum(["warning", "severe", "critical"]),
    metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
  });

  const parseResult = schema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid monitoring event payload" });
    return;
  }

  const student = db.students.find((current) => current.id === req.session?.userId);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  const event = logViolation({
    studentId: student.id,
    examId: parseResult.data.examId,
    type: parseResult.data.type,
    severity: parseResult.data.severity,
    metadata: parseResult.data.metadata
  });

  if (parseResult.data.severity === "severe" && student.status === "in_progress") {
    student.status = "flagged";
    markPersistDirty();
  }

  broadcastMonitorEvent(event);
  broadcastStudentUpdate(student);

  res.status(201).json(event);
});

studentRouter.post("/submit-exam", (req, res) => {
  const schema = z.object({ examId: z.string().min(1) });
  const parseResult = schema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid submit payload" });
    return;
  }

  const student = db.students.find((current) => current.id === req.session?.userId);
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  student.status = "submitted";
  markPersistDirty();
  const event = logEvent({
    studentId: student.id,
    examId: parseResult.data.examId,
    type: "exam_submitted"
  });
  broadcastStudentUpdate(student);
  broadcastMonitorEvent(event);

  res.json({ submitted: true, message: "Your results will be provided by your instructor." });
});
