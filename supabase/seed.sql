insert into public.campuses (id, name, short_name, slug, timezone, status)
values ('00000000-0000-4000-8000-000000000001', 'Campus Alpha', 'Alpha', 'campus-alpha', 'America/Chicago', 'enabled')
on conflict do nothing;

-- Synthetic local/test fixture only. Production campuses are operator managed.
insert into public.campus_email_domains (campus_id, domain, is_enabled, review_status, domain_kind, source_label, reviewed_at)
values ('00000000-0000-4000-8000-000000000001', 'alpha.invalid', true, 'reviewed', 'student', 'Synthetic local fixture', now())
on conflict do nothing;

-- Deterministic local-only member used by authenticated Playwright coverage.
insert into auth.users(instance_id,id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role,confirmation_token,recovery_token,email_change_token_new,email_change,created_at,updated_at)
values (
  '00000000-0000-0000-0000-000000000000',
  'e9e00000-0000-4000-8000-000000000001',
  'playwright@alpha.invalid',
  crypt('CampusAlpha123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  'authenticated',
  'authenticated',
  '',
  '',
  '',
  '',
  now(),
  now()
)
on conflict (id) do update set instance_id=excluded.instance_id,encrypted_password=excluded.encrypted_password,email_confirmed_at=excluded.email_confirmed_at,raw_app_meta_data=excluded.raw_app_meta_data,updated_at=excluded.updated_at;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  'e9e00000-0000-4000-8000-000000000001',
  'e9e00000-0000-4000-8000-000000000001',
  '{"sub":"e9e00000-0000-4000-8000-000000000001","email":"playwright@alpha.invalid","email_verified":true}',
  'email',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do update set identity_data=excluded.identity_data, updated_at=excluded.updated_at;

insert into auth.users(instance_id,id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role,confirmation_token,recovery_token,email_change_token_new,email_change,created_at,updated_at)
values (
  '00000000-0000-0000-0000-000000000000',
  'e9e00000-0000-4000-8000-000000000002',
  'playwright-mobile@alpha.invalid',
  crypt('CampusAlpha123!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  'authenticated',
  'authenticated',
  '',
  '',
  '',
  '',
  now(),
  now()
)
on conflict (id) do update set instance_id=excluded.instance_id,encrypted_password=excluded.encrypted_password,email_confirmed_at=excluded.email_confirmed_at,raw_app_meta_data=excluded.raw_app_meta_data,updated_at=excluded.updated_at;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  'e9e00000-0000-4000-8000-000000000002',
  'e9e00000-0000-4000-8000-000000000002',
  '{"sub":"e9e00000-0000-4000-8000-000000000002","email":"playwright-mobile@alpha.invalid","email_verified":true}',
  'email',
  now(),
  now(),
  now()
)
on conflict (provider_id, provider) do update set identity_data=excluded.identity_data, updated_at=excluded.updated_at;

update public.profiles set
  handle='playwright_student',
  display_name='Alex Morgan',
  bio='Computer science student building useful tools for campus life.',
  academic_field='Computer Science',
  graduation_year=2028,
  graduation_year_visible=true,
  interests=array['Accessibility','Robotics','Campus events'],
  profile_visibility='network',
  status='active',
  onboarding_completed_at=now(),
  password_setup_required=false,
  verified_until=now()+interval '1 year'
where id='e9e00000-0000-4000-8000-000000000001';

update public.profiles set
  handle='playwright_mobile',
  display_name='Alex Morgan',
  bio='Computer science student building useful tools for campus life.',
  academic_field='Computer Science',
  graduation_year=2028,
  graduation_year_visible=true,
  interests=array['Accessibility','Robotics','Campus events'],
  profile_visibility='network',
  status='active',
  onboarding_completed_at=now(),
  password_setup_required=false,
  verified_until=now()+interval '1 year'
where id='e9e00000-0000-4000-8000-000000000002';

insert into public.social_posts(id,campus_id,author_profile_id,body,visibility,status,idempotency_key,created_at)
values (
  'a4000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'e9e00000-0000-4000-8000-000000000001',
  'Welcome to the Campus Alpha community feed. Share what is useful, timely, and kind.',
  'campus_only',
  'active',
  'a4000000-0000-4000-8000-000000000002',
  now()-interval '1 hour'
)
on conflict (id) do nothing;
