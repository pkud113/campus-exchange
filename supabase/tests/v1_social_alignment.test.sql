begin;
create extension if not exists pgtap with schema extensions;
select plan(86);

insert into public.campuses(id,name,short_name,slug,timezone,status) values
 ('f0000000-0000-4000-8000-000000000001','Fixture Campus','Fixture','fixture-campus','America/Chicago','enabled'),
 ('f0000000-0000-4000-8000-000000000002','Other Campus','Other','other-campus','America/New_York','enabled')
on conflict do nothing;
insert into public.campus_email_domains(campus_id,domain,is_enabled,review_status,domain_kind,source_label,reviewed_at) values
 ('f0000000-0000-4000-8000-000000000001','fixture.invalid',true,'reviewed','student','V1 alignment fixture',now()),
 ('f0000000-0000-4000-8000-000000000002','other.invalid',true,'reviewed','student','V1 alignment fixture',now())
on conflict do nothing;
insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,aud,role) values
 ('f1000000-0000-4000-8000-000000000001','owner@fixture.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('f1000000-0000-4000-8000-000000000002','officer@fixture.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('f1000000-0000-4000-8000-000000000003','member@fixture.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('f1000000-0000-4000-8000-000000000004','outsider@fixture.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('f1000000-0000-4000-8000-000000000005','foreign@other.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('f1000000-0000-4000-8000-000000000006','moderator@fixture.invalid','test',now(),'{}','{}','authenticated','authenticated'),
 ('f1000000-0000-4000-8000-000000000007','platform@other.invalid','test',now(),'{}','{}','authenticated','authenticated');
update public.profiles set status='active',onboarding_completed_at=now(),password_setup_required=false,verified_until=now()+interval '1 year',
 display_name=case id
   when 'f1000000-0000-4000-8000-000000000001' then 'Fixture Owner'
   when 'f1000000-0000-4000-8000-000000000002' then 'Fixture Officer'
   when 'f1000000-0000-4000-8000-000000000003' then 'Fixture Member'
   when 'f1000000-0000-4000-8000-000000000004' then 'Fixture Outsider'
   when 'f1000000-0000-4000-8000-000000000005' then 'Foreign Student'
   when 'f1000000-0000-4000-8000-000000000006' then 'Campus Moderator'
   else 'Platform Moderator' end,
 handle=case id
   when 'f1000000-0000-4000-8000-000000000001' then 'fixture_owner'
   when 'f1000000-0000-4000-8000-000000000002' then 'fixture_officer'
   when 'f1000000-0000-4000-8000-000000000003' then 'fixture_member'
   when 'f1000000-0000-4000-8000-000000000004' then 'fixture_outsider'
   when 'f1000000-0000-4000-8000-000000000005' then 'foreign_student'
   when 'f1000000-0000-4000-8000-000000000006' then 'fixture_moderator'
   else 'platform_moderator' end
where id::text like 'f1000000-0000-4000-8000-00000000000%';

insert into public.role_assignments(profile_id,campus_id,role,granted_by) values
 ('f1000000-0000-4000-8000-000000000006','f0000000-0000-4000-8000-000000000001','moderator','f1000000-0000-4000-8000-000000000001');
insert into public.platform_role_assignments(profile_id,role,granted_by) values
 ('f1000000-0000-4000-8000-000000000007','moderator','f1000000-0000-4000-8000-000000000001');

select ok((select relrowsecurity from pg_class where oid='public.organization_channels'::regclass),'organization channels have RLS');
select ok((select relrowsecurity from pg_class where oid='public.organization_channel_messages'::regclass),'organization messages have RLS');
select ok((select relrowsecurity from pg_class where oid='public.organization_channel_role_overrides'::regclass),'channel role overrides have RLS');
select ok((select relrowsecurity from pg_class where oid='public.moderation_cases'::regclass),'moderation cases have RLS');
select ok((select relrowsecurity from pg_class where oid='public.moderation_appeals'::regclass),'moderation appeals have RLS');
select ok(not has_table_privilege('authenticated','public.organization_channels','INSERT'),'channel inserts are RPC-only');
select ok(not has_table_privilege('authenticated','public.organization_channel_messages','INSERT'),'message inserts are RPC-only');
select ok(not has_function_privilege('anon','public.create_organization_channel(uuid,uuid,text,text,text,text,integer,uuid)','EXECUTE'),'anonymous channel creation is denied');
select ok(not has_function_privilege('anon','public.moderation_case_queue(text,text,text,uuid,uuid,integer)','EXECUTE'),'anonymous moderation access is denied');
select ok(has_table_privilege('service_role','public.campuses','SELECT'),'service-role campus lookup supports registration and staff provisioning');
select ok(has_table_privilege('service_role','public.staff_invitations','SELECT') and has_table_privilege('service_role','public.staff_invitations','INSERT') and has_table_privilege('service_role','public.staff_invitations','UPDATE') and has_table_privilege('service_role','public.staff_invitations','DELETE'),'service-role staff invitation lifecycle is explicitly granted');

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.create_organization('alignment-fixture','Alignment Fixture','A secure organization workspace fixture.','campus_only','open',null,'f2000000-0000-4000-8000-000000000001')$$,'verified student can create an organization workspace');
select is((select count(*)::integer from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture')),5,'workspace receives five built-in roles');
select is((select count(*)::integer from public.organization_categories where organization_id=(select id from public.organizations where slug='alignment-fixture')),2,'workspace receives default categories');
select is((select count(*)::integer from public.organization_channels where organization_id=(select id from public.organizations where slug='alignment-fixture')),4,'workspace receives default channels');
select lives_ok($$select public.create_organization_category((select id from public.organizations where slug='alignment-fixture'),'LEADERSHIP',20,'f2000000-0000-4000-8000-000000000002')$$,'authorized owner can create an audited category');
select lives_ok($$select public.create_organization_channel((select id from public.organizations where slug='alignment-fixture'),(select id from public.organization_categories where name='LEADERSHIP' and organization_id=(select id from public.organizations where slug='alignment-fixture')),'officer-chat','Private planning','text','restricted',0,'f2000000-0000-4000-8000-000000000003')$$,'authorized owner can create a restricted channel');
select lives_ok($$select public.set_organization_channel_role_override((select id from public.organization_channels where name='officer-chat'),(select id from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture') and builtin_key='officer'),true,true,false,false)$$,'owner can explicitly allow an officer role');
reset role;

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select lives_ok($$select * from public.set_organization_membership((select id from public.organizations where slug='alignment-fixture'),null,'join',null,'f3000000-0000-4000-8000-000000000001')$$,'member can join an open organization');
select is((select can_send from public.organization_channel_capabilities((select id from public.organizations where slug='alignment-fixture')) where channel_id=(select id from public.organization_channels where name='general')),true,'member can send in a normal channel');
select is((select can_send from public.organization_channel_capabilities((select id from public.organizations where slug='alignment-fixture')) where channel_id=(select id from public.organization_channels where name='announcements')),false,'member can read but cannot post announcements');
select is((select count(*)::integer from public.organization_channel_capabilities((select id from public.organizations where slug='alignment-fixture')) where channel_id=(select id from public.organization_channels where name='officer-chat')),0,'restricted channel is undiscoverable to ordinary members');
select lives_ok($$select public.send_organization_channel_message((select id from public.organization_channels where name='general'),null,'Hello workspace','f4000000-0000-4000-8000-000000000001')$$,'member can post in a normal channel');
select throws_ok($$select public.send_organization_channel_message((select id from public.organization_channels where name='announcements'),null,'Unauthorized announcement','f4000000-0000-4000-8000-000000000002')$$,'42501','message permission required','member cannot post in an announcement channel');
select throws_ok($$select public.assign_organization_role((select id from public.organizations where slug='alignment-fixture'),(select id from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture') and builtin_key='administrator'),auth.uid(),'assign','self promotion')$$,'42501','role assignment permission required','member cannot promote themselves');
reset role;

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select * from public.set_organization_membership((select id from public.organizations where slug='alignment-fixture'),'f1000000-0000-4000-8000-000000000002','invite','officer','f3000000-0000-4000-8000-000000000002')$$,'owner can invite an officer');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select lives_ok($$select * from public.set_organization_membership((select id from public.organizations where slug='alignment-fixture'),null,'accept',null,'f3000000-0000-4000-8000-000000000003')$$,'officer can accept an invitation');
select is((select can_send from public.organization_channel_capabilities((select id from public.organizations where slug='alignment-fixture')) where channel_id=(select id from public.organization_channels where name='officer-chat')),true,'explicit role allowance exposes the restricted channel to an officer');
reset role;

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select * from public.set_organization_membership((select id from public.organizations where slug='alignment-fixture'),'f1000000-0000-4000-8000-000000000003','ban',null,'f3000000-0000-4000-8000-000000000004')$$,'owner can ban a lower-authority member');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((select count(*)::integer from public.organization_channel_capabilities((select id from public.organizations where slug='alignment-fixture'))),0,'banned member cannot access workspace channels');
reset role;

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select is((select count(*)::integer from public.organizations where slug='alignment-fixture'),0,'foreign-campus nonmember cannot discover a campus-only organization');
reset role;

select is((select count(*)::integer from public.organization_audit_events where organization_id=(select id from public.organizations where slug='alignment-fixture') and action='organization.channel.created'),1,'channel creation produces an audit event');
select is((select count(*)::integer from public.organization_audit_events where organization_id=(select id from public.organizations where slug='alignment-fixture') and action='organization.channel.permission_changed'),1,'channel permission change produces an audit event');
select has_column('public','profiles','activity_visibility','profiles have field-level activity privacy');

-- Profile projection and dedicated organization-tab source privacy.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.profile_organization_memberships('f1000000-0000-4000-8000-000000000001')),1,'same-campus profile organization memberships are projected when visible');
reset role;
update public.profiles set organization_membership_visibility='private' where id='f1000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*)::integer from public.profile_organization_memberships('f1000000-0000-4000-8000-000000000001')),0,'private organization memberships are hidden from the profile organizations tab');
select is((select organization_count from public.safe_profile_by_username('fixture_owner')),0,'safe profile projection does not leak a private organization count');
reset role;
update public.profiles set organization_membership_visibility='campus_only' where id='f1000000-0000-4000-8000-000000000001';

-- Custom roles, multiple-role authority, dependencies, and tri-state overrides.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.manage_organization_role((select id from public.organizations where slug='alignment-fixture'),null,'create','Project Lead','#336699',55,30,array['view_organization','view_channels','send_messages'])$$,'owner can create a custom organization role');
select is((select builtin_key from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture') and name='Project Lead'),null,'custom roles are distinguishable from built-in roles');
select lives_ok($$select public.manage_organization_role((select id from public.organizations where slug='alignment-fixture'),null,'create','Release Helper','#476657',56,20,array['view_organization','view_channels'])$$,'owner can create more than one custom role');
select is((select count(*)::integer from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture') and builtin_key is null),2,'multiple custom roles coexist without weakening built-in role uniqueness');
select throws_ok($$select public.manage_organization_role((select id from public.organizations where slug='alignment-fixture'),null,'create','Peer Owner','#AA0000',60,100,array['view_organization'])$$,'42501','role authority exceeds actor authority','custom role creation cannot equal the actor authority');
select lives_ok($$select public.set_organization_channel_role_override((select id from public.organization_channels where name='officer-chat'),(select id from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture') and name='Project Lead'),true,true,false,false)$$,'nullable custom-role keys work in channel permission comparisons');
select is((select count(*)::integer from public.organization_channel_role_overrides where role_id=(select id from public.organization_roles where name='Project Lead' and organization_id=(select id from public.organizations where slug='alignment-fixture'))),1,'custom role override is stored');
select lives_ok($$select public.assign_organization_role((select id from public.organizations where slug='alignment-fixture'),(select id from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture') and name='Project Lead'),'f1000000-0000-4000-8000-000000000002','assign','Project leadership assignment')$$,'owner can assign a lower custom role to an active member');
select is((select count(*)::integer from public.organization_role_assignments where profile_id='f1000000-0000-4000-8000-000000000002' and role_id=(select id from public.organization_roles where name='Project Lead' and organization_id=(select id from public.organizations where slug='alignment-fixture'))),1,'custom role assignment is persisted');
select throws_ok($$select public.manage_organization_role((select id from public.organizations where slug='alignment-fixture'),(select id from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture') and name='Project Lead'),'delete','Project Lead','#336699',55,30,array['view_organization'])$$,'23505','role still has assignments or channel dependencies','custom role deletion is blocked while dependencies remain');
select lives_ok($$select public.set_organization_channel_member_override((select id from public.organization_channels where name='officer-chat'),'f1000000-0000-4000-8000-000000000002',false,null,null,null)$$,'owner can set a member-specific channel deny');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.organization_channel_capabilities((select id from public.organizations where slug='alignment-fixture')) where channel_id=(select id from public.organization_channels where name='officer-chat')),0,'member-specific deny overrides role allows and makes a restricted channel undiscoverable');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.set_organization_channel_member_override((select id from public.organization_channels where name='officer-chat'),'f1000000-0000-4000-8000-000000000002',null,null,null,null)$$,'all-inherit member override removes the explicit row');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select can_send from public.organization_channel_capabilities((select id from public.organizations where slug='alignment-fixture')) where channel_id=(select id from public.organization_channels where name='officer-chat')),true,'clearing the member override converges to inherited role access');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.assign_organization_role((select id from public.organizations where slug='alignment-fixture'),(select id from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture') and name='Project Lead'),'f1000000-0000-4000-8000-000000000002','remove','Project leadership removal')$$,'owner can remove a custom role from a lower-authority member');
select lives_ok($$select public.set_organization_channel_role_override((select id from public.organization_channels where name='officer-chat'),(select id from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture') and name='Project Lead'),null,null,null,null)$$,'all-inherit role override removes the dependency');
select lives_ok($$select public.manage_organization_role((select id from public.organizations where slug='alignment-fixture'),(select id from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture') and name='Project Lead'),'delete','Project Lead','#336699',55,30,array[]::text[])$$,'eligible custom roles can be deleted');
select is((select count(*)::integer from public.organization_roles where organization_id=(select id from public.organizations where slug='alignment-fixture') and name='Project Lead'),0,'deleted custom role is gone');
select ok((select count(*) from public.organization_audit_history((select id from public.organizations where slug='alignment-fixture'),null,100))>0,'authorized owner can view paginated organization audit history');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok($$select * from public.organization_audit_history((select id from public.organizations where slug='alignment-fixture'),null,10)$$,'42501','audit history permission required','unauthorized nonmember cannot view organization audit history');
reset role;

-- Organization report scoping and trusted ownership confirmation.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.submit_report('organization_membership',(select id from public.organization_memberships where organization_id=(select id from public.organizations where slug='alignment-fixture') and profile_id='f1000000-0000-4000-8000-000000000002'),'other','Organization membership evidence','f9000000-0000-4000-8000-000000000001')$$,'organization membership report can be submitted with evidence');
reset role;
select is((select organization_id from public.moderation_cases where report_id=(select id from public.reports where idempotency_key='f9000000-0000-4000-8000-000000000001')),(select id from public.organizations where slug='alignment-fixture'),'organization membership case receives organization scope');
select is((select subject_campus_id from public.moderation_cases where report_id=(select id from public.reports where idempotency_key='f9000000-0000-4000-8000-000000000001')),'f0000000-0000-4000-8000-000000000001'::uuid,'organization membership case receives campus scope');
select is((select content_snapshot->>'organizationId' from public.reports where idempotency_key='f9000000-0000-4000-8000-000000000001'),(select id::text from public.organizations where slug='alignment-fixture'),'organization membership report preserves related evidence');
set local role authenticated;
select throws_ok($$select * from public.set_organization_membership((select id from public.organizations where slug='alignment-fixture'),'f1000000-0000-4000-8000-000000000002','transfer_ownership',null,'f9000000-0000-4000-8000-000000000002')$$,'42501','use confirmed ownership transfer','legacy ownership transfer entry point is disabled');
select throws_ok($$select * from public.transfer_organization_ownership((select id from public.organizations where slug='alignment-fixture'),'f1000000-0000-4000-8000-000000000002','wrong organization','f9000000-0000-4000-8000-000000000003')$$,'23514','organization confirmation mismatch','database boundary rejects organization-mismatched confirmation');
select is((select count(*)::integer from public.organization_memberships where organization_id=(select id from public.organizations where slug='alignment-fixture') and role='owner' and status='active'),1,'failed ownership transfer cannot leave the organization ownerless');
reset role;

select is((select resolution from private.resolve_registration_domain('umich.edu')),'ambiguous','University of Michigan shared-domain registration fails closed');
select is((select resolution from private.resolve_registration_domain('not-a-campus.invalid')),'unsupported','registration resolver returns a stable unsupported outcome');

-- Campus/platform moderation scope and the complete MFA-protected appeal path.
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select lives_ok($$select public.submit_report('account_security','f1000000-0000-4000-8000-000000000005','other','Cross-campus platform-visible security report','f9000000-0000-4000-8000-000000000004')$$,'other-campus account security report is created for platform scope');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from public.moderation_case_queue(null,'account_security',null,null,null,100)),0,'campus moderator cannot access another campus platform-visible case');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000007',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000007","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from public.moderation_case_queue(null,'account_security',null,null,null,100)),1,'platform moderator can access a platform-visible cross-campus case');
reset role;

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.submit_report('profile','f1000000-0000-4000-8000-000000000004','harassment','Appealable profile moderation fixture','f9000000-0000-4000-8000-000000000005')$$,'profile report creates an appealable moderation case');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","aal":"aal2"}',true);
set local role authenticated;
select is((select count(*)::integer from public.moderation_case_queue(null,'organization_membership',null,null,(select id from public.organizations where slug='alignment-fixture'),100)),1,'organization report appears in the correct campus moderator queue scope');
select lives_ok($$select public.moderate_case((select id from public.moderation_cases where report_id=(select id from public.reports where idempotency_key='f9000000-0000-4000-8000-000000000005')),'temporary_account_restriction','Temporary restriction for appeal test','You may appeal this restriction.',now()+interval '1 day')$$,'MFA campus moderator can apply a reversible scoped action');
select isnt((select restricted_until from public.profiles where id='f1000000-0000-4000-8000-000000000004'),null,'moderation action restricts the subject');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000004","aal":"aal1"}',true);
set local role authenticated;
select lives_ok($$select public.submit_moderation_appeal((select id from public.appealable_moderation_cases() limit 1),'The restriction should be reconsidered based on the complete context.','f9000000-0000-4000-8000-000000000006')$$,'affected user can open an appeal');
select is((select status from public.moderation_appeals where idempotency_key='f9000000-0000-4000-8000-000000000006'),'open','new appeal starts open');
reset role;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000006","aal":"aal2"}',true);
set local role authenticated;
select lives_ok($$select public.resolve_moderation_appeal((select id from public.moderation_appeals where idempotency_key='f9000000-0000-4000-8000-000000000006'),'assign','f1000000-0000-4000-8000-000000000006','Assigned for independent review','',false)$$,'MFA moderator can assign an appeal reviewer within scope');
select is((select status||':'||assigned_to::text from public.moderation_appeals where idempotency_key='f9000000-0000-4000-8000-000000000006'),'reviewing:f1000000-0000-4000-8000-000000000006','appeal assignment records reviewer and review state');
select lives_ok($$select public.resolve_moderation_appeal((select id from public.moderation_appeals where idempotency_key='f9000000-0000-4000-8000-000000000006'),'request_information',null,'More context is needed','Please provide the missing incident context.',false)$$,'reviewer can request more information with a user-visible message');
select is((select status from public.moderation_appeals where idempotency_key='f9000000-0000-4000-8000-000000000006'),'awaiting_user_response','appeal records the information-request state');
select lives_ok($$select public.resolve_moderation_appeal((select id from public.moderation_appeals where idempotency_key='f9000000-0000-4000-8000-000000000006'),'approve',null,'Appeal evidence supports reversal','Your appeal was approved and the eligible restriction was reversed.',true)$$,'reviewer can approve an appeal and reverse an eligible action');
select is((select status from public.moderation_appeals where idempotency_key='f9000000-0000-4000-8000-000000000006'),'granted','approved appeal is closed as granted');
select isnt((select reversed_at from public.moderation_actions where case_id=(select case_id from public.moderation_appeals where idempotency_key='f9000000-0000-4000-8000-000000000006') and action='temporary_account_restriction'),null,'approved appeal marks the original action reversed');
select is((select restricted_until from public.profiles where id='f1000000-0000-4000-8000-000000000004'),null,'approved appeal restores the eligible profile restriction');
select is((select count(*)::integer from public.audit_log where action='moderation.appeal.approve' and target_id=(select id::text from public.moderation_appeals where idempotency_key='f9000000-0000-4000-8000-000000000006')),1,'appeal resolution writes a scoped audit event');
reset role;

select ok(not has_function_privilege('anon','public.manage_organization_role(uuid,uuid,text,text,text,integer,integer,text[])','EXECUTE'),'anonymous users cannot manage custom roles');
select ok(not has_function_privilege('anon','public.transfer_organization_ownership(uuid,uuid,text,uuid)','EXECUTE'),'anonymous users cannot transfer organization ownership');

select * from finish();
rollback;
