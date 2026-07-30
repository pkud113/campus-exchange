-- Final launch stabilization: exact moderation binding, atomic listing
-- transitions, scoped message idempotency, staff projections, and timezone
-- integrity.

alter table public.content_moderation_checks
  add column superseded_at timestamptz;

alter table public.content_moderation_overrides
  add column target_entity_id uuid;

update public.content_moderation_overrides o
set target_entity_id=c.target_entity_id
from public.moderation_cases mc
join public.content_moderation_evidence e on e.id=mc.entity_id
join public.content_moderation_checks c on c.id=e.check_id
where o.case_id=mc.id
  and o.target_entity_id is null;

-- Retire older equivalent unconsumed checks without deleting audit evidence.
with ranked as (
  select id,row_number() over(
    partition by actor_id,campus_id,surface,operation,content_hash,
      coalesce(target_entity_id,'00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(idempotency_key,'00000000-0000-0000-0000-000000000000'::uuid)
    order by created_at desc,id desc
  ) position
  from public.content_moderation_checks
  where consumed_at is null
)
update public.content_moderation_checks c
set superseded_at=now()
from ranked r
where r.id=c.id and r.position>1;

drop index if exists public.content_moderation_checks_match_idx;
create unique index content_moderation_checks_exact_unconsumed_idx
on public.content_moderation_checks(
  actor_id,campus_id,surface,operation,content_hash,
  coalesce(target_entity_id,'00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(idempotency_key,'00000000-0000-0000-0000-000000000000'::uuid)
)
where consumed_at is null and superseded_at is null;

drop index if exists public.content_moderation_overrides_match_idx;
create index content_moderation_overrides_exact_match_idx
on public.content_moderation_overrides(
  actor_id,campus_id,surface,operation,content_hash,target_entity_id,created_at desc
)
where consumed_at is null and revoked_at is null;

create or replace function public.record_content_moderation_check(
  target_actor uuid,target_campus uuid,target_surface text,target_operation text,
  target_hash text,target_outcome text,target_categories text[],
  target_provider text,target_model text,target_policy text,target_fields jsonb,
  target_entity uuid default null,target_key uuid default null,
  target_severe boolean default false
) returns uuid
language plpgsql security definer
set search_path='' as $$
declare result uuid;
declare evidence_id uuid;
declare created_report_id uuid;
declare reason text;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=target_actor
      and p.campus_id=target_campus
      and p.status='active'
  ) then
    raise exception 'active actor required' using errcode='42501';
  end if;
  if target_operation not in ('create','edit')
    or (target_operation='edit' and target_entity is null)
    or (target_operation='create' and target_entity is not null)
    or target_outcome not in ('allow','block','review')
    or target_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid moderation decision' using errcode='23514';
  end if;
  if private.content_moderation_hash(
    target_surface,target_operation,target_fields
  )<>target_hash then
    raise exception 'moderation hash mismatch' using errcode='23514';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_actor::text||':'||target_campus::text||':'||target_surface||':'||
    target_operation||':'||target_hash||':'||coalesce(target_entity::text,'')||
    ':'||coalesce(target_key::text,''),
    0
  ));
  update public.content_moderation_checks c
  set superseded_at=now()
  where c.actor_id=target_actor
    and c.campus_id=target_campus
    and c.surface=target_surface
    and c.operation=target_operation
    and c.content_hash=target_hash
    and c.target_entity_id is not distinct from target_entity
    and c.idempotency_key is not distinct from target_key
    and c.consumed_at is null
    and c.superseded_at is null
    and (
      c.expires_at<=now()
      or c.policy_version<>target_policy
      or c.outcome<>target_outcome::public.content_moderation_outcome
    );
  select c.id into result
  from public.content_moderation_checks c
  where c.actor_id=target_actor
    and c.campus_id=target_campus
    and c.surface=target_surface
    and c.operation=target_operation
    and c.content_hash=target_hash
    and c.policy_version=target_policy
    and c.outcome=target_outcome::public.content_moderation_outcome
    and c.target_entity_id is not distinct from target_entity
    and c.idempotency_key is not distinct from target_key
    and c.consumed_at is null
    and c.superseded_at is null
    and c.expires_at>now()
  order by c.created_at desc
  limit 1;

  if result is null then
    insert into public.content_moderation_checks(
      actor_id,campus_id,surface,operation,content_hash,outcome,categories,
      provider,model,policy_version,target_entity_id,idempotency_key,severe
    ) values(
      target_actor,target_campus,target_surface,target_operation,target_hash,
      target_outcome::public.content_moderation_outcome,
      coalesce(target_categories,'{}'),target_provider,target_model,target_policy,
      target_entity,target_key,target_severe
    )
    returning id into result;
  end if;

  if target_outcome<>'allow' then
    insert into public.content_moderation_evidence(
      check_id,actor_id,campus_id,surface,protected_fields,content_hash,
      categories,policy_version,provider,model
    ) values(
      result,target_actor,target_campus,target_surface,target_fields,target_hash,
      coalesce(target_categories,'{}'),target_policy,target_provider,target_model
    )
    on conflict(check_id) do nothing
    returning id into evidence_id;
    if evidence_id is null then
      select id into evidence_id
      from public.content_moderation_evidence
      where check_id=result;
    end if;
    if target_severe then
      reason:=case
        when 'threat'=any(coalesce(target_categories,'{}')) then 'unsafe'
        else 'harassment'
      end;
      insert into public.reports(
        campus_id,subject_campus_id,platform_visible,reporter_id,target_type,
        target_id,reason,details,idempotency_key,source
      ) values(
        target_campus,target_campus,false,target_actor,'automated_moderation',
        evidence_id,reason,'Automatically escalated high-confidence safety decision.',
        result,'automated'
      )
      on conflict(target_id) where target_type='automated_moderation'
      do nothing
      returning id into created_report_id;
      if created_report_id is null then
        select id into created_report_id
        from public.reports
        where target_type='automated_moderation' and target_id=evidence_id;
      end if;
      update public.moderation_cases
      set severity=case
        when 'threat'=any(coalesce(target_categories,'{}')) then
          'critical'::public.moderation_severity
        else 'high'::public.moderation_severity
      end
      where report_id=created_report_id;
    end if;
  end if;
  return result;
