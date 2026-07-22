-- Campus Exchange V1 Step 2B: fail-closed automated moderation for shared text.
-- Private messages and conversation requests deliberately have no trigger or
-- function dependency on this subsystem.

create type public.content_moderation_outcome as enum ('allow','block','review');

create table public.content_moderation_checks (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  surface text not null check (char_length(surface) between 3 and 80),
  operation text not null check (operation in ('create','edit')),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  outcome public.content_moderation_outcome not null,
  categories text[] not null default '{}',
  provider text not null check (char_length(provider) between 2 and 80),
  model text not null check (char_length(model) between 2 and 160),
  policy_version text not null check (char_length(policy_version) between 3 and 80),
  target_entity_id uuid,
  idempotency_key uuid,
  severe boolean not null default false,
  consumed_at timestamptz,
  consumed_entity_id uuid,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  purge_after timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create table public.content_moderation_evidence (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null unique references public.content_moderation_checks(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  surface text not null,
  protected_fields jsonb,
  content_hash text not null,
  categories text[] not null default '{}',
  policy_version text not null,
  provider text not null,
  model text not null,
  review_requested_at timestamptz,
  redacted_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now()
);

create table public.content_moderation_overrides (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  surface text not null,
  operation text not null check (operation in ('create','edit')),
  content_hash text not null,
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  approved_by uuid not null references public.profiles(id),
  consumed_at timestamptz,
  consumed_entity_id uuid,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index content_moderation_checks_match_idx on public.content_moderation_checks(actor_id,surface,operation,content_hash,created_at desc) where consumed_at is null;
create index content_moderation_checks_purge_idx on public.content_moderation_checks(purge_after);
create index content_moderation_evidence_purge_idx on public.content_moderation_evidence(purge_after) where purge_after is not null and redacted_at is null;
create index content_moderation_overrides_match_idx on public.content_moderation_overrides(actor_id,surface,operation,content_hash,created_at desc) where consumed_at is null and revoked_at is null;

alter table public.content_moderation_checks enable row level security;
alter table public.content_moderation_evidence enable row level security;
alter table public.content_moderation_overrides enable row level security;
revoke all on public.content_moderation_checks,public.content_moderation_evidence,public.content_moderation_overrides from public,anon,authenticated;
grant all on public.content_moderation_checks,public.content_moderation_evidence,public.content_moderation_overrides to service_role;

alter table public.reports add column source text not null default 'user' check (source in ('user','automated','user_review'));
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in (
  'listing','event','profile','message','conversation_request','community','discussion_post','discussion_comment',
  'organization','organization_channel','organization_message','organization_role','organization_membership',
  'social_post','social_comment','institution','account_security','automated_moderation'
));
create unique index reports_automated_moderation_once on public.reports(target_id) where target_type='automated_moderation';

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in (
  'dismiss','warn','hide_content','remove_content','restore_content','restrict_content','lock_content',
  'temporary_account_restriction','suspend','restore','ban_account','restrict_organization','suspend_organization',
  'remove_organization','restrict_channel','delete_channel_message','remove_organization_role','remove_organization_member',
  'restrict_community','remove_listing','cancel_event','escalate','request_information','reverse',
  'approve_content','uphold_block'
));

create or replace function private.content_moderation_hash(target_surface text,target_operation text,target_fields jsonb)
returns text language sql immutable set search_path='' as $$
  select encode(extensions.digest(
    convert_to('ce-shared-text-2026-07-v1'||chr(10)||target_surface||chr(10)||target_operation||chr(10)||coalesce((
      select string_agg(key||': '||case jsonb_typeof(value) when 'array' then (
        select string_agg(item,chr(10) order by ordinal) from jsonb_array_elements_text(value) with ordinality as x(item,ordinal)
      ) when 'string' then value#>>'{}' else value::text end,chr(10) order by key)
      from jsonb_each(target_fields)
    ),''),'UTF8'),'sha256'),'hex')
$$;

create or replace function public.record_content_moderation_check(
  target_actor uuid,target_campus uuid,target_surface text,target_operation text,target_hash text,
  target_outcome text,target_categories text[],target_provider text,target_model text,target_policy text,
  target_fields jsonb,target_entity uuid default null,target_key uuid default null,target_severe boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; evidence_id uuid; created_report_id uuid; reason text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles p where p.id=target_actor and p.campus_id=target_campus and p.status='active') then raise exception 'active actor required' using errcode='42501'; end if;
  if target_operation not in ('create','edit') or target_outcome not in ('allow','block','review') or target_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid moderation decision' using errcode='23514'; end if;
  if private.content_moderation_hash(target_surface,target_operation,target_fields)<>target_hash then raise exception 'moderation hash mismatch' using errcode='23514'; end if;
  select c.id into result from public.content_moderation_checks c
  where c.actor_id=target_actor and c.surface=target_surface and c.operation=target_operation and c.content_hash=target_hash
    and c.policy_version=target_policy and c.outcome=target_outcome::public.content_moderation_outcome and c.created_at>now()-interval '2 minutes'
  order by c.created_at desc limit 1;
  if result is null then
    insert into public.content_moderation_checks(actor_id,campus_id,surface,operation,content_hash,outcome,categories,provider,model,policy_version,target_entity_id,idempotency_key,severe)
    values(target_actor,target_campus,target_surface,target_operation,target_hash,target_outcome::public.content_moderation_outcome,coalesce(target_categories,'{}'),target_provider,target_model,target_policy,target_entity,target_key,target_severe)
    returning id into result;
  end if;
  if target_outcome<>'allow' then
    insert into public.content_moderation_evidence(check_id,actor_id,campus_id,surface,protected_fields,content_hash,categories,policy_version,provider,model)
    values(result,target_actor,target_campus,target_surface,target_fields,target_hash,coalesce(target_categories,'{}'),target_policy,target_provider,target_model)
    on conflict(check_id) do nothing returning id into evidence_id;
    if evidence_id is null then select id into evidence_id from public.content_moderation_evidence where check_id=result; end if;
    if target_severe then
      reason:=case when 'threat'=any(coalesce(target_categories,'{}')) then 'unsafe' else 'harassment' end;
      insert into public.reports(campus_id,subject_campus_id,platform_visible,reporter_id,target_type,target_id,reason,details,idempotency_key,source)
      values(target_campus,target_campus,false,target_actor,'automated_moderation',evidence_id,reason,'Automatically escalated high-confidence safety decision.',result,'automated')
      on conflict(target_id) where target_type='automated_moderation' do nothing returning id into created_report_id;
      if created_report_id is null then select id into created_report_id from public.reports where target_type='automated_moderation' and target_id=evidence_id; end if;
      update public.moderation_cases set severity=case when 'threat'=any(coalesce(target_categories,'{}')) then 'critical'::public.moderation_severity else 'high'::public.moderation_severity end where report_id=created_report_id;
    end if;
  end if;
  return result;
end $$;

revoke execute on function public.record_content_moderation_check(uuid,uuid,text,text,text,text,text[],text,text,text,jsonb,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.record_content_moderation_check(uuid,uuid,text,text,text,text,text[],text,text,text,jsonb,uuid,uuid,boolean) to service_role;

create or replace function private.require_content_moderation(target_surface text,target_operation text,target_fields jsonb,target_entity uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); wanted_hash text; selected_check uuid; selected_override uuid;
begin
  if actor is null then return; end if;
  wanted_hash:=private.content_moderation_hash(target_surface,target_operation,target_fields);
  select c.id into selected_check from public.content_moderation_checks c
  where c.actor_id=actor and c.campus_id=public.current_campus_id() and c.surface=target_surface and c.operation=target_operation
    and c.content_hash=wanted_hash and c.outcome='allow' and c.consumed_at is null and c.expires_at>now()
    and (c.target_entity_id is null or c.target_entity_id=target_entity)
  order by c.created_at desc limit 1 for update skip locked;
  if selected_check is not null then
    update public.content_moderation_checks set consumed_at=now(),consumed_entity_id=target_entity where id=selected_check;
    return;
  end if;
  select o.id into selected_override from public.content_moderation_overrides o
  where o.actor_id=actor and o.campus_id=public.current_campus_id() and o.surface=target_surface and o.operation=target_operation
    and o.content_hash=wanted_hash and o.consumed_at is null and o.revoked_at is null and o.expires_at>now()
  order by o.created_at desc limit 1 for update skip locked;
  if selected_override is not null then
    update public.content_moderation_overrides set consumed_at=now(),consumed_entity_id=target_entity where id=selected_override;
    return;
  end if;
  raise exception 'moderation clearance required' using errcode='42501';
end $$;

create or replace function private.enforce_shared_text_moderation() returns trigger
language plpgsql security definer set search_path='' as $$
declare fields jsonb:='{}'::jsonb; surface text; operation text:=case when tg_op='INSERT' then 'create' else 'edit' end; entity uuid;
begin
  if auth.uid() is null then return new; end if;
  if session_user='postgres' and current_setting('ce.moderation_test_bypass',true)='on' then return new; end if;
  if current_setting('ce.moderation_system_seed',true)='on' then return new; end if;
  entity:=case when tg_op='INSERT' then null else (to_jsonb(new)->>'id')::uuid end;
  if tg_table_name='profiles' then
    surface:='profile';
    if tg_op='INSERT' then fields:=jsonb_build_object('username',new.handle,'displayName',new.display_name,'biography',new.bio,'academicField',new.academic_field,'interests',new.interests);
    else fields:=jsonb_strip_nulls(jsonb_build_object(
      'username',case when new.handle is distinct from old.handle then new.handle end,
      'displayName',case when new.display_name is distinct from old.display_name then new.display_name end,
      'biography',case when new.bio is distinct from old.bio then new.bio end,
      'academicField',case when new.academic_field is distinct from old.academic_field then new.academic_field end,
      'interests',case when new.interests is distinct from old.interests then to_jsonb(new.interests) end)); end if;
  elsif tg_table_name='listings' then surface:='listing'; fields:=case when tg_op='INSERT' then jsonb_build_object('title',new.title,'description',new.description) else jsonb_strip_nulls(jsonb_build_object('title',case when new.title is distinct from old.title then new.title end,'description',case when new.description is distinct from old.description then new.description end)) end;
  elsif tg_table_name='events' then surface:='event'; fields:=case when tg_op='INSERT' then jsonb_build_object('title',new.title,'description',new.description,'location',new.location) else jsonb_strip_nulls(jsonb_build_object('title',case when new.title is distinct from old.title then new.title end,'description',case when new.description is distinct from old.description then new.description end,'location',case when new.location is distinct from old.location then new.location end)) end;
  elsif tg_table_name='discussion_communities' then surface:='discussion_community'; fields:=case when tg_op='INSERT' then jsonb_build_object('slug',new.slug,'displayName',new.display_name,'description',new.description,'rules',new.rules) else jsonb_strip_nulls(jsonb_build_object('displayName',case when new.display_name is distinct from old.display_name then new.display_name end,'description',case when new.description is distinct from old.description then new.description end,'rules',case when new.rules is distinct from old.rules then new.rules end)) end;
  elsif tg_table_name='discussion_posts' then surface:='discussion_post'; fields:=case when tg_op='INSERT' then jsonb_build_object('title',new.title,'body',new.body) else jsonb_strip_nulls(jsonb_build_object('title',case when new.title is distinct from old.title then new.title end,'body',case when new.body is distinct from old.body then new.body end)) end;
  elsif tg_table_name='discussion_comments' then surface:='discussion_comment'; if tg_op='UPDATE' and (new.deleted_at is not null or new.removed_at is not null) then return new; end if; fields:=jsonb_build_object('body',new.body);
  elsif tg_table_name='organizations' then surface:='organization'; fields:=case when tg_op='INSERT' then jsonb_build_object('slug',new.slug,'name',new.name,'description',new.description) else jsonb_strip_nulls(jsonb_build_object('name',case when new.name is distinct from old.name then new.name end,'description',case when new.description is distinct from old.description then new.description end,'rules',case when new.rules is distinct from old.rules then new.rules end)) end;
  elsif tg_table_name='organization_categories' then surface:='organization_category'; fields:=jsonb_build_object('name',new.name);
  elsif tg_table_name='organization_channels' then surface:='organization_channel'; fields:=case when tg_op='INSERT' then jsonb_build_object('name',new.name,'description',new.description) else jsonb_strip_nulls(jsonb_build_object('name',case when new.name is distinct from old.name then new.name end,'description',case when new.description is distinct from old.description then new.description end)) end;
  elsif tg_table_name='organization_roles' then surface:='organization_role'; fields:=jsonb_build_object('name',new.name);
  elsif tg_table_name='organization_channel_messages' then surface:='organization_message'; if tg_op='UPDATE' and new.deleted_at is not null then return new; end if; fields:=jsonb_build_object('body',new.body);
  elsif tg_table_name='social_posts' then surface:='social_post'; if tg_op='UPDATE' and new.status in ('deleted','removed') then return new; end if; fields:=jsonb_build_object('body',new.body);
  elsif tg_table_name='social_comments' then surface:='social_comment'; if tg_op='UPDATE' and (new.deleted_at is not null or new.removed_at is not null) then return new; end if; fields:=jsonb_build_object('body',new.body);
  elsif tg_table_name='media_uploads' then surface:='media_alt_text'; fields:=jsonb_build_object('altText',new.alt_text);
  else raise exception 'unsupported moderation surface' using errcode='23514'; end if;
  if fields='{}'::jsonb or not exists(select 1 from jsonb_each(fields) where value<>to_jsonb(''::text) and value<>'null'::jsonb) then return new; end if;
  perform private.require_content_moderation(surface,operation,fields,entity);
  return new;
end $$;

create trigger profiles_shared_text_moderation before insert or update of handle,display_name,bio,academic_field,interests on public.profiles for each row execute function private.enforce_shared_text_moderation();
create trigger listings_shared_text_moderation before insert or update of title,description on public.listings for each row execute function private.enforce_shared_text_moderation();
create trigger events_shared_text_moderation before insert or update of title,description,location on public.events for each row execute function private.enforce_shared_text_moderation();
create trigger discussion_communities_shared_text_moderation before insert or update of display_name,description,rules on public.discussion_communities for each row execute function private.enforce_shared_text_moderation();
create trigger discussion_posts_shared_text_moderation before insert or update of title,body on public.discussion_posts for each row execute function private.enforce_shared_text_moderation();
create trigger discussion_comments_shared_text_moderation before insert or update of body on public.discussion_comments for each row execute function private.enforce_shared_text_moderation();
create trigger organizations_shared_text_moderation before insert or update of name,description,rules on public.organizations for each row execute function private.enforce_shared_text_moderation();
create trigger organization_categories_shared_text_moderation before insert or update of name on public.organization_categories for each row execute function private.enforce_shared_text_moderation();
create trigger organization_channels_shared_text_moderation before insert or update of name,description on public.organization_channels for each row execute function private.enforce_shared_text_moderation();
create trigger organization_roles_shared_text_moderation before insert or update of name on public.organization_roles for each row execute function private.enforce_shared_text_moderation();
create trigger organization_messages_shared_text_moderation before insert or update of body on public.organization_channel_messages for each row execute function private.enforce_shared_text_moderation();
create trigger social_posts_shared_text_moderation before insert or update of body on public.social_posts for each row execute function private.enforce_shared_text_moderation();
create trigger social_comments_shared_text_moderation before insert or update of body on public.social_comments for each row execute function private.enforce_shared_text_moderation();
create trigger media_alt_text_moderation before insert or update of alt_text on public.media_uploads for each row execute function private.enforce_shared_text_moderation();

create or replace function private.organizations_seed_workspace() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform set_config('ce.moderation_system_seed','on',true);
  perform private.seed_organization_workspace(new.id,new.created_by);
  perform set_config('ce.moderation_system_seed','off',true);
  return new;
end $$;

create or replace function public.request_content_moderation_review(target_check uuid,request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); selected public.content_moderation_checks; evidence_id uuid; report_id uuid;
begin
  select * into selected from public.content_moderation_checks where id=target_check and actor_id=actor and outcome in ('block','review') for update;
  if selected.id is null then raise exception 'moderation decision unavailable' using errcode='P0002'; end if;
  update public.content_moderation_evidence set review_requested_at=coalesce(review_requested_at,now()) where check_id=selected.id returning id into evidence_id;
  insert into public.reports(campus_id,subject_campus_id,platform_visible,reporter_id,target_type,target_id,reason,details,idempotency_key,source)
  values(selected.campus_id,selected.campus_id,false,actor,'automated_moderation',evidence_id,
    case when 'threat'=any(selected.categories) then 'unsafe' else 'harassment' end,'The affected member requested review of an automated text decision.',request_key,'user_review')
  on conflict(target_id) where target_type='automated_moderation' do update set idempotency_key=public.reports.idempotency_key returning id into report_id;
  return report_id;
end $$;
revoke execute on function public.request_content_moderation_review(uuid,uuid) from public,anon;
grant execute on function public.request_content_moderation_review(uuid,uuid) to authenticated;

create or replace function private.moderation_subject(target_case uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare c public.moderation_cases; result uuid;
begin
  select * into c from public.moderation_cases where id=target_case;
  if c.entity_type='profile' then result:=c.entity_id;
  elsif c.entity_type='listing' then select seller_id into result from public.listings where id=c.entity_id;
  elsif c.entity_type='event' then select organizer_id into result from public.events where id=c.entity_id;
  elsif c.entity_type='social_post' then select author_profile_id into result from public.social_posts where id=c.entity_id;
  elsif c.entity_type='social_comment' then select author_profile_id into result from public.social_comments where id=c.entity_id;
  elsif c.entity_type='discussion_post' then select author_id into result from public.discussion_posts where id=c.entity_id;
  elsif c.entity_type='discussion_comment' then select author_id into result from public.discussion_comments where id=c.entity_id;
  elsif c.entity_type='organization_message' then select author_profile_id into result from public.organization_channel_messages where id=c.entity_id;
  elsif c.entity_type='organization_membership' then select profile_id into result from public.organization_memberships where id=c.entity_id;
  elsif c.entity_type='organization' then select created_by into result from public.organizations where id=c.entity_id;
  elsif c.entity_type='automated_moderation' then select actor_id into result from public.content_moderation_evidence where id=c.entity_id;
  end if;
  return result;
end $$;

create or replace function public.moderate_automated_content_case(target_case uuid,chosen_action text,action_reason text,user_message text)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); selected public.moderation_cases; evidence public.content_moderation_evidence; action_id uuid; next_status public.moderation_case_status;
begin
  if chosen_action not in ('approve_content','uphold_block') or coalesce(char_length(trim(action_reason)),0)<3 or coalesce(char_length(trim(user_message)),0)<3 then raise exception 'complete moderation resolution required' using errcode='23514'; end if;
  select * into selected from public.moderation_cases where id=target_case and entity_type='automated_moderation' and private.can_access_moderation_case(id) for update;
  if selected.id is null then raise exception 'case unavailable' using errcode='P0002'; end if;
  select * into evidence from public.content_moderation_evidence where id=selected.entity_id for update;
  if chosen_action='approve_content' then
    insert into public.content_moderation_overrides(actor_id,campus_id,surface,operation,content_hash,case_id,approved_by)
    select c.actor_id,c.campus_id,c.surface,c.operation,c.content_hash,selected.id,caller from public.content_moderation_checks c where c.id=evidence.check_id;
    next_status:='dismissed';
  else next_status:='resolved'; end if;
  insert into public.moderation_actions(campus_id,report_id,case_id,moderator_id,subject_profile_id,target_type,target_id,action,reason,reversible,metadata)
  values(selected.subject_campus_id,selected.report_id,selected.id,caller,evidence.actor_id,'automated_moderation',evidence.id,chosen_action,trim(action_reason),chosen_action='approve_content',jsonb_build_object('contentHash',evidence.content_hash,'policyVersion',evidence.policy_version)) returning id into action_id;
  update public.moderation_cases set status=next_status,assigned_to=caller,user_visible_resolution=trim(user_message),resolved_at=now() where id=selected.id;
  update public.reports set status=case when next_status='dismissed' then 'dismissed'::public.report_status else 'resolved'::public.report_status end,assigned_to=caller,resolved_at=now() where id=selected.report_id;
  update public.content_moderation_evidence set purge_after=now()+interval '30 days' where id=evidence.id;
  insert into public.moderation_case_events(case_id,actor_id,event_type,note,metadata) values(selected.id,caller,'moderation.'||chosen_action,trim(action_reason),jsonb_build_object('actionId',action_id));
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata) values(selected.subject_campus_id,caller,'moderation.'||chosen_action,'automated_moderation',evidence.id::text,jsonb_build_object('caseId',selected.id,'actionId',action_id,'policyVersion',evidence.policy_version));
  insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
  values(selected.subject_campus_id,'moderation.entity_actioned',selected.id,jsonb_build_object('recipientId',evidence.actor_id,'actorId',caller,'caseId',selected.id,'action',chosen_action,'resolution',trim(user_message)),'moderation-automated:'||action_id) on conflict do nothing;
  return action_id;
end $$;
revoke execute on function public.moderate_automated_content_case(uuid,text,text,text) from public,anon;
grant execute on function public.moderate_automated_content_case(uuid,text,text,text) to authenticated;

create or replace function public.resolve_automated_moderation_appeal(target_appeal uuid,chosen_action text,internal_reason text,user_resolution text)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); selected public.moderation_appeals; selected_case public.moderation_cases; action_id uuid;
begin
  if chosen_action not in ('approve','reject') or coalesce(char_length(trim(internal_reason)),0)<3 or coalesce(char_length(trim(user_resolution)),0)<3 then raise exception 'complete appeal resolution required' using errcode='23514'; end if;
  select * into selected from public.moderation_appeals where id=target_appeal for update;
  select * into selected_case from public.moderation_cases where id=selected.case_id and entity_type='automated_moderation' and private.can_access_moderation_case(id) for update;
  if selected.id is null or selected_case.id is null or selected.status in ('granted','denied','withdrawn') then raise exception 'appeal unavailable' using errcode='P0002'; end if;
  action_id:=public.moderate_automated_content_case(selected_case.id,case when chosen_action='approve' then 'approve_content' else 'uphold_block' end,internal_reason,user_resolution);
  update public.moderation_appeals set status=case when chosen_action='approve' then 'granted' else 'denied' end,assigned_to=caller,resolution=trim(user_resolution),resolved_at=now() where id=selected.id;
  insert into public.moderation_case_events(case_id,actor_id,event_type,note,metadata) values(selected_case.id,caller,'moderation.appeal.'||chosen_action,trim(internal_reason),jsonb_build_object('appealId',selected.id,'actionId',action_id));
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata) values(selected_case.subject_campus_id,caller,'moderation.appeal.'||chosen_action,'moderation_appeal',selected.id::text,jsonb_build_object('caseId',selected_case.id,'actionId',action_id));
  return selected.id;
