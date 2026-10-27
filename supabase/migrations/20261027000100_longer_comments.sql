-- Comments and messages could only be 4,000 characters, so pasting a meeting
-- transcript into a task failed. They now take up to 100,000 (about two hours of
-- talk). Alerts still quote only the first 160 characters.
alter table public.task_comments drop constraint if exists task_comments_body_check;
alter table public.task_comments add constraint task_comments_body_check
  check (length(trim(body)) between 1 and 100000);

alter table public.file_comments drop constraint if exists file_comments_body_check;
alter table public.file_comments add constraint file_comments_body_check
  check (length(trim(body)) between 1 and 100000);

alter table public.project_messages drop constraint if exists project_messages_body_check;
alter table public.project_messages add constraint project_messages_body_check
  check (length(trim(body)) between 1 and 100000);
