begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

select ok((select relrowsecurity from pg_class where oid='public.registration_enrollment_grants'::regclass),'enrollment grants have RLS');
select ok((select relrowsecurity from pg_class where oid='public.campus_membership_verifications'::regclass),'membership verification history has RLS');
select ok((select relrowsecurity from pg_class where oid='public.registration_email_domain_denials'::regclass),'email denylist has RLS');
select ok((select relrowsecurity from pg_class where oid='public.conversation_request_status_history'::regclass),'request status history has RLS');
select ok((select relrowsecurity from pg_class where oid='public.organization_channel_message_reactions'::regclass),'organization reactions have RLS');
select ok((select relrowsecurity from pg_class where oid='public.notification_category_preferences'::regclass),'category preferences have RLS');
select ok((select relrowsecurity from pg_class where oid='public.admin_saved_views'::regclass),'saved admin views have RLS');
select ok((select relrowsecurity from pg_class where oid='public.admin_operational_cases'::regclass),'admin operational cases have RLS');
select ok((select relrowsecurity from pg_class where oid='public.operational_setting_definitions'::regclass),'operational setting definitions have RLS');

select ok(not has_table_privilege('anon','public.registration_enrollment_grants','SELECT'),'anonymous users cannot read grants');
select ok(not has_table_privilege('authenticated','public.registration_enrollment_grants','SELECT'),'authenticated users cannot read opaque grant records');
select ok(not has_table_privilege('anon','public.campus_membership_verifications','SELECT'),'anonymous users cannot read verification history');
select ok(has_table_privilege('authenticated','public.campus_membership_verifications','SELECT'),'members can read their RLS-filtered verification history');
select ok(has_table_privilege('authenticated','public.conversation_request_status_history','SELECT'),'request parties can read RLS-filtered status history');
select ok(has_table_privilege('authenticated','public.organization_channel_message_reactions','SELECT'),'visible channel reactions can be read');
select ok(has_table_privilege('authenticated','public.notification_category_preferences','SELECT'),'members can read category preferences');
select ok(not has_table_privilege('anon','public.admin_operational_cases','SELECT'),'anonymous users cannot read operational cases');
select ok(has_table_privilege('authenticated','public.admin_operational_cases','SELECT'),'AAL2 staff can read scope-filtered operational cases');

select ok(not has_function_privilege('anon','public.create_registration_enrollment_grant(text,text,text,text)','EXECUTE'),'anonymous clients cannot mint enrollment grants');
select ok(has_function_privilege('service_role','public.create_registration_enrollment_grant(text,text,text,text)','EXECUTE'),'trusted registration service can mint grants');
select ok(has_function_privilege('service_role','public.search_institution_directory_v2(text,text,text,text,integer)','EXECUTE'),'trusted onboarding can use the safe institution projection');
select ok(not has_function_privilege('anon','public.complete_registration_enrollment(uuid)','EXECUTE'),'anonymous clients cannot consume grants');
select ok(has_function_privilege('authenticated','public.complete_registration_enrollment(uuid)','EXECUTE'),'authenticated OTP users can atomically consume grants');
select ok(has_function_privilege('authenticated','public.friend_box_v2(text,uuid,integer)','EXECUTE'),'members can use paged friend boxes');
select ok(has_function_privilege('authenticated','public.conversation_request_box_v2(text,uuid,integer)','EXECUTE'),'members can use paged request boxes');
select ok(has_function_privilege('authenticated','public.toggle_organization_message_reaction(uuid,text)','EXECUTE'),'members can toggle visible channel reactions');
select ok(has_function_privilege('authenticated','public.search_member_directory_v2(text,text,uuid,integer)','EXECUTE'),'members can use safe institution-filtered discovery');
select ok(has_function_privilege('authenticated','public.unified_search_v2(text,text,text[],timestamptz,uuid,integer)','EXECUTE'),'members can use server-filtered unified search');
select ok(has_function_privilege('authenticated','public.staff_access_context()','EXECUTE'),'staff can resolve a fail-closed AAL2 context');
select ok(not has_function_privilege('anon','public.apply_admin_operational_action(text,text,text,text,uuid)','EXECUTE'),'anonymous clients cannot invoke admin actions');

select ok((select prosecdef from pg_proc where oid='public.create_registration_enrollment_grant(text,text,text,text)'::regprocedure),'grant minting owns its trusted write');
select ok((select prosecdef from pg_proc where oid='public.complete_registration_enrollment(uuid)'::regprocedure),'grant consumption and campus provisioning are atomic');
select ok((select prosecdef from pg_proc where oid='public.friend_box_v2(text,uuid,integer)'::regprocedure),'friend paging owns its privacy-aware projection');
select ok((select prosecdef from pg_proc where oid='public.conversation_request_box_v2(text,uuid,integer)'::regprocedure),'request paging owns its protected projection');
select ok((select prosecdef from pg_proc where oid='public.toggle_organization_message_reaction(uuid,text)'::regprocedure),'reaction toggle owns its atomic mutation');
select ok((select prosecdef from pg_proc where oid='public.notification_delivery_decision(uuid,public.notification_category,uuid,timestamptz)'::regprocedure),'notification decisions consistently own preference evaluation');
select ok((select prosecdef from pg_proc where oid='public.staff_access_context()'::regprocedure),'staff capability resolution is protected');
select ok((select prosecdef from pg_proc where oid='public.apply_admin_operational_action(text,text,text,text,uuid)'::regprocedure),'audited admin mutations own protected before-state capture');

select ok(exists(select 1 from public.registration_email_domain_denials where domain='gmail.com'),'consumer Gmail addresses are denied');
select ok(exists(select 1 from public.registration_email_domain_denials where domain='mailinator.com' and category='disposable'),'known disposable addresses are denied');
select is((select value from public.runtime_settings where key='universal_onboarding_enabled'),'false'::jsonb,'universal onboarding remains off for schema rollout');
select is((select value from public.runtime_settings where key='institution_network_discovery_enabled'),'true'::jsonb,'directory-backed discovery is enabled');
select is((select count(*)::integer from public.institution_directory where id in ('ipeds:170976','ipeds:171137','ipeds:171146')),3,'all three University of Michigan campuses remain explicit directory choices');
select is(private.region_default_timezone('MI'),'America/Detroit','Michigan lazy provisioning records the predominant regional timezone');
select is((select count(*)::integer from unnest(enum_range(null::public.membership_verification_basis)) basis),5,'verification basis distinguishes reviewed, website, shared, explicit, and legacy assignment');

select * from finish();
rollback;