end $$;

create or replace function private.require_content_moderation(
  target_surface text,target_operation text,target_fields jsonb,
  target_entity uuid default null
) returns void
language plpgsql security definer
set search_path='' as $$
declare actor uuid:=(select auth.uid());
declare wanted_hash text;
declare selected_check uuid;
declare selected_override uuid;
declare target_key uuid:=nullif(
  current_setting('ce.moderation_idempotency_key',true),''
)::uuid;
begin
  if actor is null then return; end if;
  wanted_hash:=private.content_moderation_hash(
    target_surface,target_operation,target_fields
  );
  select c.id into selected_check
  from public.content_moderation_checks c
  where c.actor_id=actor
    and c.campus_id=public.current_campus_id()
    and c.surface=target_surface
    and c.operation=target_operation
    and c.content_hash=wanted_hash
    and c.outcome='allow'
    and c.idempotency_key is not distinct from target_key
    and c.consumed_at is null
    and c.superseded_at is null
    and c.expires_at>now()
    and (
      (target_operation='create' and c.target_entity_id is null)
      or (target_operation='edit' and c.target_entity_id=target_entity)
    )
  order by c.created_at desc
  limit 1
  for update skip locked;
  if selected_check is not null then
    update public.content_moderation_checks
    set consumed_at=now(),consumed_entity_id=target_entity
    where id=selected_check and consumed_at is null;
    if found then return; end if;
  end if;

  select o.id into selected_override
  from public.content_moderation_overrides o
  where o.actor_id=actor
    and o.campus_id=public.current_campus_id()
    and o.surface=target_surface
    and o.operation=target_operation
    and o.content_hash=wanted_hash
    and o.consumed_at is null
    and o.revoked_at is null
    and o.expires_at>now()
    and (
      (target_operation='create' and o.target_entity_id is null)
      or (target_operation='edit' and o.target_entity_id=target_entity)
    )
  order by o.created_at desc
  limit 1
  for update skip locked;
  if selected_override is not null then
    update public.content_moderation_overrides
    set consumed_at=now(),consumed_entity_id=target_entity
    where id=selected_override and consumed_at is null and revoked_at is null;
    if found then return; end if;
  end if;
  raise exception 'moderation clearance required' using errcode='42501';
end $$;

-- The row being published is the source of truth for a create idempotency key.
-- A small alphabetically-prior trigger makes that key available to the shared
-- enforcement trigger without changing every application write contract.
create or replace function private.set_moderation_idempotency_context()
returns trigger
language plpgsql security definer
set search_path='' as $$
begin
  perform set_config(
    'ce.moderation_idempotency_key',
    case
      when tg_op='INSERT' then
        coalesce(to_jsonb(new)->>'idempotency_key','')
      else ''
    end,
    true
  );
  return new;
