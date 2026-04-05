import { nanoid } from "nanoid";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Exam, ExamQuestion, MonitoringEvent, StudentStatus, ViolationSeverity, ViolationType } from "../types/domain.js";

export interface User {
  id: string;
  name: string;
  password: string;
  role: "admin" | "student";
  classroomId?: string;
}

export interface Student {
  id: string;
  name: string;
  password: string;
  classroomId?: string;
  cameraVerified: boolean;
  phoneLinked: boolean;
  status: StudentStatus;
}

export interface Classroom {
  id: string;
  name: string;
}

export interface AdminWarning {
  id: string;
  studentId: string;
  examId: string;
  message: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface DeletedItem {
  id: string;
  type: "exam" | "question";
  data: any;
  deletedAt: string;
  deletedBy: string;
}

export const db = {
  users: [
    { id: "admin-1", name: "Main Proctor", password: "admin123", role: "admin" as const },
    { id: "stu-1001", name: "Student One", password: "student123", role: "student" as const }
  ] as User[],
  students: [
    {
      id: "stu-1001",
      name: "Student One",
      password: "student123",
      classroomId: "class-1",
      cameraVerified: false,
      phoneLinked: false,
      status: "not_started" as StudentStatus
    }
  ] as Student[],
  classrooms: [{ id: "class-1", name: "Class A" }] as Classroom[],
  exams: [
    {
      id: "exam-1",
      title: "Mathematics – National Standardized Test",
      code: "M4TH2X",
      isActive: true,
      timeLimitMinutes: 120,
      classroomIds: ["class-1"],
      audienceScope: "specific_classroom" as const,
      violationMode: "record" as const,
      questions: [] as ExamQuestion[]
    }
  ] as Exam[],
  events: [] as MonitoringEvent[],
  warnings: [] as AdminWarning[],
  deletedItems: [] as DeletedItem[]
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseClient: SupabaseClient | null =
  supabaseUrl && supabaseServiceRoleKey ? createClient(supabaseUrl, supabaseServiceRoleKey) : null;

let syncQueue: Promise<void> = Promise.resolve();

function isSupabaseConfigured(): boolean {
  return !!supabaseClient;
}

function sanitizeExamQuestions(value: unknown): ExamQuestion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((question, index) => {
    const candidate = typeof question === "object" && question ? (question as Partial<ExamQuestion>) : {};
    const options = Array.isArray(candidate.options)
      ? candidate.options.map((option) => (typeof option === "string" ? option : ""))
      : [];

    return {
      id: typeof candidate.id === "string" ? candidate.id : `q-${index + 1}`,
      type: "multiple-choice",
      content: typeof candidate.content === "string" ? candidate.content : "",
      options: Array.from({ length: 4 }, (_, optionIndex) => options[optionIndex] ?? ""),
      correctAnswer: typeof candidate.correctAnswer === "string" ? candidate.correctAnswer : "",
      points: typeof candidate.points === "number" ? candidate.points : 1
    };
  });
}

export function isSupabaseEnabled(): boolean {
  return isSupabaseConfigured();
}

function syncToSupabase(): void {
  if (!supabaseClient) {
    return;
  }

  syncQueue = syncQueue
    .then(async () => {
      await supabaseClient.from("users").upsert(
        db.users.map((user) => ({
          id: user.id,
          name: user.name,
          password: user.password,
          role: user.role,
          classroom_id: user.classroomId ?? null
        })),
        { onConflict: "id" }
      );

      await supabaseClient.from("students").upsert(
        db.students.map((student) => ({
          id: student.id,
          name: student.name,
          password: student.password,
          classroom_id: student.classroomId ?? null,
          camera_verified: student.cameraVerified,
          phone_linked: student.phoneLinked,
          status: student.status
        })),
        { onConflict: "id" }
      );

      await supabaseClient.from("classrooms").upsert(
        db.classrooms.map((classroom) => ({ id: classroom.id, name: classroom.name })),
        { onConflict: "id" }
      );

      try {
        await supabaseClient.from("exams").upsert(
          db.exams.map((exam) => ({
            id: exam.id,
            title: exam.title,
            code: exam.code,
            is_active: exam.isActive,
            time_limit_minutes: exam.timeLimitMinutes,
            classroom_ids: exam.classroomIds ?? [],
            audience_scope: exam.audienceScope ?? "all_students",
            violation_mode: exam.violationMode ?? "record",
            questions: exam.questions ?? []
          })),
          { onConflict: "id" }
        );
      } catch {
        await supabaseClient.from("exams").upsert(
          db.exams.map((exam) => ({
            id: exam.id,
            title: exam.title,
            code: exam.code,
            is_active: exam.isActive,
            time_limit_minutes: exam.timeLimitMinutes,
            classroom_ids: exam.classroomIds ?? []
          })),
          { onConflict: "id" }
        );
      }

      await supabaseClient.from("events").upsert(
        db.events.map((event) => ({
          id: event.id,
          student_id: event.studentId,
          exam_id: event.examId,
          type: event.type,
          severity: event.severity ?? null,
          timestamp: event.timestamp,
          metadata: event.metadata ?? null
        })),
        { onConflict: "id" }
      );

      await supabaseClient.from("warnings").upsert(
        db.warnings.map((warning) => ({
          id: warning.id,
          student_id: warning.studentId,
          exam_id: warning.examId,
          message: warning.message,
          created_at: warning.createdAt,
          acknowledged: warning.acknowledged
        })),
        { onConflict: "id" }
      );

      await supabaseClient.from("deleted_items").upsert(
        db.deletedItems.map((item) => ({
          id: item.id,
          type: item.type,
          data: item.data,
          deleted_at: item.deletedAt,
          deleted_by: item.deletedBy
        })),
        { onConflict: "id" }
      );
    })
    .catch((error: unknown) => {
      console.error("Supabase sync failed", error);
    });
}

export function markPersistDirty(): void {
  syncToSupabase();
}

export async function initializePersistence(): Promise<void> {
  if (!supabaseClient) {
    return;
  }

  const examsResult = await supabaseClient
    .from("exams")
    .select("id,title,code,is_active,time_limit_minutes,classroom_ids,audience_scope,violation_mode,questions")
    .then((result) => {
      if (!result.error) {
        return result;
      }

      return supabaseClient.from("exams").select("id,title,code,is_active,time_limit_minutes,classroom_ids");
    });

  const [usersResult, studentsResult, classroomsResult, eventsResult, warningsResult, deletedItemsResult] = await Promise.all([
    supabaseClient.from("users").select("id,name,password,role,classroom_id"),
    supabaseClient.from("students").select("id,name,password,classroom_id,camera_verified,phone_linked,status"),
    supabaseClient.from("classrooms").select("id,name"),
    supabaseClient.from("events").select("id,student_id,exam_id,type,severity,timestamp,metadata").order("timestamp", { ascending: true }),
    supabaseClient.from("warnings").select("id,student_id,exam_id,message,created_at,acknowledged").order("created_at", { ascending: true }),
    supabaseClient.from("deleted_items").select("id,type,data,deleted_at,deleted_by").order("deleted_at", { ascending: false })
  ]);

  if (usersResult.error || studentsResult.error || classroomsResult.error || examsResult.error || eventsResult.error || warningsResult.error || deletedItemsResult.error) {
    console.error("Supabase hydrate failed", {
      users: usersResult.error,
      students: studentsResult.error,
      classrooms: classroomsResult.error,
      exams: examsResult.error,
      events: eventsResult.error,
      warnings: warningsResult.error,
      deletedItems: deletedItemsResult.error
    });
    return;
  }

  if (usersResult.data && usersResult.data.length > 0) {
    db.users = usersResult.data.map((user) => ({
      id: String(user.id),
      name: String(user.name),
      password: String(user.password),
      role: user.role === "admin" ? "admin" : "student",
      classroomId: user.classroom_id ?? undefined
    }));
  }

  if (studentsResult.data && studentsResult.data.length > 0) {
    db.students = studentsResult.data.map((student) => ({
      id: String(student.id),
      name: String(student.name),
      password: String(student.password),
      classroomId: student.classroom_id ?? undefined,
      cameraVerified: Boolean(student.camera_verified),
      phoneLinked: Boolean(student.phone_linked),
      status: (student.status as StudentStatus) ?? "not_started"
    }));
  }

  if (classroomsResult.data && classroomsResult.data.length > 0) {
    db.classrooms = classroomsResult.data.map((classroom) => ({
      id: String(classroom.id),
      name: String(classroom.name)
    }));
  }

  if (examsResult.data && examsResult.data.length > 0) {
    db.exams = examsResult.data.map((exam) => ({
      id: String((exam as Record<string, unknown>).id),
      title: String((exam as Record<string, unknown>).title),
      code: String((exam as Record<string, unknown>).code),
      isActive: Boolean((exam as Record<string, unknown>).is_active),
      timeLimitMinutes: Number((exam as Record<string, unknown>).time_limit_minutes),
      classroomIds: Array.isArray((exam as Record<string, unknown>).classroom_ids)
        ? ((exam as Record<string, unknown>).classroom_ids as string[])
        : [],
      audienceScope: (exam as Record<string, unknown>).audience_scope === "specific_classroom" ? "specific_classroom" : "all_students",
      violationMode: (exam as Record<string, unknown>).violation_mode === "disqualify" ? "disqualify" : "record",
      questions: sanitizeExamQuestions((exam as Record<string, unknown>).questions)
    }));
  }

  if (eventsResult.data) {
    db.events = eventsResult.data.map((event) => ({
      id: String(event.id),
      studentId: String(event.student_id),
      examId: String(event.exam_id),
      type: event.type as MonitoringEvent["type"],
      severity: (event.severity as ViolationSeverity | null) ?? undefined,
      timestamp: String(event.timestamp),
      metadata: (event.metadata as Record<string, string | number | boolean> | null) ?? undefined
    }));
  }

  if (warningsResult.data) {
    db.warnings = warningsResult.data.map((warning) => ({
      id: String(warning.id),
      studentId: String(warning.student_id),
      examId: String(warning.exam_id),
      message: String(warning.message),
      createdAt: String(warning.created_at),
      acknowledged: Boolean(warning.acknowledged)
    }));
  }

  if (deletedItemsResult.data) {
    db.deletedItems = deletedItemsResult.data.map((item) => ({
      id: String(item.id),
      type: item.type as "exam" | "question",
      data: item.data,
      deletedAt: String(item.deleted_at),
      deletedBy: String(item.deleted_by)
    }));
  }

  console.log("Supabase persistence initialized");
}

export function generateExamCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = `${letters}${digits}`;
  const code = [
    letters[Math.floor(Math.random() * letters.length)],
    digits[Math.floor(Math.random() * digits.length)]
  ];

