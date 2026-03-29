import { Router, Request, Response } from "express";
import { z } from "zod";
import { db, createWarning, generateExamCode, logViolation, markPersistDirty } from "../data/store.js";
import { broadcastMonitorEvent, broadcastStudentUpdate, broadcastWarningCreated } from "../realtime/hub.js";

export const adminRouter = Router();

// Password generation utility
function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Generate username from first and last name
function generateUsername(firstName: string, lastName: string): string {
  const cleanFirst = firstName.toLowerCase().trim().replace(/\s+/g, '');
  const cleanLast = lastName.toLowerCase().trim().replace(/\s+/g, '');
  const randomNum = Math.floor(1000 + Math.random() * 9000); // 4-digit number
  return `${cleanFirst}.${cleanLast}${randomNum}`;
}

adminRouter.get("/dashboard", (_req: Request, res: Response) => {
  res.json({
    students: db.students.length,
    classrooms: db.classrooms.length,
    exams: db.exams.length,
    flagged: db.students.filter((student) => student.status === "flagged").length,
    terminated: db.students.filter((student) => student.status === "terminated").length
  });
});

// User Management Endpoints
adminRouter.post("/users", (req: Request, res: Response) => {
  const createUserSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: z.enum(["admin", "student"]),
    classroomId: z.string().optional()
  });

  const parseResult = createUserSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid user payload", details: parseResult.error });
    return;
  }

  const { firstName, lastName, role, classroomId } = parseResult.data;
  const username = generateUsername(firstName, lastName);
  const password = generatePassword();
  const fullName = `${firstName} ${lastName}`;

  // Create user
  db.users.push({
    id: username,
    name: fullName,
    password,
    role,
    classroomId: role === "student" ? classroomId : undefined
  });

  // If student, also add to students array
  if (role === "student") {
    db.students.push({
      id: username,
      name: fullName,
      password,
      classroomId,
      cameraVerified: false,
      phoneLinked: false,
      status: "not_started"
    });
  }

  markPersistDirty();

  res.status(201).json({
    created: true,
    user: {
      id: username,
      name: fullName,
      username: username,
      password,
      role,
      classroomId
    }
  });
});

adminRouter.get("/users", (_req: Request, res: Response) => {
  const users = db.users.map(user => ({
    id: user.id,
    name: user.name,
    role: user.role,
    classroomId: user.classroomId
  }));
  res.json(users);
});

adminRouter.patch("/users/:userId/password", (req: Request, res: Response) => {
  const passwordSchema = z.object({
    newPassword: z.string().min(6).optional()
  });

  const parseResult = passwordSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid password payload" });
    return;
  }

  const user = db.users.find(u => u.id === req.params.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const newPassword = parseResult.data.newPassword || generatePassword();
  user.password = newPassword;

  // Update student password if it's a student
  if (user.role === "student") {
    const student = db.students.find(s => s.id === user.id);
    if (student) {
      student.password = newPassword;
    }
  }

  markPersistDirty();

  res.json({
    updated: true,
    userId: user.id,
    newPassword
  });
});

adminRouter.delete("/users/:userId", (req: Request, res: Response) => {
  const userIndex = db.users.findIndex(u => u.id === req.params.userId);
  if (userIndex === -1) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const user = db.users[userIndex];
  
  // Remove from users array
  db.users.splice(userIndex, 1);

  // If student, remove from students array
  if (user.role === "student") {
    const studentIndex = db.students.findIndex(s => s.id === user.id);
    if (studentIndex !== -1) {
      db.students.splice(studentIndex, 1);
    }
  }

  markPersistDirty();

  res.json({ deleted: true, userId: user.id });
});


adminRouter.get("/students", (_req: Request, res: Response) => {
  res.json(db.students);
});

