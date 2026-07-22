begin;
create extension if not exists pgtap with schema extensions;
select plan(15);
select set_config('ce.moderation_test_bypass','off',false);

insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values
  ('2b000000-0000-4000-8000-000000000001','moderation-fixture@alpha.invalid','test',now(),'{}','{}','authenticated','authenticated'),
  ('2b000000-0000-4000-8000-000000000002','moderation-other@alpha.invalid','test',now(),'{}','{}','authenticated','authenticated');
update public.profiles set status='active',onboarding_completed_at=now(),password_setup_required=false,verified_at=now(),verified_until=now()+interval '1 year',
  handle=case when id='2b000000-0000-4000-8000-000000000001' then 'moderation_fixture' else 'moderation_other' end,display_name='Moderation Fixture'
where id in ('2b000000-0000-4000-8000-000000000001','2b000000-0000-4000-8000-000000000002');

select ok((select relrowsecurity from pg_class where oid='public.content_moderation_checks'::regclass),'moderation checks have RLS');
select ok((select relrowsecurity from pg_class where oid='public.content_moderation_evidence'::regclass),'moderation evidence has RLS');
select ok(not has_table_privilege('authenticated','public.content_moderation_checks','SELECT'),'members cannot read provider decisions');
select ok(not has_table_privilege('authenticated','public.content_moderation_evidence','SELECT'),'members cannot read protected evidence');
select ok(not has_function_privilege('authenticated','public.record_content_moderation_check(uuid,uuid,text,text,text,text,text[],text,text,text,jsonb,uuid,uuid,boolean)','EXECUTE'),'members cannot mint clearances');
select hasnt_trigger('public','messages','messages_shared_text_moderation','private direct messages have no moderation trigger');
select hasnt_trigger('public','conversation_requests','conversation_requests_shared_text_moderation','private message requests have no moderation trigger');

select set_config('request.jwt.claim.sub','2b000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select throws_ok($$insert into public.listings(campus_id,seller_id,title,description,category,condition,price_cents,idempotency_key,visibility,exchange_methods,legacy_exchange_unspecified)
  values('00000000-0000-4000-8000-000000000001',auth.uid(),'Unchecked listing','This content has no clearance.','books','good',1000,'2b000000-0000-4000-8000-000000000011','campus_only',array['campus_pickup']::public.listing_exchange_method[],false)$$,'42501','moderation clearance required','unchecked shared text is rejected');

reset role;
insert into public.content_moderation_checks(actor_id,campus_id,surface,operation,content_hash,outcome,categories,provider,model,policy_version)
values('2b000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','listing','create',
  private.content_moderation_hash('listing','create',jsonb_build_object('title','Checked listing','description','This content has a valid clearance.')),
  'allow','{}','fixture','fixture-v1','ce-shared-text-2026-07-v1');
set local role authenticated;
select lives_ok($$insert into public.listings(id,campus_id,seller_id,title,description,category,condition,price_cents,idempotency_key,visibility,exchange_methods,legacy_exchange_unspecified)
  values('2b000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001',auth.uid(),'Checked listing','This content has a valid clearance.','books','good',1000,'2b000000-0000-4000-8000-000000000012','campus_only',array['campus_pickup']::public.listing_exchange_method[],false)$$,'matching clearance permits the authorized write');
reset role;
select ok((select consumed_at is not null from public.content_moderation_checks where actor_id='2b000000-0000-4000-8000-000000000001' and surface='listing'),'clearance is consumed atomically');
set local role authenticated;
select throws_ok($$insert into public.listings(campus_id,seller_id,title,description,category,condition,price_cents,idempotency_key,visibility,exchange_methods,legacy_exchange_unspecified)
  values('00000000-0000-4000-8000-000000000001',auth.uid(),'Checked listing','This content has a valid clearance.','books','good',1000,'2b000000-0000-4000-8000-000000000013','campus_only',array['campus_pickup']::public.listing_exchange_method[],false)$$,'42501','moderation clearance required','consumed clearance cannot be replayed');

reset role;
insert into public.content_moderation_checks(actor_id,campus_id,surface,operation,content_hash,outcome,categories,provider,model,policy_version)
values('2b000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','listing','create',private.content_moderation_hash('listing','create',jsonb_build_object('title','Blocked listing','description','This fixture represents blocked text.')),'block',array['targeted_abuse'],'fixture','fixture-v1','ce-shared-text-2026-07-v1');
set local role authenticated;
select throws_ok($$insert into public.listings(campus_id,seller_id,title,description,category,condition,price_cents,idempotency_key,visibility,exchange_methods,legacy_exchange_unspecified)
  values('00000000-0000-4000-8000-000000000001',auth.uid(),'Blocked listing','This fixture represents blocked text.','books','good',1000,'2b000000-0000-4000-8000-000000000014','campus_only',array['campus_pickup']::public.listing_exchange_method[],false)$$,'42501','moderation clearance required','blocked decisions never authorize publication');

reset role;
insert into public.content_moderation_checks(actor_id,campus_id,surface,operation,content_hash,outcome,categories,provider,model,policy_version,target_entity_id)
values('2b000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','listing','edit',private.content_moderation_hash('listing','edit',jsonb_build_object('title','Updated title')),'allow','{}','fixture','fixture-v1','ce-shared-text-2026-07-v1','2b000000-0000-4000-8000-000000000099');
set local role authenticated;
select throws_ok($$update public.listings set title='Updated title' where id='2b000000-0000-4000-8000-000000000020'$$,'42501','moderation clearance required','edit clearance is bound to its target');
reset role;
insert into public.content_moderation_checks(actor_id,campus_id,surface,operation,content_hash,outcome,categories,provider,model,policy_version,target_entity_id)
values('2b000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','listing','edit',private.content_moderation_hash('listing','edit',jsonb_build_object('title','Updated title')),'allow','{}','fixture','fixture-v1','ce-shared-text-2026-07-v1','2b000000-0000-4000-8000-000000000020');
set local role authenticated;
select lives_ok($$update public.listings set title='Updated title' where id='2b000000-0000-4000-8000-000000000020'$$,'valid target-bound edit is accepted');
select is((select title from public.listings where id='2b000000-0000-4000-8000-000000000020'),'Updated title','authorized edit persists');

select * from finish();
rollback;
