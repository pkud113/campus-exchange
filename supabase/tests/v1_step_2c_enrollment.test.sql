begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

update public.runtime_settings set value='true'::jsonb where key='universal_onboarding_enabled';

select throws_ok($$
  insert into auth.users(
    id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role
  ) values(
    'c1000000-0000-4000-8000-000000000098','rollout.invalid@msu.edu','test',now(),'{}',
    jsonb_build_object('registrationGrantId','c2000000-0000-4000-8000-000000000098'),
    'authenticated','authenticated'
  )
$$,'28000','invalid universal enrollment grant','invalid universal grant metadata cannot fall through to reviewed-domain provisioning');

select lives_ok($$
  insert into auth.users(
    id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role
  ) values(
    'c1000000-0000-4000-8000-000000000099','rollout.legacy@msu.edu','test',now(),'{}','{}',
    'authenticated','authenticated'
  )
$$,'reviewed-domain registration without universal grant metadata remains rollback-compatible');
select is(
  (select count(*)::integer from public.profiles where id='c1000000-0000-4000-8000-000000000099'),
  1,
  'legacy reviewed-domain compatibility still provisions the existing campus'
);

set local role service_role;
select lives_ok($$
  select * from public.create_registration_enrollment_grant(
    'ipeds:100654',
    encode(extensions.digest('step2c.student@aamu.edu','sha256'),'hex'),
    'aamu.edu',
    repeat('a',64)
  )
$$,'an active non-launch institution can mint a one-time enrollment grant');
reset role;
update public.registration_enrollment_grants
set id='c2000000-0000-4000-8000-000000000010'
where email_hash=encode(extensions.digest('step2c.student@aamu.edu','sha256'),'hex');

select is(
  (select assignment_basis::text from public.registration_enrollment_grants where email_hash=encode(extensions.digest('step2c.student@aamu.edu','sha256'),'hex')),
  'website_matched',
  'website-matched enrollment confidence is retained'
);

select lives_ok($$
  insert into auth.users(
    id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role
  ) values(
    'c1000000-0000-4000-8000-000000000001','step2c.student@aamu.edu','test',now(),'{}',
    jsonb_build_object('registrationGrantId','c2000000-0000-4000-8000-000000000010'),
    'authenticated','authenticated'
  )
$$,'OTP Auth creation binds only the opaque grant id');
select is((select count(*)::integer from public.profiles where id='c1000000-0000-4000-8000-000000000001'),0,'Auth creation does not provision a campus or profile before verification completion');

select set_config('request.jwt.claim.sub','c1000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"c1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$
  select * from public.complete_registration_enrollment('c2000000-0000-4000-8000-000000000010')
$$,'confirmed Auth email atomically consumes the matching grant');
reset role;

select isnt((select campus_id from public.institution_directory where id='ipeds:100654'),null,'lazy verification provisions and links one campus');
select is((select c.status::text from public.campuses c join public.institution_directory i on i.campus_id=c.id where i.id='ipeds:100654'),'enabled','lazy-provisioned campus is enabled');
select is((select c.timezone_source from public.campuses c join public.institution_directory i on i.campus_id=c.id where i.id='ipeds:100654'),'region_default','lazy campus records regional timezone provenance');
select is((select p.campus_id from public.profiles p where p.id='c1000000-0000-4000-8000-000000000001'),(select campus_id from public.institution_directory where id='ipeds:100654'),'profile receives the exact selected institution campus');
select is((select count(*)::integer from public.campus_membership_verifications where profile_id='c1000000-0000-4000-8000-000000000001' and institution_id='ipeds:100654' and revoked_at is null),1,'protected membership verification history is recorded');

set local role authenticated;
select throws_ok($$
  select * from public.complete_registration_enrollment('c2000000-0000-4000-8000-000000000010')
$$,'42501','invalid or expired enrollment grant','a consumed grant cannot be replayed');
reset role;

select is((select count(*)::integer from public.role_assignments where profile_id='c1000000-0000-4000-8000-000000000001' and role='student'),1,'completion assigns exactly one student role');
select is((select count(*)::integer from public.audit_log where actor_id='c1000000-0000-4000-8000-000000000001' and action='membership.verified'),1,'completion records a protected audit event');

set local role service_role;
select throws_ok($$
  select * from public.create_registration_enrollment_grant('ipeds:100654',repeat('b',64),'gmail.com',repeat('c',64))
$$,'42501','consumer or disposable email domain denied','consumer domains are denied before OTP');
reset role;

update public.institution_directory set registration_status='suspended' where id='ipeds:100663';
set local role service_role;
select throws_ok($$
  select * from public.create_registration_enrollment_grant('ipeds:100663',repeat('d',64),'ua.edu',repeat('e',64))
$$,'42501','institution registration unavailable','suspended institutions cannot mint grants');
reset role;

insert into public.registration_enrollment_grants(
  id,institution_id,email_domain,email_hash,requester_hash,assignment_basis,auth_user_id,
  created_at,expires_at
) values(
  'c2000000-0000-4000-8000-000000000001','ipeds:100654','aamu.edu',
  encode(extensions.digest('step2c.student@aamu.edu','sha256'),'hex'),repeat('f',64),
  'explicit_selected','c1000000-0000-4000-8000-000000000001',now()-interval '30 minutes',now()-interval '10 minutes'
);
set local role authenticated;
select throws_ok(
  $$select * from public.complete_registration_enrollment('c2000000-0000-4000-8000-000000000001')$$,
  '42501','invalid or expired enrollment grant','expired grants fail closed'
);
reset role;

insert into public.registration_enrollment_grants(
  id,institution_id,email_domain,email_hash,requester_hash,assignment_basis,auth_user_id,expires_at
) values(
  'c2000000-0000-4000-8000-000000000002','ipeds:100654','aamu.edu',
  repeat('0',64),repeat('1',64),'explicit_selected','c1000000-0000-4000-8000-000000000001',now()+interval '10 minutes'
);
set local role authenticated;
select throws_ok(
  $$select * from public.complete_registration_enrollment('c2000000-0000-4000-8000-000000000002')$$,
  '42501','invalid or expired enrollment grant','a forged email-hash grant fails closed'
);
reset role;

set local role service_role;
select lives_ok($$select * from public.create_registration_enrollment_grant('ipeds:170976',repeat('2',64),'umich.edu',repeat('3',64))$$,'Ann Arbor accepts explicitly selected shared-domain verification');
select lives_ok($$select * from public.create_registration_enrollment_grant('ipeds:171137',repeat('4',64),'umich.edu',repeat('5',64))$$,'Dearborn accepts explicitly selected shared-domain verification');
select lives_ok($$select * from public.create_registration_enrollment_grant('ipeds:171146',repeat('6',64),'umich.edu',repeat('7',64))$$,'Flint accepts explicitly selected shared-domain verification');
reset role;
select is((select count(*)::integer from public.registration_enrollment_grants where email_hash in (repeat('2',64),repeat('4',64),repeat('6',64)) and assignment_basis='shared_selected'),3,'all Michigan grants retain shared-selected confidence');
select is((select count(distinct institution_id)::integer from public.registration_enrollment_grants where email_hash in (repeat('2',64),repeat('4',64),repeat('6',64))),3,'the exact selected Michigan institution remains distinct');
select is((select count(*)::integer from public.campuses where provisioned_from_institution_id='ipeds:100654'),1,'lazy provisioning is collision-safe through one institution-linked campus');

select * from finish();
rollback;