adminRouter.post("/students", (req: Request, res: Response) => {
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

adminRouter.get("/classrooms", (_req: Request, res: Response) => {
  res.json(db.classrooms);
});

adminRouter.post("/classrooms", (req: Request, res: Response) => {
  const classroomSchema = z.object({
    name: z.string().min(1)
  });

  const parseResult = classroomSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid classroom payload" });
    return;
  }

  const newClassroom = {
    id: `class-${Date.now()}`,
    name: parseResult.data.name
  };

  db.classrooms.push(newClassroom);
  markPersistDirty();
  res.status(201).json({ created: true, classroom: newClassroom });
});

adminRouter.patch("/classrooms/:classroomId", (req: Request, res: Response) => {
  const classroomSchema = z.object({
    name: z.string().min(1)
  });

  const parseResult = classroomSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid classroom payload" });
    return;
  }

  const classroom = db.classrooms.find(c => c.id === req.params.classroomId);
  if (!classroom) {
    res.status(404).json({ error: "Classroom not found" });
    return;
  }

  classroom.name = parseResult.data.name;
  markPersistDirty();
  res.json({ updated: true, classroom });
});

adminRouter.delete("/classrooms/:classroomId", (req: Request, res: Response) => {
  const classroomIndex = db.classrooms.findIndex(c => c.id === req.params.classroomId);
  if (classroomIndex === -1) {
    res.status(404).json({ error: "Classroom not found" });
    return;
  }

  db.classrooms.splice(classroomIndex, 1);
  markPersistDirty();
  res.json({ deleted: true });
});

// Get classroom details with students
adminRouter.get("/classrooms/:classroomId", (req: Request, res: Response) => {
  const classroom = db.classrooms.find(c => c.id === req.params.classroomId);
  if (!classroom) {
    res.status(404).json({ error: "Classroom not found" });
    return;
  }

  // Get all students in this classroom
  const students = db.users.filter(u => u.role === "student" && u.classroomId === req.params.classroomId);
  
  res.json({
    classroom,
    students: students.map(s => ({
      id: s.id,
      name: s.name,
      classroomId: s.classroomId
    }))
  });
});

// Add student to classroom
adminRouter.post("/classrooms/:classroomId/students", (req: Request, res: Response) => {
  const studentSchema = z.object({
    studentId: z.string().min(1)
  });

  const parseResult = studentSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request payload" });
    return;
  }

  const classroom = db.classrooms.find(c => c.id === req.params.classroomId);
  if (!classroom) {
    res.status(404).json({ error: "Classroom not found" });
    return;
  }

  const student = db.users.find(u => u.id === parseResult.data.studentId && u.role === "student");
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  // Update student's classroom
  student.classroomId = req.params.classroomId;
  
  // Also update in students array if exists
  const studentRecord = db.students.find(s => s.id === student.id);
  if (studentRecord) {
    studentRecord.classroomId = req.params.classroomId;
  }

  markPersistDirty();
  res.json({ success: true, student: { id: student.id, name: student.name, classroomId: student.classroomId } });
});

// Remove student from classroom
adminRouter.delete("/classrooms/:classroomId/students/:studentId", (req: Request, res: Response) => {
  const classroom = db.classrooms.find(c => c.id === req.params.classroomId);
  if (!classroom) {
    res.status(404).json({ error: "Classroom not found" });
    return;
  }

  const student = db.users.find(u => u.id === req.params.studentId && u.role === "student");
  if (!student) {
    res.status(404).json({ error: "Student not found" });
    return;
  }

  if (student.classroomId !== req.params.classroomId) {
    res.status(400).json({ error: "Student is not in this classroom" });
    return;
  }

  // Remove student from classroom
  student.classroomId = undefined;
  
  // Also update in students array if exists
  const studentRecord = db.students.find(s => s.id === student.id);
  if (studentRecord) {
    studentRecord.classroomId = undefined;
  }

  markPersistDirty();
  res.json({ success: true });
});

adminRouter.get("/exams", (_req: Request, res: Response) => {
  res.json(db.exams);
});

adminRouter.post("/exams", (req: Request, res: Response) => {
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

adminRouter.patch("/exams/:examId/activation", (req: Request, res: Response) => {
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

adminRouter.get("/logs", (_req: Request, res: Response) => {
  res.json(db.events);
});

adminRouter.post("/warnings", (req: Request, res: Response) => {
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

adminRouter.post("/terminate", (req: Request, res: Response) => {
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
