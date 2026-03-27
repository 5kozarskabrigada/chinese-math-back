create table if not exists users (
  id text primary key,
  name text not null,
  password text not null,
  role text not null check (role in ('admin', 'student')),
  classroom_id text null
);

create table if not exists students (
  id text primary key,
  name text not null,
  password text not null,
  classroom_id text null,
  camera_verified boolean not null default false,
  phone_linked boolean not null default false,
  status text not null
);

create table if not exists classrooms (
  id text primary key,
  name text not null
);

create table if not exists exams (
  id text primary key,
  title text not null,
  code text not null unique,
  is_active boolean not null default false,
  time_limit_minutes integer not null,
  classroom_ids text[] not null default '{}'
);

create table if not exists events (
  id text primary key,
  student_id text not null,
  exam_id text not null,
  type text not null,
  severity text null,
  timestamp timestamptz not null,
  metadata jsonb null
);

create table if not exists warnings (
  id text primary key,
  student_id text not null,
  exam_id text not null,
  message text not null,
  created_at timestamptz not null,
  acknowledged boolean not null default false
);

create index if not exists idx_events_student_id on events(student_id);
create index if not exists idx_events_exam_id on events(exam_id);
create index if not exists idx_events_timestamp on events(timestamp);
create index if not exists idx_warnings_student_id on warnings(student_id);
