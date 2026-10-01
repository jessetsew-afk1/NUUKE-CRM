-- =============================================================================
-- Background jobs, and live updates
--
-- pg_cron runs the sweeps every five minutes: sign-out reminders, automatic
-- sign-outs, no-show alerts, long breaks, meeting reminders. It is available on
-- every Supabase project; if it is not enabled the app still works, the sweeps
-- just do not run.
-- =============================================================================

create or replace function public.run_sweeps()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.attendance_sweep();
  perform public.sales_sweep();
end
$$;
revoke execute on function public.run_sweeps() from public, anon, authenticated;

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron is not available here (%). Enable it under Database → Extensions, then run this file again.', sqlerrm;
    return;
  end;
  perform cron.unschedule(jobid) from cron.job where jobname = 'nuuke-sweeps';
  perform cron.schedule('nuuke-sweeps', '*/5 * * * *', 'select public.run_sweeps()');
end
$$;

-- Live notifications in the browser.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when duplicate_object then
  null;
end
$$;
