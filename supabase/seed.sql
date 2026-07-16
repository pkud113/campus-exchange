insert into public.campuses (id, name, short_name, slug, timezone, status)
values ('00000000-0000-4000-8000-000000000001', 'Campus Alpha', 'Alpha', 'campus-alpha', 'America/Chicago', 'enabled')
on conflict do nothing;

-- Synthetic local/test fixture only. Production campuses are operator managed.
insert into public.campus_email_domains (campus_id, domain, is_enabled)
values ('00000000-0000-4000-8000-000000000001', 'alpha.invalid', true)
on conflict do nothing;
