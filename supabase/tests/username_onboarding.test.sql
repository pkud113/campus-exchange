begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

update public.runtime_settings set value='true'::jsonb where key='universal_onboarding_enabled';
select set_config('ce.moderation_test_bypass','off',false);

insert into auth.users(
  id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role
) values
  ('d1000000-0000-4000-8000-000000000001','username.safe@msu.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('d1000000-0000-4000-8000-000000000002','username.reserved@msu.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('d1000000-0000-4000-8000-000000000003','username.profane@msu.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('d1000000-0000-4000-8000-000000000004','username.invalid@msu.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('d1000000-0000-4000-8000-000000000005','username.confusable@msu.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('d1000000-0000-4000-8000-000000000006','username.duplicate@msu.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('d1000000-0000-4000-8000-000000000007','username.fullwidth@msu.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('d1000000-0000-4000-8000-000000000008','username.grandfather@msu.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('d1000000-0000-4000-8000-000000000009','username.taken@msu.edu','test',now(),'{}','{}','authenticated','authenticated');

select set_config('ce.moderation_test_bypass','on',false);
update public.profiles
set handle=case id
    when 'd1000000-0000-4000-8000-000000000008' then '_legacy'
    when 'd1000000-0000-4000-8000-000000000009' then 'taken_student'
  end,
  display_name='Existing Student',
  status=case when id='d1000000-0000-4000-8000-000000000009' then 'active'::public.profile_status else status end,
  onboarding_completed_at=case when id='d1000000-0000-4000-8000-000000000009' then now() else null end,
  password_setup_required=case when id='d1000000-0000-4000-8000-000000000009' then false else true end
where id in (
  'd1000000-0000-4000-8000-000000000008',
  'd1000000-0000-4000-8000-000000000009'
);
select set_config('ce.moderation_test_bypass','off',false);

select has_function('public','complete_onboarding',array['text'],'trusted onboarding function remains available');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok(
  $$select public.complete_onboarding('ce_test_unavailable')$$,
  'safe onboarding succeeds without an automated moderation clearance'
);
reset role;
select is((select handle::text from public.profiles where id='d1000000-0000-4000-8000-000000000001'),'ce_test_unavailable','safe handle is canonical');
select is((select status::text from public.profiles where id='d1000000-0000-4000-8000-000000000001'),'active','safe onboarding activates the profile');
select ok((select onboarding_completed_at is not null and not password_setup_required from public.profiles where id='d1000000-0000-4000-8000-000000000001'),'safe onboarding completes password setup');
select is((select count(*)::integer from public.role_assignments where profile_id='d1000000-0000-4000-8000-000000000001' and role='student'),1,'existing campus student role remains provisioned');
select is(
  (select c.slug::text from public.profiles p join public.campuses c on c.id=p.campus_id where p.id='d1000000-0000-4000-8000-000000000001'),
  'michigan-state-university',
  'existing MSU onboarding retains the correct campus'
);
select is(
  (select metadata->>'usernamePolicy' from public.audit_log where actor_id='d1000000-0000-4000-8000-000000000001' and action='account.onboarding_completed' order by created_at desc limit 1),
  'ce-username-2026-07-v1',
  'onboarding audit records the deterministic policy'
);

set local role authenticated;
select throws_ok(
  $$update public.profiles set display_name='Unchecked profile text' where id='d1000000-0000-4000-8000-000000000001'$$,
  '42501','moderation clearance required',
  'the onboarding exception cannot authorize later profile text'
);
select throws_ok(
  $$select public.complete_onboarding('ce_test_unavailable')$$,
  '23514','onboarding already complete',
  'the immutable onboarding transition cannot be replayed'
);
reset role;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.complete_onboarding('admin')$$,'22023','username rejected: reserved','reserved usernames are rejected');
reset role;
select is((select handle::text from public.profiles where id='d1000000-0000-4000-8000-000000000002'),null,'reserved rejection leaves the pending profile unchanged');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select public.complete_onboarding('f_u_c_k_you')$$,'22023','username rejected: profanity','profane username obfuscation is rejected');
reset role;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok($$select public.complete_onboarding('bad-name')$$,'22023','username rejected: unicode_confusable','invalid username characters are rejected');
reset role;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select throws_ok($$select public.complete_onboarding('аdmin')$$,'22023','username rejected: unicode_confusable','mixed-script confusable username is rejected');
reset role;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000006',true);
set local role authenticated;
select throws_ok($$select public.complete_onboarding('taken_student')$$,'23505','username already taken','duplicate username is rejected by the trusted function');
reset role;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000007',true);
set local role authenticated;
select lives_ok($$select public.complete_onboarding('Ｆｒｉｅｎｄ２０２６')$$,'NFKC-compatible full-width username is accepted deterministically');
reset role;
select is((select handle::text from public.profiles where id='d1000000-0000-4000-8000-000000000007'),'friend2026','full-width input is stored in canonical ASCII form');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000008',true);
set local role authenticated;
select lives_ok($$select public.complete_onboarding('_legacy')$$,'an existing pre-policy username can finish password setup');
reset role;
select is((select handle::text from public.profiles where id='d1000000-0000-4000-8000-000000000008'),'_legacy','existing username is preserved exactly');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok(
  $$insert into public.listings(
      campus_id,seller_id,title,description,category,condition,price_cents,
      idempotency_key,visibility,exchange_methods,legacy_exchange_unspecified
    )
    select campus_id,id,'Unchecked listing','Unchecked shared content','books','good',1000,
      'd2000000-0000-4000-8000-000000000001','campus_only',
      array['campus_pickup']::public.listing_exchange_method[],false
    from public.profiles where id='d1000000-0000-4000-8000-000000000001'$$,
  '42501','moderation clearance required',
  'shared content remains fail-closed without moderation'
);
reset role;

select ok(has_function_privilege('authenticated','public.complete_onboarding(text)','EXECUTE'),'authenticated students can call trusted onboarding');
select ok(not has_function_privilege('authenticated','private.onboarding_username_safety_reason(text)','EXECUTE'),'clients cannot call the private safety primitive');
select ok(not has_function_privilege('authenticated','private.enforce_profile_text_moderation()','EXECUTE'),'clients cannot call the trusted trigger directly');
select is((select count(*)::integer from public.profiles where id::text like 'd1000000-%'),9,'username policy tests preserve all account profiles');

select * from finish();
rollback;
