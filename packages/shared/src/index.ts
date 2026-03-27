export type Role = "admin" | "student";

export type StudentStatus =
  | "not_started"
  | "in_progress"
  | "flagged"
  | "terminated"
  | "submitted";

export type ViolationSeverity = "warning" | "severe" | "critical";

export type ViolationType =
  | "fullscreen_exit"
  | "tab_switch"
  | "camera_disabled"
  | "phone_camera_disconnected"
  | "suspicious_inactivity"
  | "manual_flag";

export interface UserSession {
  userId: string;
  role: Role;
  classroomId?: string;
}

export interface Exam {
  id: string;
  title: string;
  code: string;
  isActive: boolean;
  timeLimitMinutes: number;
  classroomIds?: string[];
}

export interface MonitoringEvent {
  id: string;
  studentId: string;
  examId: string;
  type: ViolationType | "exam_joined" | "exam_started" | "exam_submitted";
  severity?: ViolationSeverity;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}