end $$;

create trigger a_moderation_idempotency_context
before insert or update on public.profiles
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.listings
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.events
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.discussion_communities
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.discussion_posts
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.discussion_comments
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.organizations
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.organization_categories
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.organization_channels
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.organization_roles
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.organization_channel_messages
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.social_posts
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.social_comments
for each row execute function private.set_moderation_idempotency_context();
create trigger a_moderation_idempotency_context
before insert or update on public.media_uploads
for each row execute function private.set_moderation_idempotency_context();

revoke all on function private.set_moderation_idempotency_context()
from public,anon,authenticated;

create or replace function public.moderate_automated_content_case(
  target_case uuid,chosen_action text,action_reason text,user_message text
) returns uuid
language plpgsql security definer
set search_path='' as $$
declare caller uuid:=(select auth.uid());
declare selected public.moderation_cases;
declare evidence public.content_moderation_evidence;
declare action_id uuid;
declare next_status public.moderation_case_status;
begin
  if chosen_action not in ('approve_content','uphold_block')
    or coalesce(char_length(trim(action_reason)),0)<3
    or coalesce(char_length(trim(user_message)),0)<3 then
    raise exception 'complete moderation resolution required' using errcode='23514';
  end if;
  select * into selected
  from public.moderation_cases
  where id=target_case
    and entity_type='automated_moderation'
    and status not in ('resolved','dismissed')
    and private.can_access_moderation_case(id)
  for update;
  if selected.id is null then
    raise exception 'case unavailable' using errcode='P0002';
  end if;
  select * into evidence
  from public.content_moderation_evidence
  where id=selected.entity_id
  for update;
  if chosen_action='approve_content' then
    insert into public.content_moderation_overrides(
      actor_id,campus_id,surface,operation,content_hash,case_id,approved_by,
      target_entity_id
    )
    select c.actor_id,c.campus_id,c.surface,c.operation,c.content_hash,
      selected.id,caller,c.target_entity_id
    from public.content_moderation_checks c
    where c.id=evidence.check_id;
    next_status:='dismissed';
  else
    next_status:='resolved';
  end if;
  insert into public.moderation_actions(
    campus_id,report_id,case_id,moderator_id,subject_profile_id,target_type,
    target_id,action,reason,reversible,metadata
  ) values(
    selected.subject_campus_id,selected.report_id,selected.id,caller,
    evidence.actor_id,'automated_moderation',evidence.id,chosen_action,
    trim(action_reason),chosen_action='approve_content',
    jsonb_build_object(
      'contentHash',evidence.content_hash,
      'policyVersion',evidence.policy_version
    )
  )
  returning id into action_id;
  update public.moderation_cases
  set status=next_status,assigned_to=caller,
    user_visible_resolution=trim(user_message),resolved_at=now()
  where id=selected.id;
  update public.reports
  set status=case
      when next_status='dismissed' then 'dismissed'::public.report_status
      else 'resolved'::public.report_status
    end,
    assigned_to=caller,
    resolved_at=now()
  where id=selected.report_id;
  update public.content_moderation_evidence
  set purge_after=now()+interval '30 days'
  where id=evidence.id;
  insert into public.moderation_case_events(
    case_id,actor_id,event_type,note,metadata
  ) values(
    selected.id,caller,'moderation.'||chosen_action,trim(action_reason),
    jsonb_build_object('actionId',action_id)
  );
  insert into public.audit_log(
    campus_id,actor_id,action,target_type,target_id,metadata
  ) values(
    selected.subject_campus_id,caller,'moderation.'||chosen_action,
    'automated_moderation',evidence.id::text,
    jsonb_build_object(
      'caseId',selected.id,
      'actionId',action_id,
      'policyVersion',evidence.policy_version
    )
  );
  insert into public.outbox_events(
    campus_id,event_type,aggregate_id,payload,idempotency_key
  ) values(
    selected.subject_campus_id,'moderation.entity_actioned',selected.id,
    jsonb_build_object(
      'recipientId',evidence.actor_id,
      'actorId',caller,
      'caseId',selected.id,
      'action',chosen_action,
      'resolution',trim(user_message)
    ),
    'moderation-automated:'||action_id
  )
  on conflict do nothing;
  return action_id;
