begin;
create extension if not exists pgtap with schema extensions;
select plan(79);

insert into public.campuses(id,name,short_name,slug,timezone,status) values
 ('d0000000-0000-4000-8000-000000000001','Campus Delta','Delta','campus-delta','America/Chicago','enabled'),
 ('e0000000-0000-4000-8000-000000000001','Campus Echo','Echo','campus-echo','America/New_York','enabled')
on conflict do nothing;
insert into public.campus_email_domains(campus_id,domain,is_enabled,review_status,domain_kind,source_label,reviewed_at) values
 ('d0000000-0000-4000-8000-000000000001','delta.invalid',true,'reviewed','student','Synthetic pgTAP fixture',now()),
 ('e0000000-0000-4000-8000-000000000001','echo.invalid',true,'reviewed','student','Synthetic pgTAP fixture',now())
on conflict do nothing;
insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values
 ('d1000000-0000-4000-8000-000000000001','alice@delta.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('d1000000-0000-4000-8000-000000000002','bob@delta.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('d1000000-0000-4000-8000-000000000003','moderator@delta.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('e1000000-0000-4000-8000-000000000001','eve@echo.invalid','test',now(),'{}','{}','authenticated','authenticated');
update public.profiles set
  status='active',onboarding_completed_at=now(),password_setup_required=false,
  verified_until=now()+interval '1 year',display_name=case id
    when 'd1000000-0000-4000-8000-000000000001' then 'Alice Delta'
    when 'd1000000-0000-4000-8000-000000000002' then 'Bob Delta'
    when 'd1000000-0000-4000-8000-000000000003' then 'Delta Moderator'
    else 'Eve Echo' end,
  handle=case id
    when 'd1000000-0000-4000-8000-000000000001' then 'alice_delta'
    when 'd1000000-0000-4000-8000-000000000002' then 'bob_delta'
    when 'd1000000-0000-4000-8000-000000000003' then 'delta_moderator'
    else 'eve_echo' end
where id in (
  'd1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001'
);

select ok((select relrowsecurity from pg_class where oid='public.friend_relationships'::regclass),'friend relationships have RLS');
select ok((select relrowsecurity from pg_class where oid='public.organizations'::regclass),'organizations have RLS');
select ok((select relrowsecurity from pg_class where oid='public.organization_memberships'::regclass),'organization memberships have RLS');
select ok((select relrowsecurity from pg_class where oid='public.social_posts'::regclass),'social posts have RLS');
select ok((select relrowsecurity from pg_class where oid='public.social_post_media'::regclass),'social post media have RLS');
select ok((select relrowsecurity from pg_class where oid='public.social_reactions'::regclass),'social reactions have RLS');
select ok((select relrowsecurity from pg_class where oid='public.social_comments'::regclass),'social comments have RLS');
select ok(has_table_privilege('service_role','public.profiles','SELECT'),'trusted server role can resolve profiles');
select ok(has_table_privilege('service_role','public.media_uploads','INSERT,UPDATE,DELETE'),'trusted server role can manage private media grants');

insert into public.notifications(campus_id,profile_id,kind,title,body,href)
values('d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','legacy_kind','Legacy notification','Compatibility check','/notifications');
select is((select category::text from public.notifications where kind='legacy_kind'),'security_activity','legacy notification writes receive a safe category');
select ok(not has_table_privilege('authenticated','public.friend_relationships','INSERT'),'friend writes are RPC-only');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select * from public.manage_friend_relationship('d1000000-0000-4000-8000-000000000002','send','d2000000-0000-4000-8000-000000000001')$$,'friend request can be sent');
select is((select status::text from public.friend_relationships),'pending','friend request begins pending');
select is((select status::text from public.manage_friend_relationship('d1000000-0000-4000-8000-000000000002','send','d2000000-0000-4000-8000-000000000001')),'pending','friend request retry is idempotent');
select throws_ok($$select * from public.manage_friend_relationship('d1000000-0000-4000-8000-000000000002','send','d2000000-0000-4000-8000-000000000002')$$,'23505','friend relationship already exists','duplicate pending relationship is rejected');
reset role;
select is((select count(*)::integer from public.outbox_events where event_type='friend.requested'),1,'friend request notification is queued exactly once');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.friend_relationships),1,'both participants can read the relationship');
select lives_ok($$select * from public.manage_friend_relationship('d1000000-0000-4000-8000-000000000001','accept','d2000000-0000-4000-8000-000000000003')$$,'recipient can accept a request');
select is((select status::text from public.friend_relationships),'accepted','friend relationship becomes accepted');
reset role;
select is((select count(*)::integer from public.outbox_events where event_type='friend.accepted' and payload->>'recipientId'='d1000000-0000-4000-8000-000000000001'),1,'friend acceptance notification is queued exactly once');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.create_organization('delta-robotics','Delta Robotics','A student organization for building useful robots.','campus_only','open',null,'d3000000-0000-4000-8000-000000000001')$$,'active member can create an organization');
select is((select role::text||':'||status::text from public.organization_memberships where profile_id=auth.uid()),'owner:active','creator becomes active owner');
select is((select member_count from public.organizations where slug='delta-robotics'),1,'new organization starts with one member');
reset role;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok($$select * from public.set_organization_membership((select id from public.organizations where slug='delta-robotics'),null,'join',null,'d3000000-0000-4000-8000-000000000002')$$,'open organization can be joined');
select is((select status::text from public.organization_memberships where profile_id=auth.uid()),'active','open membership is immediately active');
select is((select member_count from public.organizations where slug='delta-robotics'),2,'organization member count is maintained');
select throws_ok($$select * from public.set_organization_membership((select id from public.organizations where slug='delta-robotics'),'d1000000-0000-4000-8000-000000000001','change_role','member','d3000000-0000-4000-8000-000000000003')$$,'42501','role change not permitted','member cannot demote the owner');
reset role;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select * from public.set_organization_membership((select id from public.organizations where slug='delta-robotics'),'d1000000-0000-4000-8000-000000000002','transfer_ownership',null,'d3000000-0000-4000-8000-000000000005')$$,'owner can transfer ownership to an active member');
select is((select role::text from public.organization_memberships where organization_id=(select id from public.organizations where slug='delta-robotics') and profile_id='d1000000-0000-4000-8000-000000000001'),'administrator','previous owner becomes an administrator');
select is((select count(*)::integer from public.organization_memberships where organization_id=(select id from public.organizations where slug='delta-robotics') and role='owner' and status='active'),1,'organization retains exactly one active owner');
select lives_ok($$select * from public.set_organization_membership((select id from public.organizations where slug='delta-robotics'),'e1000000-0000-4000-8000-000000000001','invite','officer','d3000000-0000-4000-8000-000000000004')$$,'organization administrator can invite a network officer');
reset role;
select is((select count(*)::integer from public.outbox_events where event_type='organization.invited' and payload->>'recipientId'='e1000000-0000-4000-8000-000000000001'),1,'organization invitation is queued exactly once');

