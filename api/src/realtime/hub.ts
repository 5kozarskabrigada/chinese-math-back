import type { MonitoringEvent, Role } from "@secure-exam/shared";
import jwt from "jsonwebtoken";
import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { config } from "../config.js";
import { acknowledgeWarning, createWarning, db, logViolation, type Student } from "../data/store.js";

interface SocketSession {
  userId: string;
  role: Role;
}

let io: Server | null = null;

function roomForStudent(studentId: string): string {
  return `student:${studentId}`;
}

export function setupRealtime(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: config.allowedOrigins,
      credentials: true
    }
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth.token as string | undefined) ?? (socket.handshake.query.token as string | undefined);
    if (!token) {
      next(new Error("Missing token"));
      return;
    }

    try {
      const payload = jwt.verify(token, config.jwtSecret) as SocketSession;
      socket.data.session = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const session = socket.data.session as SocketSession;

    if (session.role === "admin") {
      socket.join("admins");
      socket.emit("admin:students_snapshot", db.students);
      socket.emit("admin:warnings_snapshot", db.warnings);
    }

    if (session.role === "student") {
      socket.join(roomForStudent(session.userId));
    }

    socket.on("admin:warning", (payload: { studentId: string; examId: string; message: string }) => {
      if (session.role !== "admin") {
        return;
      }

      const warning = createWarning(payload);
      const event = logViolation({
        studentId: payload.studentId,
        examId: payload.examId,
        type: "manual_flag",
        severity: "warning",
        metadata: { warningId: warning.id, source: "socket" }
      });

      io?.to(roomForStudent(payload.studentId)).emit("student:warning", warning);
      io?.to("admins").emit("admin:warning_created", warning);
      io?.to("admins").emit("admin:monitor_event", event);
    });

    socket.on("student:warning_ack", (payload: { warningId: string }) => {
      if (session.role !== "student") {
        return;
      }

      const warning = acknowledgeWarning(payload.warningId);
      if (!warning) {
        return;
      }

      io?.to("admins").emit("admin:warning_ack", {
        warningId: warning.id,
        studentId: session.userId,
        acknowledgedAt: new Date().toISOString()
      });
    });

    socket.on(
      "student:monitor_event",
      (payload: {
        examId: string;
        type: "fullscreen_exit" | "tab_switch" | "camera_disabled" | "phone_camera_disconnected" | "suspicious_inactivity";
        severity: "warning" | "severe" | "critical";
        metadata?: Record<string, string | number | boolean>;
      }) => {
        if (session.role !== "student") {
          return;
        }

        const event = logViolation({
          studentId: session.userId,
          examId: payload.examId,
          type: payload.type,
          severity: payload.severity,
          metadata: { ...payload.metadata, source: "socket" }
        });

        io?.to("admins").emit("admin:monitor_event", event);
        const student = db.students.find((current) => current.id === session.userId);
        if (student) {
          io?.to("admins").emit("admin:student_update", student);
        }
      }
    );
  });

  return io;
}

export function broadcastStudentUpdate(student: Student): void {
  io?.to("admins").emit("admin:student_update", student);
}

export function broadcastMonitorEvent(event: MonitoringEvent): void {
  io?.to("admins").emit("admin:monitor_event", event);
}

export function broadcastWarningCreated(warning: { id: string; studentId: string; examId: string; message: string; acknowledged: boolean }): void {
  io?.to("admins").emit("admin:warning_created", warning);
  io?.to(roomForStudent(warning.studentId)).emit("student:warning", warning);
}
