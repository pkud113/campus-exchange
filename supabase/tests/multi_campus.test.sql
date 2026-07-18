begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

insert into public.campuses(id,name,short_name,slug,timezone,status) values
 ('00000000-0000-4000-8000-000000000001','Campus Alpha','Alpha','campus-alpha','America/Chicago','enabled'),
 ('b0000000-0000-4000-8000-000000000001','Campus Beta','Beta','campus-beta','America/New_York','enabled'),
 ('c0000000-0000-4000-8000-000000000001','Campus Inactive','Inactive','campus-inactive','America/Denver','enabled')
on conflict do nothing;
insert into public.campus_email_domains(campus_id,domain,is_enabled,review_status,domain_kind,source_label,reviewed_at) values
 ('00000000-0000-4000-8000-000000000001','alpha.invalid',true,'reviewed','student','Synthetic pgTAP fixture',now()),
 ('b0000000-0000-4000-8000-000000000001','beta.invalid',true,'reviewed','student','Synthetic pgTAP fixture',now()),
 ('c0000000-0000-4000-8000-000000000001','inactive.invalid',true,'reviewed','student','Synthetic pgTAP fixture',now()) on conflict do nothing;
insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values
 ('a1000000-0000-4000-8000-000000000001','owner@alpha.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('a1000000-0000-4000-8000-000000000002','member@alpha.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('b1000000-0000-4000-8000-000000000001','owner@beta.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('c1000000-0000-4000-8000-000000000001','inactive@inactive.invalid','test',now(),'{}','{}','authenticated','authenticated');
update public.profiles set status='active',onboarding_completed_at=now(),password_setup_required=false,verified_until=now()+interval '1 year',handle=case id
 when 'a1000000-0000-4000-8000-000000000001' then 'alpha_owner' when 'a1000000-0000-4000-8000-000000000002' then 'alpha_member'
 when 'b1000000-0000-4000-8000-000000000001' then 'beta_owner' else 'inactive_member' end where id::text like '_1000000-%';
update public.campuses set status='disabled' where id='c0000000-0000-4000-8000-000000000001';
update public.campus_email_domains set is_enabled=false where campus_id='c0000000-0000-4000-8000-000000000001';
insert into public.listings(id,campus_id,seller_id,title,description,category,condition,price_cents,status,idempotency_key,visibility,exchange_methods,legacy_exchange_unspecified) values
 ('a2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','Alpha local listing','Campus Alpha local listing','books','good',1000,'active','a3000000-0000-4000-8000-000000000001','campus_only',array['campus_pickup']::public.listing_exchange_method[],false),
 ('b2000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Beta network listing','Campus Beta network listing','books','good',1200,'active','b3000000-0000-4000-8000-000000000001','network',array['shipping']::public.listing_exchange_method[],false),
 ('b2000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Beta local listing','Campus Beta local listing','books','good',1300,'active','b3000000-0000-4000-8000-000000000002','campus_only',array['campus_pickup']::public.listing_exchange_method[],false);
insert into public.events(id,campus_id,organizer_id,title,description,location,starts_at,ends_at,idempotency_key,visibility) values
 ('b4000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Beta network event','A network event for tests','Beta Hall',now()+interval '2 days',now()+interval '2 days 1 hour','b5000000-0000-4000-8000-000000000001','network'),
 ('b4000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Beta local event','A local event for tests','Beta Hall',now()+interval '3 days',now()+interval '3 days 1 hour','b5000000-0000-4000-8000-000000000002','campus_only');
insert into public.media_uploads(id,campus_id,uploader_id,listing_id,object_key,content_type,byte_size,status,purpose,alt_text) values
 ('b7000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','tests/beta-network','image/png',128,'ready','listing','Beta network image');

select ok((select relrowsecurity from pg_class where oid='public.platform_role_assignments'::regclass),'platform role table has RLS');
select ok(exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='conversation_realtime_read'),'private conversation Realtime policy remains installed');
select ok(exists(select 1 from pg_policies where schemaname='realtime' and tablename='messages' and policyname='notification_realtime_read'),'private notification Realtime policy remains installed');
select is((select status::text from public.campuses where slug='campus-inactive'),'disabled','new inactive campus remains disabled');
select is((select is_enabled from public.campus_email_domains where domain='inactive.invalid'),false,'inactive domain remains disabled');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);set local role authenticated;
select is((select count(*)::integer from public.listings),2,'viewer sees local and foreign network listing only');
select is((select count(*)::integer from public.listings where id='b2000000-0000-4000-8000-000000000002'),0,'foreign campus-only listing hidden by id');
select is((select count(*)::integer from public.events),1,'foreign network event visible');
select throws_ok($$select public.rsvp_to_event('b4000000-0000-4000-8000-000000000002')$$,'P0002','event unavailable','foreign campus-only RSVP rejected');
select lives_ok($$select public.rsvp_to_event('b4000000-0000-4000-8000-000000000001')$$,'foreign network RSVP accepted');
select is((select campus_id from public.event_rsvps where event_id='b4000000-0000-4000-8000-000000000001' and profile_id=auth.uid()),'00000000-0000-4000-8000-000000000001'::uuid,'RSVP stores attendee campus');
select is((select count(*)::integer from public.search_member_directory('beta',null,20)),1,'global directory returns eligible foreign member');
select is((select count(*)::integer from public.search_member_directory('inactive',null,20)),0,'directory excludes inactive campus');
select lives_ok($$select public.submit_report('listing','b2000000-0000-4000-8000-000000000001','unsafe','Cross-campus report','a8000000-0000-4000-8000-000000000001')$$,'network listing can be reported');
select is((select campus_id from public.reports where idempotency_key='a8000000-0000-4000-8000-000000000001'),'b0000000-0000-4000-8000-000000000001'::uuid,'network report routes to creator campus');
select is((select platform_visible from public.reports where idempotency_key='a8000000-0000-4000-8000-000000000001'),true,'network report is eligible for platform escalation');
reset role;
insert into public.role_assignments(profile_id,campus_id,role) values('a1000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','moderator');
insert into public.platform_role_assignments(profile_id,role) values('b1000000-0000-4000-8000-000000000001','admin');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000001","aal":"aal2"}',true);set local role authenticated;
select is((select count(*)::integer from public.moderation_report_queue()),0,'campus moderator cannot read another campus network report');
reset role;select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","aal":"aal1"}',true);set local role authenticated;
select throws_ok($$select * from public.moderation_report_queue()$$,'42501','MFA-protected moderator access required','platform moderation requires AAL2');
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","aal":"aal2"}',true);
select is((select count(*)::integer from public.moderation_report_queue()),1,'platform moderator receives eligible network report');
select lives_ok($$select public.moderate_report((select id from public.reports where idempotency_key='a8000000-0000-4000-8000-000000000001'),'dismiss','No policy violation')$$,'platform report action succeeds at AAL2');
select is((select metadata->>'scope' from public.audit_log where action='moderation.dismiss' and target_id='b2000000-0000-4000-8000-000000000001'),'platform','audit records platform scope without report content');
reset role;
select is((select count(*)::integer from public.outbox_events where event_type='moderation.report_resolved' and aggregate_id=(select id from public.reports where idempotency_key='a8000000-0000-4000-8000-000000000001')),1,'moderation outcome notification is idempotently enqueued');
select set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000002',true);select set_config('request.jwt.claims','{"sub":"a1000000-0000-4000-8000-000000000002","aal":"aal1"}',true);set local role authenticated;
select lives_ok($$select public.create_conversation_request('b1000000-0000-4000-8000-000000000001','Hello from Campus Alpha','a6000000-0000-4000-8000-000000000001','direct',null)$$,'cross-campus opening request created');
select throws_ok($$select public.create_conversation_request('b1000000-0000-4000-8000-000000000001','A second pending request','a6000000-0000-4000-8000-000000000002','direct',null)$$,'23505','a pending request already exists','pending pair is unique');
select is((select requester_campus_id from public.conversation_requests where idempotency_key='a6000000-0000-4000-8000-000000000001'),'00000000-0000-4000-8000-000000000001'::uuid,'requester campus is server derived');
select is((select recipient_campus_id from public.conversation_requests where idempotency_key='a6000000-0000-4000-8000-000000000001'),'b0000000-0000-4000-8000-000000000001'::uuid,'recipient campus is server derived');
select throws_ok($$select public.create_conversation_request(auth.uid(),'Message to myself','a6000000-0000-4000-8000-000000000003','direct',null)$$,'23514','cannot request yourself','self request rejected');
reset role;select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);set local role authenticated;
select lives_ok($$select public.respond_to_conversation_request((select id from public.conversation_requests where idempotency_key='a6000000-0000-4000-8000-000000000001'),'accepted')$$,'acceptance is atomic');
select is((select count(*)::integer from public.messages where request_id=(select id from public.conversation_requests where idempotency_key='a6000000-0000-4000-8000-000000000001')),1,'opening inserted exactly once');
select is((select count(distinct campus_id)::integer from public.conversation_participants where conversation_id=(select id from public.conversations where request_id is not null)),2,'participants retain actual campuses');
select throws_ok($$update public.events set visibility='campus_only' where id='b4000000-0000-4000-8000-000000000001'$$,'23514','resolve cross-campus RSVPs before making this event campus-only','event narrowing protects commitments');
select lives_ok($$select public.set_profile_block('a1000000-0000-4000-8000-000000000002',true)$$,'global block succeeds');
select is((select public.is_conversation_unblocked((select id from public.conversations where request_id is not null))),false,'blocked conversation is read only');
select throws_ok($$insert into public.messages(campus_id,conversation_id,sender_id,body,idempotency_key) values('b0000000-0000-4000-8000-000000000001',(select id from public.conversations where request_id is not null),auth.uid(),'Blocked follow up','b6000000-0000-4000-8000-000000000001')$$,'42501','new row violates row-level security policy for table "messages"','blocked message insertion denied');
select is((select count(*)::integer from public.discussion_communities),0,'campus-private Discussions remain isolated and empty');
select is((select count(*)::integer from public.safe_listing_media(array['b2000000-0000-4000-8000-000000000001']::uuid[])),1,'network listing media is authorized through its visible listing');
select ok(public.network_features_enabled(),'network feature default is enabled');
select * from finish();rollback;
