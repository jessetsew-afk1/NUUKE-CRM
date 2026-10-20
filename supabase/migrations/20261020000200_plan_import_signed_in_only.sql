-- import_project_plan lets a caller with no signed-in user through (so the SQL editor can
-- run it). Over the API that would include anyone holding the public key, so only signed-in
-- users may call it; the SQL editor runs as the owner and is unaffected.
revoke execute on function public.import_project_plan(bigint, jsonb) from public, anon;
grant execute on function public.import_project_plan(bigint, jsonb) to authenticated;
