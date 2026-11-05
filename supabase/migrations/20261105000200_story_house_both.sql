-- Lets a sales agent work in both departments: stays in Sales (keeps their
-- NUUKE leads) and also gets Story&House (ebooks) leads.
alter table public.profiles add column if not exists also_story_house boolean not null default false;
