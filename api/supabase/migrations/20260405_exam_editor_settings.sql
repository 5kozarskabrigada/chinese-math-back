alter table public.exams
  add column if not exists audience_scope text not null default 'all_students';

alter table public.exams
  add column if not exists violation_mode text not null default 'record';

alter table public.exams
  add column if not exists questions jsonb not null default '[]'::jsonb;

update public.exams
set audience_scope = 'all_students'
where audience_scope is null
   or audience_scope not in ('all_students', 'specific_classroom');

update public.exams
set violation_mode = 'record'
where violation_mode is null
   or violation_mode not in ('record', 'disqualify');

update public.exams
set questions = '[]'::jsonb
where questions is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exams_audience_scope_check'
  ) then
    alter table public.exams
      add constraint exams_audience_scope_check
      check (audience_scope in ('all_students', 'specific_classroom'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'exams_violation_mode_check'
  ) then
    alter table public.exams
      add constraint exams_violation_mode_check
      check (violation_mode in ('record', 'disqualify'));
  end if;
end $$;
