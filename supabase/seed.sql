insert into public.campuses (id, name, slug, timezone)
values ('00000000-0000-4000-8000-000000000001', 'Demo University', 'demo-university', 'America/Chicago')
on conflict do nothing;

-- Replace this domain before any real deployment.
insert into public.campus_email_domains (campus_id, domain)
values ('00000000-0000-4000-8000-000000000001', 'students.demo.edu')
on conflict do nothing;
