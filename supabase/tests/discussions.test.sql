begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

insert into public.campuses(id,name,slug,timezone) values
  ('00000000-0000-4000-8000-000000000002','Other University','other-university','America/Chicago') on conflict do nothing;
insert into public.campus_email_domains(campus_id,domain) values
  ('00000000-0000-4000-8000-000000000002','students.other.edu') on conflict do nothing;

insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values
  ('10000000-0000-4000-8000-000000000001','owner@students.demo.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('10000000-0000-4000-8000-000000000002','member@students.demo.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('10000000-0000-4000-8000-000000000003','suspended@students.demo.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('10000000-0000-4000-8000-000000000004','outsider@students.other.edu','test',now(),'{}','{}','authenticated','authenticated'),
  ('10000000-0000-4000-8000-000000000005','staff@students.demo.edu','test',now(),'{}','{}','authenticated','authenticated');
update public.profiles set status='active', onboarding_completed_at=now(), password_setup_required=false,
  verified_at=now(), verified_until=now()+interval '1 year', handle=case id
    when '10000000-0000-4000-8000-000000000001' then 'discussion_owner'
    when '10000000-0000-4000-8000-000000000002' then 'discussion_member'
    when '10000000-0000-4000-8000-000000000003' then 'discussion_suspended'
    when '10000000-0000-4000-8000-000000000004' then 'discussion_outsider'
    else 'discussion_staff' end,
  display_name='Discussion Test'
where id::text like '10000000-%';
update public.profiles set status='suspended' where id='10000000-0000-4000-8000-000000000003';
update public.profiles set account_kind='staff',verified_until=null where id='10000000-0000-4000-8000-000000000005';
insert into public.role_assignments(profile_id,campus_id,role) values
  ('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','moderator');
insert into public.media_uploads(id,campus_id,uploader_id,object_key,content_type,byte_size,status,purpose,alt_text) values
  ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','discussion/image-one','image/png',1024,'ready','discussion_post','Campus image');

select ok((select relrowsecurity from pg_class where oid='public.discussion_communities'::regclass),'community RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.discussion_posts'::regclass),'post RLS enabled');
select ok((select relrowsecurity from pg_class where oid='public.discussion_comments'::regclass),'comment RLS enabled');
select ok(not has_table_privilege('authenticated','public.discussion_posts','INSERT'),'direct post inserts revoked');
select ok(not has_table_privilege('authenticated','public.discussion_posts','UPDATE'),'direct post updates revoked');
select ok(not has_table_privilege('authenticated','public.discussion_post_votes','INSERT'),'direct vote inserts revoked');
select ok(has_function_privilege('authenticated','public.create_discussion_community(text,text,text,text,public.discussion_posting_permission,uuid)','EXECUTE'),'community RPC executable');
select ok(has_function_privilege('authenticated','public.set_discussion_vote(text,uuid,smallint)','EXECUTE'),'vote RPC executable');
select ok(has_function_privilege('authenticated','public.discussion_comment_tree(uuid,timestamptz,uuid,integer)','EXECUTE'),'recursive comment RPC executable');
select ok(has_table_privilege('authenticated','public.media_uploads','SELECT'),'upload owners can read their grant state');
select ok(has_function_privilege('authenticated','public.update_discussion_post(uuid,text,text,text,uuid)','EXECUTE'),'image-aware post update RPC executable');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.create_discussion_community('campus_life','Campus Life','Local conversation','Be kind','members','20000000-0000-4000-8000-000000000001')$$,'owner creates a community');
select is((select member_count from public.discussion_communities where slug='campus_life'),1,'owner counted once');
select is((select role::text from public.discussion_memberships where profile_id=auth.uid()),'owner','owner membership created atomically');
select throws_ok($$select public.set_discussion_membership('campus_life',false)$$,'42501','transfer ownership before leaving','owner leave is rejected');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select lives_ok($$select public.set_discussion_membership('campus_life',true)$$,'member joins');
select lives_ok($$select public.set_discussion_membership('campus_life',true)$$,'duplicate join is idempotent');
select is((select member_count from public.discussion_communities where slug='campus_life'),2,'duplicate join does not inflate counter');
select lives_ok($$select public.create_discussion_post('campus_life','text','First campus post','A useful body',null,null,'20000000-0000-4000-8000-000000000002')$$,'active member creates text post');
select is((select post_count from public.discussion_communities where slug='campus_life'),1,'post counter maintained transactionally');
select lives_ok($$select public.create_discussion_post('campus_life','image','Campus photo','Context displayed beneath the image',null,'30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000013')$$,'image post accepts an optional text body');
select is((select body from public.discussion_posts where title='Campus photo'),'Context displayed beneath the image','image post body is stored');
select ok((select attached_at is not null and discussion_post_id is not null from public.media_uploads where id='30000000-0000-4000-8000-000000000001'),'new image media is attached exactly once');
reset role;
insert into public.media_uploads(id,campus_id,uploader_id,object_key,content_type,byte_size,status,purpose,alt_text) values
  ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','discussion/image-two','image/png',1024,'ready','discussion_post','Replacement image');