  while (code.length < 6) {
    code.push(all[Math.floor(Math.random() * all.length)]);
  }

  return code.sort(() => Math.random() - 0.5).join("");
}

export function logEvent(input: {
  studentId: string;
  examId: string;
  type: MonitoringEvent["type"];
  severity?: ViolationSeverity;
  metadata?: Record<string, string | number | boolean>;
}): MonitoringEvent {
  const event: MonitoringEvent = {
    id: nanoid(),
    studentId: input.studentId,
    examId: input.examId,
    type: input.type,
    severity: input.severity,
    metadata: input.metadata,
    timestamp: new Date().toISOString()
  };

  db.events.push(event);

  if (input.severity === "critical") {
    const student = db.students.find((current) => current.id === input.studentId);
    if (student) {
      student.status = "terminated";
    }
  }

  syncToSupabase();

  return event;
}

export function logViolation(input: {
  studentId: string;
  examId: string;
  type: ViolationType;
  severity: ViolationSeverity;
  metadata?: Record<string, string | number | boolean>;
}) {
  return logEvent(input);
}

export function createWarning(input: {
  studentId: string;
  examId: string;
  message: string;
}): AdminWarning {
  const warning: AdminWarning = {
    id: nanoid(),
    studentId: input.studentId,
    examId: input.examId,
    message: input.message,
    createdAt: new Date().toISOString(),
    acknowledged: false
  };

  db.warnings.push(warning);
  syncToSupabase();
  return warning;
}

export function acknowledgeWarning(warningId: string): AdminWarning | undefined {
  const warning = db.warnings.find((current) => current.id === warningId);
  if (!warning) {
    return undefined;
  }

  warning.acknowledged = true;
  syncToSupabase();
  return warning;
}