end $$;

create or replace function public.my_content_moderation_reviews()
returns table(
  check_id uuid,case_id uuid,surface text,operation text,categories text[],
  case_status public.moderation_case_status,user_visible_resolution text,
  review_requested_at timestamptz,resolved_at timestamptz,
  override_available boolean,override_consumed_at timestamptz,
  appeal_id uuid,appeal_status text
)
language sql stable security definer
set search_path='' as $$
  select c.id,mc.id,c.surface,c.operation,c.categories,mc.status,
    mc.user_visible_resolution,e.review_requested_at,mc.resolved_at,
    (o.id is not null and o.consumed_at is null and o.revoked_at is null
      and o.expires_at>now()),
    o.consumed_at,a.id,a.status
  from public.content_moderation_checks c
  join public.content_moderation_evidence e on e.check_id=c.id
  join public.reports r
    on r.target_type='automated_moderation' and r.target_id=e.id
  join public.moderation_cases mc on mc.report_id=r.id
  left join lateral(
    select x.id,x.consumed_at,x.revoked_at,x.expires_at
    from public.content_moderation_overrides x
    where x.case_id=mc.id
    order by x.created_at desc
    limit 1
  ) o on true
  left join lateral(
    select ma.id,ma.status::text
    from public.moderation_appeals ma
    where ma.case_id=mc.id and ma.appellant_id=(select auth.uid())
    order by ma.created_at desc
    limit 1
  ) a on true
  where c.actor_id=(select auth.uid())
    and e.review_requested_at is not null
  order by e.review_requested_at desc
  limit 50
$$;

revoke all on function public.my_content_moderation_reviews()
from public,anon;
grant execute on function public.my_content_moderation_reviews()
to authenticated;

create or replace function public.request_content_moderation_review(
  target_check uuid,request_key uuid
) returns uuid
language plpgsql security definer
set search_path='' as $$
declare actor uuid:=(select auth.uid());
declare selected public.content_moderation_checks;
declare evidence_id uuid;
declare created_report_id uuid;
declare case_id uuid;
begin
  select * into selected
  from public.content_moderation_checks
  where id=target_check
    and actor_id=actor
    and outcome in ('block','review')
    and not severe
  for update;
  if selected.id is null then
    raise exception 'moderation decision unavailable' using errcode='P0002';
  end if;
  update public.content_moderation_evidence
  set review_requested_at=coalesce(review_requested_at,now())
  where check_id=selected.id
  returning id into evidence_id;
  if evidence_id is null then
    raise exception 'moderation evidence unavailable' using errcode='P0002';
  end if;
  insert into public.reports(
    campus_id,subject_campus_id,platform_visible,reporter_id,target_type,
    target_id,reason,details,idempotency_key,source
  ) values(
    selected.campus_id,selected.campus_id,false,actor,
    'automated_moderation',evidence_id,'harassment',
    'The affected member requested review of an automated text decision.',
    request_key,'user_review'
  )
  on conflict(target_id) where target_type='automated_moderation'
  do update set idempotency_key=public.reports.idempotency_key
  returning id into created_report_id;
  select mc.id into case_id
  from public.moderation_cases mc
  where mc.report_id=created_report_id;
  if case_id is null then
    raise exception 'moderation case unavailable' using errcode='P0002';
  end if;
  return case_id;
end $$;

revoke all on function public.request_content_moderation_review(uuid,uuid)
from public,anon;
grant execute on function public.request_content_moderation_review(uuid,uuid)
to authenticated;

create or replace function public.moderation_pipeline_readiness()
returns jsonb
language plpgsql stable security definer
set search_path='' as $$
declare trigger_count integer;
declare digest_ok boolean;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  select count(*) into trigger_count
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_proc p on p.oid=t.tgfoid
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  where not t.tgisinternal
    and n.nspname='private'
    and p.proname in (
      'enforce_shared_text_moderation','enforce_profile_text_moderation'
    );
  digest_ok:=private.content_moderation_hash(
    'deployment_readiness','create',
    jsonb_build_object('text','Campus Exchange moderation readiness')
  ) ~ '^[0-9a-f]{64}$';
  perform 1 from public.content_moderation_checks limit 1;
  perform 1 from public.content_moderation_evidence limit 1;
  perform 1 from public.content_moderation_overrides limit 1;
  return jsonb_build_object(
    'database',true,
    'hash',digest_ok,
    'binding',trigger_count>=14,
    'recording',true
  );