set local role authenticated;
select lives_ok($$select public.update_discussion_post((select id from public.discussion_posts where title='Campus photo'),'Campus photo updated','Updated text beneath the replacement',null,'30000000-0000-4000-8000-000000000002')$$,'image post replacement is atomic');
select is((select body from public.discussion_posts where title='Campus photo updated'),'Updated text beneath the replacement','image body remains editable');
select is((select status from public.media_uploads where id='30000000-0000-4000-8000-000000000001'),'deleted','replaced media is scheduled for cleanup');
select throws_ok($$select public.update_discussion_post((select id from public.discussion_posts where title='Campus photo updated'),'Campus photo updated','Still has context',null,null)$$,'23514','image posts require uploaded media','image attachment cannot be removed without replacement');
select is((select public.set_discussion_vote('post',(select id from public.discussion_posts where title='First campus post'),1::smallint)),1,'first upvote sets score');
select is((select public.set_discussion_vote('post',(select id from public.discussion_posts where title='First campus post'),1::smallint)),1,'repeated upvote is idempotent');
select is((select public.set_discussion_vote('post',(select id from public.discussion_posts where title='First campus post'),(-1)::smallint)),-1,'vote switching applies delta');
select is((select public.set_discussion_vote('post',(select id from public.discussion_posts where title='First campus post'),null::smallint))::integer,0,'clearing vote returns zero score');
select is((select public.set_discussion_saved((select id from public.discussion_posts where title='First campus post'),true)),true,'save RPC succeeds');
select is((select save_count from public.discussion_posts where title='First campus post'),1,'save counter maintained');
select lives_ok($$select public.create_discussion_comment((select id from public.discussion_posts where title='First campus post'),null,'Root comment','20000000-0000-4000-8000-000000000003')$$,'root comment created');
select lives_ok($$select public.create_discussion_comment((select id from public.discussion_posts where title='First campus post'),(select id from public.discussion_comments where body='Root comment'),'Nested reply','20000000-0000-4000-8000-000000000004')$$,'nested comment created');
select is((select depth::integer from public.discussion_comments where body='Nested reply'),1,'comment depth derived in database');
select is((select count(*)::integer from public.discussion_comment_tree((select id from public.discussion_posts where title='First campus post'),null,null,20)),2,'root page returns descendants in one recursive query');

reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select is((select count(*)::integer from public.discussion_communities where slug='campus_life'),0,'cross-campus community access denied');

reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select public.set_discussion_membership('campus_life',true)$$,'42501','active campus membership required','suspended member cannot join');

reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000005","aal":"aal1"}',true);
set local role authenticated;
select throws_ok($$select public.moderate_discussion('campus_life','pin_post','post',(select id from public.discussion_posts where title='First campus post'),'Staff action','20000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000008')$$,'42501','discussion moderator access required','campus staff moderation requires AAL2');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000005","aal":"aal2"}',true);
select lives_ok($$select public.moderate_discussion('campus_life','pin_post','post',(select id from public.discussion_posts where title='First campus post'),'Staff action','20000000-0000-4000-8000-000000000009','20000000-0000-4000-8000-000000000010')$$,'same-campus staff moderates at AAL2');
select throws_ok($$select public.transfer_discussion_ownership('campus_life','10000000-0000-4000-8000-000000000005','Not permitted','20000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000012')$$,'42501','community owner required','staff cannot assume ownership');

reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.transfer_discussion_ownership('campus_life','10000000-0000-4000-8000-000000000002','Planned handoff','20000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000006')$$,'ownership transfers atomically');
select is((select owner_id from public.discussion_communities where slug='campus_life'),'10000000-0000-4000-8000-000000000002'::uuid,'community owner updated');
select is((select count(*)::integer from public.discussion_memberships where role='owner'),1,'exactly one owner membership remains');

select * from finish();
rollback;
