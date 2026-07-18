begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

select is((select count(*)::integer from public.campuses where status='enabled' and slug in (
  'michigan-state-university','university-of-illinois-urbana-champaign','university-of-wisconsin-madison','university-of-chicago',
  'northwestern-university','university-of-notre-dame','stanford-university','university-of-california-berkeley','yale-university',
  'princeton-university','duke-university','vanderbilt-university','rice-university','georgia-institute-of-technology',
  'university-of-texas-at-austin','texas-a-and-m-university','dartmouth-college'
)),17,'launch directory contains 17 reviewed enabled colleges');
select is((select count(*)::integer from public.campus_email_domains where is_enabled and domain::text not like '%.invalid' and source_url is null),0,'every enabled real launch mapping has source provenance');
select is((select count(*)::integer from public.campus_email_domains where is_enabled and (review_status<>'reviewed' or domain_kind not in ('student','institutional'))),0,'every enabled mapping is reviewed and qualifying');
select is((select resolution from private.resolve_registration_domain('msu.edu')),'eligible','existing MSU domain remains eligible');
select is((select resolution from private.resolve_registration_domain('illinois.edu')),'eligible','Illinois domain is eligible');
select is((select resolution from private.resolve_registration_domain('u.northwestern.edu')),'eligible','Northwestern student subdomain is eligible');
select is((select resolution from private.resolve_registration_domain('my.utexas.edu')),'eligible','UT Austin student subdomain is eligible');
select is((select resolution from private.resolve_registration_domain('email.tamu.edu')),'eligible','Texas A&M student mailbox domain is eligible');
select is((select resolution from private.resolve_registration_domain('unknown-school.example')),'unsupported','unknown domain fails closed');
select is((select resolution from private.resolve_registration_domain('purdue.edu')),'ambiguous','shared Purdue domain is ambiguous');
select is((select resolution from private.resolve_registration_domain('umich.edu')),'ambiguous','shared Michigan domain is ambiguous');
select is((select resolution from private.resolve_registration_domain('aya.yale.edu')),'alumni','alumni-only domain is rejected explicitly');

insert into public.campuses(id,name,short_name,slug,timezone,status) values
  ('d0000000-0000-4000-8000-000000000001','Directory Disabled','Disabled','directory-disabled','America/Chicago','disabled'),
  ('d0000000-0000-4000-8000-000000000002','Directory Review','Review','directory-review','America/Chicago','enabled');
insert into public.campus_email_domains(campus_id,domain,is_enabled,review_status,domain_kind,source_url,reviewed_at) values
  ('d0000000-0000-4000-8000-000000000002','pending.test',false,'unreviewed','other',null,null),
  ('d0000000-0000-4000-8000-000000000002','disabled.test',false,'reviewed','student','https://example.invalid/official-review',now()),
  ('d0000000-0000-4000-8000-000000000001','campus-disabled.test',true,'reviewed','student','https://example.invalid/official-review',now()),
  ((select id from public.campuses where slug='michigan-state-university'),'students.msu.test',true,'reviewed','student','https://example.invalid/official-review',now());

select is((select resolution from private.resolve_registration_domain('pending.test')),'review_required','unreviewed domain never assigns a campus');
select is((select resolution from private.resolve_registration_domain('disabled.test')),'domain_disabled','disabled reviewed domain is rejected');
select is((select resolution from private.resolve_registration_domain('campus-disabled.test')),'campus_disabled','disabled campus is rejected');
select is((select campus_id from private.resolve_registration_domain('students.msu.test')),(select id from public.campuses where slug='michigan-state-university'),'multiple reviewed domains can map to one campus');
select ok(exists(select 1 from pg_indexes where schemaname='public' and indexname='campus_email_domains_one_active_mapping_idx' and indexdef ilike 'create unique index%'),'active exact domains have one-campus uniqueness');
select ok(exists(select 1 from pg_constraint where conname='campus_email_domains_activation_check' and convalidated),'domain activation constraint is validated');
select is(has_function_privilege('authenticated','public.registration_domain_resolution(text)','EXECUTE'),false,'browser-authenticated users cannot call the registration resolver');
select is(has_function_privilege('service_role','public.registration_domain_resolution(text)','EXECUTE'),true,'service role can call the registration resolver');
select is(has_table_privilege('anon','public.school_requests','SELECT'),false,'anonymous clients cannot read school requests');
select is(has_table_privilege('authenticated','public.school_requests','SELECT'),false,'authenticated clients cannot read school requests');
select ok((select relrowsecurity from pg_class where oid='public.school_requests'::regclass),'school requests have RLS');
select ok((select relrowsecurity from pg_class where oid='public.directory_operator_audit'::regclass),'directory operator audit has RLS');