end $$;

revoke all on function public.moderation_pipeline_readiness()
from public,anon,authenticated;
grant execute on function public.moderation_pipeline_readiness()
to service_role;

create table public.listing_transition_requests (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete restrict,
  listing_id uuid not null references public.listings(id) on delete restrict,
  idempotency_key uuid not null,
  expected_status public.listing_status not null,
  requested_status public.listing_status not null,
  requested_buyer_id uuid references public.profiles(id) on delete restrict,
  result_status public.listing_status not null,
  created_at timestamptz not null default now(),
  unique(actor_id,idempotency_key)
);
alter table public.listing_transition_requests enable row level security;
revoke all on public.listing_transition_requests from public,anon,authenticated;
grant all on public.listing_transition_requests to service_role;

create or replace function public.transition_listing(
  target_listing uuid,expected_status public.listing_status,
  requested_status public.listing_status,requested_buyer uuid,
  request_key uuid
) returns public.listings
language plpgsql security definer
set search_path='' as $$
declare caller uuid:=(select auth.uid());
declare selected public.listings;
declare prior_request public.listing_transition_requests;
begin
  if caller is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    caller::text||':'||request_key::text,0
  ));
  select * into prior_request
  from public.listing_transition_requests
  where actor_id=caller and idempotency_key=request_key;
  if prior_request.id is not null then
    if prior_request.listing_id<>target_listing
      or prior_request.expected_status<>expected_status
      or prior_request.requested_status<>requested_status
      or prior_request.requested_buyer_id is distinct from requested_buyer then
      raise exception 'idempotency key reused for another transition'
      using errcode='23514';
    end if;
    select * into selected
    from public.listings
    where id=prior_request.listing_id;
    return selected;
  end if;

  select * into selected
  from public.listings
  where id=target_listing
  for update;
  if selected.id is null or selected.deleted_at is not null then
    raise exception 'listing unavailable' using errcode='P0002';
  end if;
  if selected.seller_id<>caller then
    raise exception 'seller required' using errcode='42501';
  end if;
  if selected.status<>expected_status then
    raise exception 'stale listing state' using errcode='40001';
  end if;
  if (selected.status='draft' and requested_status not in ('active','withdrawn'))
    or (selected.status='active' and requested_status not in ('reserved','sold','withdrawn'))
    or (selected.status='reserved' and requested_status not in ('active','sold','withdrawn'))
    or selected.status in ('sold','withdrawn')
    or (requested_status in ('reserved','sold') and requested_buyer is null)
    or requested_buyer=caller then
    raise exception 'invalid listing transition' using errcode='23514';
  end if;

  update public.listings
  set status=requested_status,
    buyer_id=case
      when requested_status in ('reserved','sold') then requested_buyer
      else null
    end
  where id=target_listing and status=expected_status
  returning * into selected;
  if not found then
    raise exception 'stale listing state' using errcode='40001';
  end if;
  insert into public.listing_transition_requests(
    actor_id,listing_id,idempotency_key,expected_status,requested_status,
    requested_buyer_id,result_status
  ) values(
    caller,target_listing,request_key,expected_status,requested_status,
    requested_buyer,selected.status
  );
  insert into public.audit_log(
    campus_id,actor_id,action,target_type,target_id,metadata
  ) values(
    selected.campus_id,caller,'listing.status_changed','listing',
    selected.id::text,
    jsonb_build_object(
      'from',expected_status,
      'to',requested_status,
      'buyerId',requested_buyer,
      'idempotencyKey',request_key
    )
  );
  return selected;
end $$;

revoke all on function public.transition_listing(
  uuid,public.listing_status,public.listing_status,uuid,uuid
) from public,anon;
grant execute on function public.transition_listing(
  uuid,public.listing_status,public.listing_status,uuid,uuid
) to authenticated;

alter table public.messages
  drop constraint if exists messages_sender_id_idempotency_key_key;
create unique index messages_conversation_sender_idempotency_idx
on public.messages(conversation_id,sender_id,idempotency_key);

