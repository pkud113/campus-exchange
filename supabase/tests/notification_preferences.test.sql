begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok((select relrowsecurity from pg_class where oid='public.notification_preferences'::regclass),'notification preferences have RLS');
select is(has_table_privilege('anon','public.notification_preferences','SELECT'),false,'anonymous users cannot read preferences');
select is(has_table_privilege('authenticated','public.notification_preferences','SELECT'),true,'authenticated users can read through RLS');
select is(has_table_privilege('authenticated','public.notification_preferences','DELETE'),false,'users cannot delete preference records');
select is(has_table_privilege('service_role','public.notification_preferences','INSERT'),true,'worker service can inspect preferences');

insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role)
values('f1000000-0000-4000-8000-000000000001','preferences@msu.edu','test',now(),'{}','{}','authenticated','authenticated');
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$insert into public.notification_preferences(profile_id,email_messages,email_discussions,quiet_hours_start,quiet_hours_end) values(auth.uid(),false,true,22,7)$$,'member can create only their preferences');
select is((select email_messages from public.notification_preferences where profile_id=auth.uid()),false,'member reads their email opt-out');
select lives_ok($$update public.notification_preferences set email_discussions=false where profile_id=auth.uid()$$,'member can update their preferences');
select throws_ok($$insert into public.notification_preferences(profile_id) values('f1000000-0000-4000-8000-000000000002')$$,'42501','new row violates row-level security policy for table "notification_preferences"','member cannot create another user preferences');
select throws_ok($$update public.notification_preferences set quiet_hours_start=8,quiet_hours_end=8 where profile_id=auth.uid()$$,'23514',null,'equal quiet-hour bounds are rejected');
reset role;
select is((select email_discussions from public.notification_preferences where profile_id='f1000000-0000-4000-8000-000000000001'),false,'saved preference is durable');
select ok((select updated_at>=created_at from public.notification_preferences where profile_id='f1000000-0000-4000-8000-000000000001'),'preference updates are timestamped');

select * from finish();
rollback;