end $$;
revoke execute on function public.resolve_automated_moderation_appeal(uuid,text,text,text) from public,anon;
grant execute on function public.resolve_automated_moderation_appeal(uuid,text,text,text) to authenticated;

create or replace function public.purge_content_moderation_data(batch_size integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare redacted integer:=0; checks_deleted integer:=0;
begin
  if auth.uid() is not null then raise exception 'service context required' using errcode='42501'; end if;
  with due as (select id from public.content_moderation_evidence where purge_after<=now() and redacted_at is null order by purge_after limit least(greatest(batch_size,1),500) for update skip locked)
  update public.content_moderation_evidence e set protected_fields=null,redacted_at=now() from due where e.id=due.id;
  get diagnostics redacted=row_count;
  with due as (select id from public.content_moderation_checks where purge_after<=now() and not exists(select 1 from public.content_moderation_evidence e where e.check_id=content_moderation_checks.id and e.redacted_at is null) order by purge_after limit least(greatest(batch_size,1),500) for update skip locked)
  delete from public.content_moderation_checks c using due where c.id=due.id;
  get diagnostics checks_deleted=row_count;
  return jsonb_build_object('evidenceRedacted',redacted,'checksDeleted',checks_deleted);
end $$;
revoke execute on function public.purge_content_moderation_data(integer) from public,anon,authenticated;
grant execute on function public.purge_content_moderation_data(integer) to service_role;

-- Extend protected report snapshots without exposing moderation evidence.
create or replace function public.report_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.target_type='automated_moderation' then
    select jsonb_build_object('evidenceId',e.id,'actorId',e.actor_id,'surface',e.surface,'fields',e.protected_fields,'contentHash',e.content_hash,'categories',e.categories,'policyVersion',e.policy_version,'provider',e.provider,'model',e.model,'createdAt',e.created_at) into new.content_snapshot
    from public.content_moderation_evidence e where e.id=new.target_id and e.actor_id=new.reporter_id and e.campus_id=new.subject_campus_id;
  elsif new.target_type='listing' then select jsonb_build_object('listingId',l.id,'sellerId',l.seller_id,'title',l.title,'description',l.description,'status',l.status,'createdAt',l.created_at) into new.content_snapshot from public.listings l where l.id=new.target_id and l.deleted_at is null and private.content_is_visible(l.campus_id,l.visibility);
  elsif new.target_type='event' then select jsonb_build_object('eventId',e.id,'organizerId',e.organizer_id,'organizationId',e.organization_id,'title',e.title,'description',e.description,'location',e.location,'startsAt',e.starts_at,'cancelledAt',e.cancelled_at) into new.content_snapshot from public.events e where e.id=new.target_id and e.deleted_at is null and private.content_is_visible(e.campus_id,e.visibility);
  elsif new.target_type='message' then select jsonb_build_object('messageId',m.id,'senderId',m.sender_id,'body',m.body,'createdAt',m.created_at) into new.message_snapshot from public.messages m where m.id=new.target_id and public.is_conversation_participant(m.conversation_id);
  elsif new.target_type='conversation_request' then select jsonb_build_object('requestId',r.id,'senderId',r.requester_id,'recipientId',r.recipient_id,'openingMessage',r.opening_message,'createdAt',r.created_at) into new.message_snapshot from public.conversation_requests r where r.id=new.target_id and r.recipient_id=(select auth.uid());
  elsif new.target_type='organization_message' then select jsonb_build_object('messageId',m.id,'channelId',m.channel_id,'authorId',m.author_profile_id,'body',m.body,'createdAt',m.created_at) into new.message_snapshot from public.organization_channel_messages m where m.id=new.target_id and private.organization_channel_permission(m.channel_id,'view_channel');
  elsif new.target_type='community' then select jsonb_build_object('communityId',c.id,'slug',c.slug,'displayName',c.display_name,'description',c.description) into new.content_snapshot from public.discussion_communities c where c.id=new.target_id and c.campus_id=public.current_campus_id();
  elsif new.target_type='discussion_post' then select jsonb_build_object('postId',p.id,'communityId',p.community_id,'authorId',p.author_id,'title',p.title,'body',p.body,'linkUrl',p.link_url,'createdAt',p.created_at) into new.content_snapshot from public.discussion_posts p where p.id=new.target_id and p.campus_id=public.current_campus_id();
  elsif new.target_type='discussion_comment' then select jsonb_build_object('commentId',c.id,'communityId',c.community_id,'postId',c.post_id,'authorId',c.author_id,'body',c.body,'createdAt',c.created_at) into new.content_snapshot from public.discussion_comments c where c.id=new.target_id and c.campus_id=public.current_campus_id();
  elsif new.target_type='organization' then select jsonb_build_object('organizationId',o.id,'name',o.name,'description',o.description,'createdAt',o.created_at) into new.content_snapshot from public.organizations o where o.id=new.target_id and private.can_read_organization(o.id);
  elsif new.target_type='organization_channel' then select jsonb_build_object('channelId',c.id,'organizationId',c.organization_id,'name',c.name,'description',c.description,'channelType',c.channel_type) into new.content_snapshot from public.organization_channels c where c.id=new.target_id and private.organization_channel_permission(c.id,'view_channel');
  elsif new.target_type='organization_role' then select jsonb_build_object('roleId',r.id,'organizationId',r.organization_id,'name',r.name,'permissions',r.permissions) into new.content_snapshot from public.organization_roles r where r.id=new.target_id and private.organization_has_permission(r.organization_id,'view_organization');
  elsif new.target_type='organization_membership' then select jsonb_build_object('membershipId',m.id,'organizationId',m.organization_id,'profileId',m.profile_id,'role',m.role,'status',m.status) into new.content_snapshot from public.organization_memberships m where m.id=new.target_id and private.organization_has_permission(m.organization_id,'view_organization');
  elsif new.target_type='social_post' then select jsonb_build_object('postId',p.id,'authorId',p.author_profile_id,'organizationId',p.organization_id,'body',p.body,'createdAt',p.created_at) into new.content_snapshot from public.social_posts p where p.id=new.target_id and private.can_read_social_post(p.id);
  elsif new.target_type='social_comment' then select jsonb_build_object('commentId',c.id,'postId',c.post_id,'authorId',c.author_profile_id,'body',c.body,'createdAt',c.created_at) into new.content_snapshot from public.social_comments c where c.id=new.target_id and private.can_read_social_post(c.post_id);
  elsif new.target_type='profile' then select jsonb_build_object('profileId',p.id,'handle',p.handle,'displayName',p.display_name,'campusId',p.campus_id) into new.content_snapshot from public.profiles p where p.id=new.target_id and private.active_member(p.id) and not private.block_exists((select auth.uid()),p.id);
  elsif new.target_type='account_security' and new.target_id=(select auth.uid()) then new.content_snapshot:=jsonb_build_object('profileId',new.target_id,'submittedByAccountOwner',true);
  elsif new.target_type='institution' then select jsonb_build_object('campusId',c.id,'name',c.name,'status',c.status) into new.content_snapshot from public.campuses c where c.id=new.target_id;
  end if;
  if new.target_type in ('message','conversation_request','organization_message') and new.message_snapshot is null then raise exception 'message is not reportable' using errcode='42501'; end if;
  if new.target_type not in ('message','conversation_request','organization_message') and new.content_snapshot is null then raise exception 'content is not reportable' using errcode='42501'; end if;
  return new;
end $$;

revoke execute on function private.content_moderation_hash(text,text,jsonb),private.require_content_moderation(text,text,jsonb,uuid),private.enforce_shared_text_moderation() from public,anon,authenticated;
grant execute on function private.content_moderation_hash(text,text,jsonb) to service_role;