create or replace function public.admin_user_directory(
  search_term text default '',
  after_created timestamptz default null,
  after_id uuid default null,
  result_limit integer default 50
) returns table(
  id uuid,handle text,display_name text,status public.profile_status,
  account_kind public.account_kind,verified_until timestamptz,
  restricted_until timestamptz,campus_id uuid,campus_name text,
  campus_short_name text,institution_id text,created_at timestamptz
)
language sql stable security definer
set search_path='' as $$
  select p.id,p.handle::text,p.display_name,p.status,p.account_kind,
    p.verified_until,p.restricted_until,p.campus_id,c.name,c.short_name,i.id,
    p.created_at
  from public.profiles p
  join public.campuses c on c.id=p.campus_id
  left join lateral (
    select candidate.id
    from public.institution_directory candidate
    where candidate.campus_id=p.campus_id
    order by
      (candidate.id=c.provisioned_from_institution_id) desc,
      candidate.id
    limit 1
  ) i on true
  where private.staff_has_capability('users.read',p.campus_id)
    and (
      trim(search_term)=''
      or p.handle::text ilike '%'||trim(search_term)||'%'
      or coalesce(p.display_name,'') ilike '%'||trim(search_term)||'%'
    )
    and (
      after_created is null
      or (p.created_at,p.id)<(after_created,after_id)
    )
  order by p.created_at desc,p.id desc
  limit least(greatest(coalesce(result_limit,50),1),100)
$$;

revoke all on function public.admin_user_directory(
  text,timestamptz,uuid,integer
) from public,anon;
grant execute on function public.admin_user_directory(
  text,timestamptz,uuid,integer
) to authenticated;

-- Campus moderators need the safe user projection for case investigation but
-- still do not receive users.restrict or direct profile-table privileges.
create or replace function private.staff_has_capability(
  required_capability public.staff_capability,
  target_campus uuid default null,
  actor uuid default auth.uid()
)
returns boolean
language sql stable security definer
set search_path='' as $$
  select coalesce(auth.jwt()->>'aal','')='aal2'
    and exists(
      select 1 from public.profiles p
      where p.id=actor and p.status='active'
    )
    and (
      exists(
        select 1 from public.platform_role_assignments pra
        where pra.profile_id=actor and pra.role='admin'
      )
      or (
        exists(
          select 1 from public.platform_role_assignments pra
          where pra.profile_id=actor and pra.role='moderator'
        )
        and required_capability in (
          'users.read','users.restrict','cases.read','cases.act',
          'content.read','content.act','appeals.act','audit.read',
          'institutions.read'
        )
      )
      or (
        target_campus is not null
        and target_campus=private.staff_campus_id(actor)
        and (
          (
            exists(
              select 1 from public.role_assignments ra
              where ra.profile_id=actor
                and ra.campus_id=private.staff_campus_id(actor)
                and ra.role='admin'
            )
            and required_capability in (
              'institutions.read','users.read','users.restrict',
              'cases.read','cases.act','content.read','content.act',
              'appeals.act','audit.read','campus_moderators.manage'
            )
          )
          or (
            exists(
              select 1 from public.role_assignments ra
              where ra.profile_id=actor
                and ra.campus_id=private.staff_campus_id(actor)
                and ra.role='moderator'
            )
            and required_capability in (
              'users.read','cases.read','cases.act','content.read',
              'content.act','appeals.act'
            )
          )
        )
      )
    )
$$;

create or replace function private.validate_campus_timezone()
returns trigger
language plpgsql security definer
set search_path='' as $$
begin
  if not exists(
    select 1 from pg_catalog.pg_timezone_names
    where name=new.timezone
  ) then
    raise exception 'invalid IANA timezone' using errcode='22023';
  end if;
  return new;
end $$;

-- Repair invalid legacy values without deleting campus data and preserve the
-- prior value in the audit log.
insert into public.audit_log(
  campus_id,actor_id,action,target_type,target_id,metadata
)
select c.id,null,'campus.timezone_repaired','campus',c.id::text,
  jsonb_build_object('previousTimezone',c.timezone,'replacement','UTC')
from public.campuses c
where not exists(
  select 1 from pg_catalog.pg_timezone_names z where z.name=c.timezone
);
update public.campuses c
set timezone='UTC',timezone_source='invalid_repaired'
where not exists(
  select 1 from pg_catalog.pg_timezone_names z where z.name=c.timezone
);

drop trigger if exists campuses_timezone_guard on public.campuses;
drop trigger if exists campuses_validate_timezone on public.campuses;
create trigger campuses_validate_timezone
before insert or update of timezone on public.campuses
for each row execute function private.validate_campus_timezone();

revoke all on function private.validate_campus_timezone()
from public,anon,authenticated;
