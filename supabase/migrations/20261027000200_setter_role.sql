-- Appointment setters: people who only do outreach (Instagram voice memos) and book
-- calls for a closer. They see the Outreach screens and nothing else: no dialer,
-- shifts, payroll, projects or payments. Its own file because Postgres can't use a
-- new enum value in the transaction that adds it.
alter type public.app_role add value if not exists 'setter';
