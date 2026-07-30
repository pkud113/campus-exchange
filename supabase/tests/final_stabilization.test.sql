begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select throws_ok(
  $$select private.registration_assignment_basis('ipeds:170976','unreviewed.example')$$,
  '42501','institution domain review required',
  'an arbitrary selected institution cannot turn an unknown domain into enrollment evidence'
);
select is(
  private.registration_assignment_basis('ipeds:171137','umich.edu')::text,
  'shared_selected',
  'a reviewed shared-domain pairing preserves the selected U-M institution'
);

select throws_ok(
  $$update public.campuses set timezone='Not/A_Real_Zone' where id='00000000-0000-4000-8000-000000000001'$$,
  '22023','invalid IANA timezone',
  'invalid campus timezones fail at the database boundary'
);
select is(
  (select timezone from public.campuses where id='00000000-0000-4000-8000-000000000001'),
  'America/Chicago',
  'a rejected timezone update leaves the prior timezone intact'
);

select set_config('ce.moderation_test_bypass','on',true);
insert into public.listings(
  id,campus_id,seller_id,title,description,category,condition,price_cents,
  status,idempotency_key,visibility,exchange_methods,legacy_exchange_unspecified
) values(
  'f1000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'e9e00000-0000-4000-8000-000000000001',
  'Atomic transition fixture','A listing used for final stabilization coverage.',
  'books','good',1500,'active',
  'f1000000-0000-4000-8000-000000000002','campus_only',
  array['campus_pickup']::public.listing_exchange_method[],false
);
select set_config('request.jwt.claim.sub','e9e00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e9e00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select lives_ok(
  $$select public.transition_listing(
    'f1000000-0000-4000-8000-000000000001','active','reserved',
    'e9e00000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000003'
  )$$,
  'the seller can atomically reserve an active listing'
);
select is(
  (select status::text from public.listings where id='f1000000-0000-4000-8000-000000000001'),
  'reserved',
  'the atomic listing transition persists its result'
);
select lives_ok(
  $$select public.transition_listing(
    'f1000000-0000-4000-8000-000000000001','active','reserved',
    'e9e00000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000003'
  )$$,
  'replaying the same listing transition key is idempotent'
);
reset role;
select is(
  (select count(*)::integer from public.audit_log
   where action='listing.status_changed'
     and target_id='f1000000-0000-4000-8000-000000000001'),
  1,
  'an idempotent replay does not duplicate the listing audit event'
);
set local role authenticated;
select throws_ok(
  $$select public.transition_listing(
    'f1000000-0000-4000-8000-000000000001','active','sold',
    'e9e00000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000004'
  )$$,
  '40001','stale listing state',
  'a stale listing transition fails instead of overwriting concurrent state'
);
reset role;

insert into public.conversations(id,campus_id,created_by) values
  ('f2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','e9e00000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','e9e00000-0000-4000-8000-000000000001');
select lives_ok($$
  insert into public.messages(campus_id,conversation_id,sender_id,body,idempotency_key) values
    ('00000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','e9e00000-0000-4000-8000-000000000001','First conversation','f2000000-0000-4000-8000-000000000003'),
    ('00000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002','e9e00000-0000-4000-8000-000000000001','Second conversation','f2000000-0000-4000-8000-000000000003')
$$,'the same sender request key is valid in two different conversations');
select is(
  (select count(*)::integer from public.messages where idempotency_key='f2000000-0000-4000-8000-000000000003'),
  2,
  'message idempotency is scoped by conversation'
);

insert into public.role_assignments(profile_id,campus_id,role)
values('e9e00000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','moderator')
on conflict(profile_id,role) do nothing;
select set_config('request.jwt.claim.sub','e9e00000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"e9e00000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
set local role authenticated;
select ok(
  (select count(*) from public.admin_user_directory('',null,null,50))>0,
  'a campus moderator can load the scope-safe user projection at AAL2'
);
select is(
  (select count(distinct campus_id)::integer from public.admin_user_directory('',null,null,50)),
  1,
  'the user projection cannot escape the campus moderator scope'
);
select ok(
  pg_get_function_result(
    'public.admin_user_directory(text,timestamptz,uuid,integer)'::regprocedure
  ) not ilike '%email%',
  'the scope-safe user projection cannot expose authentication email fields'
);
reset role;

select ok(
  (select relrowsecurity from pg_class where oid='public.listing_transition_requests'::regclass),
  'listing transition idempotency records have RLS'
);
select ok(
  exists(select 1 from pg_indexes where schemaname='public' and indexname='content_moderation_checks_exact_unconsumed_idx'),
  'moderation clearance deduplication uses the exact active-check index'
);
select ok(
  exists(select 1 from pg_indexes where schemaname='public' and indexname='messages_conversation_sender_idempotency_idx'),
  'message idempotency has the conversation-scoped unique index'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.institution_domain_pairings'::regclass),
  'reviewed institution-domain pairings are protected by RLS'
);

select * from finish();
rollback;