insert into public.media_uploads(id,campus_id,uploader_id,organization_id,purpose,object_key,content_type,byte_size,status,attached_at)
values('d7000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',(select id from public.organizations where slug='delta-robotics'),'organization_avatar','test/v1/organization-avatar','image/webp',100,'ready',now());
update public.organizations set avatar_media_id='d7000000-0000-4000-8000-000000000001' where slug='delta-robotics';
select is((select campus_id from public.media_uploads where id='d7000000-0000-4000-8000-000000000001'),'d0000000-0000-4000-8000-000000000001'::uuid,'organization media retains the organization campus');

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select * from public.set_organization_membership((select organization_id from public.organization_memberships where profile_id=auth.uid()),null,'accept',null,'e3000000-0000-4000-8000-000000000001')$$,'invitee can accept invitation');
select is((select status::text from public.organization_memberships where profile_id=auth.uid()),'active','accepted invitation activates membership');
select is((select campus_id from public.organization_memberships where profile_id=auth.uid()),'e0000000-0000-4000-8000-000000000001'::uuid,'cross-campus membership retains the member campus');
select ok(public.can_read_media('d7000000-0000-4000-8000-000000000001'),'active network member can read attached organization media');
select lives_ok($$select public.create_social_post('Cross-campus officer update',array[]::uuid[],'campus_only',(select organization_id from public.organization_memberships where profile_id=auth.uid()),'e4000000-0000-4000-8000-000000000001')$$,'cross-campus organization member can publish for the organization');
select is((select campus_id from public.social_posts where idempotency_key='e4000000-0000-4000-8000-000000000001'),'d0000000-0000-4000-8000-000000000001'::uuid,'organization-authored post retains the organization campus');
select throws_ok($$select public.create_social_post('Invalid friends-only organization update',array[]::uuid[],'friends',(select organization_id from public.organization_memberships where profile_id=auth.uid()),'e4000000-0000-4000-8000-000000000002')$$,'42501','organization post visibility is unavailable','organization posts cannot use the actor friend audience');
reset role;
delete from public.social_posts where idempotency_key='e4000000-0000-4000-8000-000000000001';

