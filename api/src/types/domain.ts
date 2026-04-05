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

export type ExamViolationMode = "record" | "disqualify";

export type ExamAudienceScope = "all_students" | "specific_classroom";

export interface ExamQuestion {
  id: string;
  type: "multiple-choice";
  content: string;
  options: string[];
  correctAnswer: string;
  points: number;
}

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
  audienceScope?: ExamAudienceScope;
  violationMode?: ExamViolationMode;
  questions?: ExamQuestion[];
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