select lives_ok($$select public.submit_school_request('  Example   State University  ','students.example.edu')$$,'unknown school request is stored through the service-only function');
select is((select school_name from public.school_requests where email_domain='students.example.edu'),'Example State University','school request name is safely normalized');
select is((select email_domain::text from public.school_requests where school_name_key='example state university'),'students.example.edu','school request stores only the normalized domain');
select lives_ok($$select public.submit_school_request('Example State University','students.example.edu')$$,'duplicate demand is aggregated idempotently');
select is((select request_count from public.school_requests where email_domain='students.example.edu'),2,'duplicate request increments demand count');
select is((select status::text from public.school_requests where email_domain='students.example.edu'),'pending','duplicate submission does not bypass operator review');
select hasnt_column('public','school_requests','email','school request table does not retain the full requester email');

select lives_ok($$insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('d1000000-0000-4000-8000-000000000001','directory.student@msu.edu','test',now(),'{}','{}','authenticated','authenticated')$$,'MSU registration provisions successfully');
select is((select campus_id from public.profiles where id='d1000000-0000-4000-8000-000000000001'),(select id from public.campuses where slug='michigan-state-university'),'MSU registration assigns the MSU campus server-side');
select lives_ok($$insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('d1000000-0000-4000-8000-000000000002','directory.student@illinois.edu','test',now(),'{}','{}','authenticated','authenticated')$$,'another reviewed college registers successfully');
select is((select campus_id from public.profiles where id='d1000000-0000-4000-8000-000000000002'),(select id from public.campuses where slug='university-of-illinois-urbana-champaign'),'Illinois registration assigns the correct campus');
select throws_ok($$insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('d1000000-0000-4000-8000-000000000003','student@unknown-school.example','test',now(),'{}','{}','authenticated','authenticated')$$,'28000','school email domain is not eligible','unknown domain cannot create an account');
select is((select count(*)::integer from public.profiles where id='d1000000-0000-4000-8000-000000000003'),0,'unknown-domain failure creates no profile');
select lives_ok($$insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('d1000000-0000-4000-8000-000000000004','metadata.attack@msu.edu','test',now(),'{}','{"campus_id":"d0000000-0000-4000-8000-000000000002"}','authenticated','authenticated')$$,'client metadata cannot prevent legitimate server-side assignment');
select is((select campus_id from public.profiles where id='d1000000-0000-4000-8000-000000000004'),(select id from public.campuses where slug='michigan-state-university'),'client-supplied campus metadata is ignored');
select throws_ok($$insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('d1000000-0000-4000-8000-000000000005','student@purdue.edu','test',now(),'{}','{}','authenticated','authenticated')$$,'28000','school email domain is not eligible','ambiguous domain cannot create an account');
select throws_ok($$insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('d1000000-0000-4000-8000-000000000006','graduate@aya.yale.edu','test',now(),'{}','{}','authenticated','authenticated')$$,'28000','school email domain is not eligible','alumni domain cannot create an account');
select throws_ok($$insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('d1000000-0000-4000-8000-000000000007','student@disabled.test','test',now(),'{}','{}','authenticated','authenticated')$$,'28000','school email domain is not eligible','disabled domain cannot create an account');
select throws_ok($$insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values('d1000000-0000-4000-8000-000000000008','student@campus-disabled.test','test',now(),'{}','{}','authenticated','authenticated')$$,'28000','school email domain is not eligible','disabled campus cannot create an account');
select is((select ra.campus_id from public.role_assignments ra where ra.profile_id='d1000000-0000-4000-8000-000000000001'),(select p.campus_id from public.profiles p where p.id='d1000000-0000-4000-8000-000000000001'),'registration role assignment matches the derived profile campus');

select * from finish();
rollback;