insert into public.media_uploads(id,campus_id,uploader_id,purpose,object_key,content_type,byte_size,status)
values('d7000000-0000-4000-8000-000000000002','d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','social_post','test/v1/social-post','image/webp',100,'ready');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.create_social_post('Campus-only robotics build night',array['d7000000-0000-4000-8000-000000000002'::uuid],'campus_only',null,'d4000000-0000-4000-8000-000000000001')$$,'member can create a campus social post');
select is(
  public.create_social_post('Ignored retry body',array[]::uuid[],'campus_only',null,'d4000000-0000-4000-8000-000000000001'),
  (select id from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000001'),
  'social post retry returns the original post'
);
select ok((select attached_at is not null from public.media_uploads where id='d7000000-0000-4000-8000-000000000002'),'social media is attached atomically');
select ok(public.can_read_media('d7000000-0000-4000-8000-000000000002'),'visible social media is authorized through the existing media predicate');
select is((select count(*)::integer from public.social_feed()),1,'author sees campus post in social feed');
select is(public.set_social_reaction((select id from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000001'),'celebrate'),1,'reaction mutation returns aggregate count');
select is((select reaction_count from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000001'),1,'post reaction count is maintained');
select lives_ok($$select public.create_social_comment((select id from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000001'),null,'Bring safety glasses.','d5000000-0000-4000-8000-000000000001')$$,'visible post can be commented on');
select is((select comment_count from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000001'),1,'post comment count is maintained');
select is((select count(*)::integer from public.social_feed_filtered(null,null,20,'campus',null)),1,'campus filter is applied before pagination');
select is((select count(*)::integer from public.social_feed_filtered(null,null,20,'for_you',auth.uid())),1,'author-scoped feed returns visible personal posts');
select lives_ok($$select public.update_social_post((select id from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000001'),'Updated campus robotics build night',array['d7000000-0000-4000-8000-000000000002'::uuid],'campus_only')$$,'author can update a social post with its existing media');
select is((select body from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000001'),'Updated campus robotics build night','post update persists the body');
select lives_ok($$select public.update_social_comment((select id from public.social_comments where idempotency_key='d5000000-0000-4000-8000-000000000001'),'Bring safety glasses and gloves.')$$,'comment author can edit a comment');
select is((select body from public.social_comments where idempotency_key='d5000000-0000-4000-8000-000000000001'),'Bring safety glasses and gloves.','comment edit persists the body');
select lives_ok($$select public.delete_social_comment((select id from public.social_comments where idempotency_key='d5000000-0000-4000-8000-000000000001'))$$,'comment author can soft delete a comment');
select is((select comment_count from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000001'),0,'comment soft delete recalculates the aggregate count');
select lives_ok($$select public.create_social_post('Temporary profile post',array[]::uuid[],'campus_only',null,'d4000000-0000-4000-8000-000000000003')$$,'author can create a post for deletion coverage');
select lives_ok($$select public.delete_social_post((select id from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000003'))$$,'author can soft delete a social post');
reset role;
select ok((select status='deleted' and deleted_at is not null and purge_after>deleted_at from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000003'),'post soft deletion records status and purge schedule');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.update_social_post((select id from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000001'),'Unauthorized edit',array[]::uuid[],'campus_only')$$,'P0002','post unavailable','a different member cannot update the post');
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*)::integer from public.social_feed()),0,'foreign campus member cannot read campus-only post');
select is((select count(*)::integer from public.safe_profile_by_username('alice_delta')),0,'campus-only expanded profile is hidden across campuses');
select throws_ok($$select public.set_social_reaction((select id from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000001'),'like')$$,'P0002','post unavailable','hidden post cannot be reacted to');
reset role;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.create_social_post('Network robotics collaboration announcement',array[]::uuid[],'network',null,'d4000000-0000-4000-8000-000000000002')$$,'member can create a network social post');
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*)::integer from public.social_feed()),1,'network post is visible across campuses');
select is((select count(*)::integer from public.unified_search('robotics',20) where kind='social_post'),1,'unified search returns visible social post');
reset role;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$update public.profiles set academic_field='Computer Science',graduation_year=2028,graduation_year_visible=true,interests=array['Robotics','Accessibility'],profile_visibility='network' where id=auth.uid()$$,'member can update safe expanded profile fields');
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select is((select count(*)::integer from public.unified_search('Alice',20) where kind='profile'),1,'network profile appears in unified search');
select is((select academic_field from public.safe_profile_by_username('alice_delta')),'Computer Science','authorized expanded profile returns safe academic details');
reset role;

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok($$select public.set_profile_block('d1000000-0000-4000-8000-000000000001',true)$$,'blocking a friend succeeds');
select is((select status::text from public.friend_relationships),'removed','blocking removes an accepted friendship');
select is((select count(*)::integer from public.social_feed()),0,'blocked author is removed from the social feed');
reset role;

select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.submit_report('social_post',(select id from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000002'),'unsafe','Network post moderation fixture','e6000000-0000-4000-8000-000000000001')$$,'visible network post can be reported');
reset role;

insert into public.role_assignments(profile_id,campus_id,role)
values('d1000000-0000-4000-8000-000000000003','d0000000-0000-4000-8000-000000000001','moderator');
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"d1000000-0000-4000-8000-000000000003","aal":"aal2"}',true);
set local role authenticated;
select lives_ok($$select public.moderate_report((select id from public.reports where idempotency_key='e6000000-0000-4000-8000-000000000001'),'hide_content','Confirmed policy violation')$$,'moderator can hide a reported social post at AAL2');
reset role;
select is((select status::text from public.social_posts where idempotency_key='d4000000-0000-4000-8000-000000000002'),'removed','moderation marks social post removed');
select is((select count(*)::integer from public.outbox_events where event_type='moderation.report_resolved' and aggregate_id=(select id from public.reports where idempotency_key='e6000000-0000-4000-8000-000000000001')),1,'moderation result is enqueued exactly once');
select ok(not has_function_privilege('anon','public.create_social_post(text,uuid[],public.social_visibility,uuid,uuid)','EXECUTE'),'anonymous role cannot execute social mutations');
select ok(not has_function_privilege('anon','public.update_social_post(uuid,text,uuid[],public.social_visibility)','EXECUTE'),'anonymous role cannot execute social ownership mutations');

select * from finish();
rollback;
