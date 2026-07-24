-- Step 2C administration control plane. All staff reads and writes use one
-- AAL2-aware capability resolver and campus scope is evaluated in the database.

create type public.staff_capability as enum (
  'institutions.read',
  'institutions.manage',
  'users.read',
  'users.restrict',
  'staff.manage',
  'cases.read',
  'cases.act',
  'content.read',
  'content.act',
  'appeals.act',
  'audit.read',
  'settings.manage',
  'campus_moderators.manage'
);
create type public.admin_operational_case_status as enum ('open','applied','reversed','failed');

create table public.admin_saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete cascade,
  section text not null check (section in (
    'institutions','users','staff','cases','appeals','social','discussions',
    'organizations','marketplace','events','audit','settings'
  )),
  name text not null check (char_length(name) between 2 and 80),
  filters jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_profile_id,section,name)
);
create trigger admin_saved_views_touch before update on public.admin_saved_views
for each row execute function public.touch_updated_at();

create table public.admin_operational_cases (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  capability public.staff_capability not null,
  action text not null check (char_length(action) between 3 and 80),
  target_type text not null check (char_length(target_type) between 2 and 60),
  target_id text not null check (char_length(target_id) between 1 and 160),
  reason text not null check (char_length(reason) between 10 and 2000),
  before_state jsonb not null,
  after_state jsonb,
  status public.admin_operational_case_status not null default 'open',
  idempotency_key uuid not null,
  reversed_at timestamptz,
  reversed_by uuid references public.profiles(id) on delete restrict,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) between 10 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(actor_id,idempotency_key)
);
create index admin_operational_cases_queue_idx
  on public.admin_operational_cases(status,created_at desc,id);
create index admin_operational_cases_subject_idx
  on public.admin_operational_cases(target_type,target_id,created_at desc);
create trigger admin_operational_cases_touch before update on public.admin_operational_cases
for each row execute function public.touch_updated_at();

create table public.operational_setting_definitions (
  key text primary key,
  value_type text not null check (value_type in ('boolean','integer','text')),
  description text not null check (char_length(description) between 10 and 500),
  minimum_integer integer,
  maximum_integer integer,
  created_at timestamptz not null default now(),
  check (
    value_type='integer'
    or (minimum_integer is null and maximum_integer is null)
  ),
  check (
    minimum_integer is null or maximum_integer is null
    or minimum_integer<=maximum_integer
  )
);

insert into public.operational_setting_definitions(
  key,value_type,description,minimum_integer,maximum_integer
) values
  ('universal_onboarding_enabled','boolean','Allow eligible institutions to use universal verified enrollment.',null,null),
  ('institution_network_discovery_enabled','boolean','Allow institution-scoped network discovery surfaces.',null,null),
  ('network_features_enabled','boolean','Allow cross-campus network content and social discovery.',null,null),
  ('message_request_daily_limit','integer','Maximum new message requests per profile each day.',1,100),
  ('message_request_decline_cooldown_days','integer','Cooldown after a declined message request.',1,365),
  ('auth_v2_enforced','boolean','Require the current password and onboarding authentication controls.',null,null)
on conflict (key) do nothing;

alter table public.admin_saved_views enable row level security;
alter table public.admin_operational_cases enable row level security;
alter table public.operational_setting_definitions enable row level security;
revoke all on
  public.admin_saved_views,
  public.admin_operational_cases,
  public.operational_setting_definitions
from public,anon,authenticated;
grant all on
  public.admin_saved_views,
  public.admin_operational_cases,
  public.operational_setting_definitions
to service_role;

create or replace function private.staff_campus_id(actor uuid default auth.uid())
returns uuid
language sql stable security definer
set search_path='' as $$
  select p.campus_id from public.profiles p
  where p.id=actor and p.status='active'
$$;

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
        (target_campus is not null and target_campus=private.staff_campus_id(actor))
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
              'cases.read','cases.act','content.read','content.act','appeals.act'
            )
          )
        )
      )
    )
$$;

create policy admin_saved_views_owner_read
on public.admin_saved_views
for select to authenticated
using (
  owner_profile_id=(select auth.uid())
  and private.staff_has_capability('cases.read',campus_id)
);
create policy admin_saved_views_owner_insert
on public.admin_saved_views
for insert to authenticated
with check (
  owner_profile_id=(select auth.uid())
  and private.staff_has_capability('cases.read',campus_id)
);
create policy admin_saved_views_owner_update
on public.admin_saved_views
for update to authenticated
using (
  owner_profile_id=(select auth.uid())
  and private.staff_has_capability('cases.read',campus_id)
)
with check (
  owner_profile_id=(select auth.uid())
  and private.staff_has_capability('cases.read',campus_id)
);
create policy admin_saved_views_owner_delete
on public.admin_saved_views
for delete to authenticated
using (
  owner_profile_id=(select auth.uid())
  and private.staff_has_capability('cases.read',campus_id)
);
create policy admin_operational_cases_scoped_read
on public.admin_operational_cases
for select to authenticated
using (private.staff_has_capability('audit.read',campus_id));
create policy operational_settings_staff_read
on public.operational_setting_definitions
for select to authenticated
using (private.staff_has_capability('settings.manage',null));

grant select,insert,update,delete on public.admin_saved_views to authenticated;
grant select on public.admin_operational_cases,public.operational_setting_definitions
  to authenticated;

create or replace function public.staff_access_context()
returns jsonb
language plpgsql stable security definer
set search_path='' as $$
declare actor uuid:=(select auth.uid());
declare campus uuid:=private.staff_campus_id(actor);
declare capabilities jsonb;
declare platform_role public.platform_role;
declare campus_role public.app_role;
begin
  if coalesce(auth.jwt()->>'aal','')<>'aal2' then
    raise exception 'AAL2 required' using errcode='42501';
  end if;
  select role into platform_role from public.platform_role_assignments
    where profile_id=actor order by role desc limit 1;
  select role into campus_role from public.role_assignments
    where profile_id=actor and campus_id=campus and role in ('moderator','admin')
    order by role desc limit 1;
  if platform_role is null and campus_role is null then
    raise exception 'staff access required' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(capability::text order by capability::text),'[]'::jsonb)
  into capabilities
  from unnest(enum_range(null::public.staff_capability)) capability
  where private.staff_has_capability(capability,campus,actor);
  return jsonb_build_object(
    'actorId',actor,
    'campusId',campus,
    'scope',case when platform_role is not null then 'platform' else 'campus' end,
    'platformRole',platform_role,
    'campusRole',campus_role,
    'capabilities',capabilities,
    'aal','aal2'
  );
end $$;

revoke all on function public.staff_access_context() from public,anon;
grant execute on function public.staff_access_context() to authenticated;

create or replace function public.staff_operator_directory(
  search_term text default '',
  target_campus uuid default null,
  result_limit integer default 20
)
returns table(
  profile_id uuid,handle text,display_name text,campus_id uuid,
  campus_name text,campus_short_name text,campus_role public.app_role,
  platform_role public.platform_role
)
language sql stable security definer
set search_path='' as $$
  select p.id,p.handle::text,p.display_name,p.campus_id,c.name,c.short_name,
    ra.role,pra.role
  from public.profiles p
  join public.campuses c on c.id=p.campus_id
  left join public.role_assignments ra
    on ra.profile_id=p.id and ra.role in ('moderator','admin')
  left join public.platform_role_assignments pra on pra.profile_id=p.id
  where private.staff_has_capability('cases.read',coalesce(target_campus,p.campus_id))
    and (target_campus is null or p.campus_id=target_campus)
    and (ra.profile_id is not null or pra.profile_id is not null)
    and (
      trim(search_term)=''
      or p.handle::text ilike '%'||trim(search_term)||'%'
      or coalesce(p.display_name,'') ilike '%'||trim(search_term)||'%'
    )
  order by coalesce(p.display_name,p.handle::text),p.id
  limit least(greatest(coalesce(result_limit,20),1),50)
$$;

revoke all on function public.staff_operator_directory(text,uuid,integer)
  from public,anon;
grant execute on function public.staff_operator_directory(text,uuid,integer)
  to authenticated;

create or replace function public.admin_institution_directory(
  search_term text default '',
  lifecycle_filter text default 'all',
  after_institution text default null,
  result_limit integer default 20
)
returns table(
  institution_id text,name text,city text,region text,
  status public.institution_directory_status,
  registration_status public.institution_registration_status,
  campus_id uuid,campus_status public.campus_status,
  member_count bigint,verification_count bigint,next_cursor text
)
language sql stable security definer
set search_path='' as $$
  select i.id,i.name,i.city,i.region,i.status,i.registration_status,
    c.id,c.status,
    (select count(*) from public.profiles p where p.campus_id=c.id),
    (select count(*) from public.campus_membership_verifications v where v.institution_id=i.id),
    i.id
  from public.institution_directory i
  left join public.campuses c on c.id=i.campus_id
  where private.staff_has_capability('institutions.read',c.id)
    and (lifecycle_filter='all' or i.status='active')
    and (
      trim(search_term)=''
      or i.name ilike '%'||trim(search_term)||'%'
      or i.aliases ilike '%'||trim(search_term)||'%'
      or (i.city||' '||i.region) ilike '%'||trim(search_term)||'%'
    )
    and (after_institution is null or i.id>after_institution)
  order by i.id
  limit least(greatest(coalesce(result_limit,20),1),50)
$$;

revoke all on function public.admin_institution_directory(text,text,text,integer)
  from public,anon;
grant execute on function public.admin_institution_directory(text,text,text,integer)
  to authenticated;

create or replace function private.can_access_moderation_case(
  target_case uuid,
  actor uuid default auth.uid()
)
returns boolean
language sql stable security definer
set search_path='' as $$
  select exists(
    select 1 from public.moderation_cases c
    where c.id=target_case
      and private.staff_has_capability('cases.read',c.subject_campus_id,actor)
  )
$$;

create or replace function public.admin_case_queue_v2(
  status_filter text default null,
  severity_filter text default null,
  institution_filter text default null,
  entity_filter text default null,
  assignee_filter uuid default null,
  after_created timestamptz default null,
  after_id uuid default null,
  result_limit integer default 25
)
returns table(
  id uuid,status public.moderation_case_status,
  severity public.moderation_severity,entity_type text,entity_id uuid,
  campus_id uuid,campus_name text,institution_id text,assigned_to uuid,
  related_subject_count bigint,appeal_count bigint,created_at timestamptz
)
language sql stable security definer
set search_path='' as $$
  select mc.id,mc.status,mc.severity,mc.entity_type,mc.entity_id,
    mc.subject_campus_id,c.name,i.id,mc.assigned_to,
    (
      select count(*) from public.moderation_cases related
      where related.entity_type=mc.entity_type and related.entity_id=mc.entity_id
    ),
    (select count(*) from public.moderation_appeals a where a.case_id=mc.id),
    mc.created_at
  from public.moderation_cases mc
  join public.campuses c on c.id=mc.subject_campus_id
  left join public.institution_directory i on i.campus_id=c.id
  where private.staff_has_capability('cases.read',mc.subject_campus_id)
    and (status_filter is null or mc.status::text=status_filter)
    and (severity_filter is null or mc.severity::text=severity_filter)
    and (institution_filter is null or i.id=institution_filter)
    and (entity_filter is null or mc.entity_type=entity_filter)
    and (assignee_filter is null or mc.assigned_to=assignee_filter)
    and (
      after_created is null
      or (mc.created_at,mc.id)<(after_created,after_id)
    )
  order by mc.created_at desc,mc.id desc
  limit least(greatest(coalesce(result_limit,25),1),100)
$$;

revoke all on function public.admin_case_queue_v2(
  text,text,text,text,uuid,timestamptz,uuid,integer
) from public,anon;
grant execute on function public.admin_case_queue_v2(
  text,text,text,text,uuid,timestamptz,uuid,integer
) to authenticated;

create or replace function private.admin_target_snapshot(
  selected_type text,
  selected_id text
)
returns table(target_campus uuid,snapshot jsonb)
language plpgsql stable security definer
set search_path='' as $$
declare parsed_id uuid;
begin
  if selected_type='institution' then
    return query
      select i.campus_id,jsonb_build_object(
        'status',i.status,'registrationStatus',i.registration_status,
        'campusStatus',c.status
      )
      from public.institution_directory i
      left join public.campuses c on c.id=i.campus_id
      where i.id=selected_id;
    return;
  end if;
  if selected_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return;
  end if;
  parsed_id:=selected_id::uuid;
  if selected_type='profile' then
    return query select p.campus_id,jsonb_build_object(
      'status',p.status,'restrictedUntil',p.restricted_until,
      'restrictionReason',p.restriction_reason
    ) from public.profiles p where p.id=parsed_id;
  elsif selected_type='listing' then
    return query select l.campus_id,jsonb_build_object(
      'status',l.status,'deletedAt',l.deleted_at,'deletedBy',l.deleted_by
    ) from public.listings l where l.id=parsed_id;
  elsif selected_type='event' then
    return query select e.campus_id,jsonb_build_object(
      'cancelledAt',e.cancelled_at,'deletedAt',e.deleted_at,'deletedBy',e.deleted_by
    ) from public.events e where e.id=parsed_id;
  elsif selected_type='organization' then
    return query select o.campus_id,jsonb_build_object(
      'status',o.status,'suspendedAt',o.suspended_at,'deletedAt',o.deleted_at
    ) from public.organizations o where o.id=parsed_id;
  elsif selected_type='social_post' then
    return query select s.campus_id,jsonb_build_object(
      'status',s.status,'removedAt',s.removed_at,'removedBy',s.removed_by,
      'removalReason',s.removal_reason
    ) from public.social_posts s where s.id=parsed_id;
  end if;
end $$;

create or replace function public.apply_admin_operational_action(
  selected_action text,
  selected_target_type text,
  selected_target_id text,
  submitted_reason text,
  request_key uuid
)
returns uuid
language plpgsql security definer
set search_path='' as $$
declare caller uuid:=(select auth.uid());
declare target_campus uuid;
declare prior jsonb;
declare after_snapshot jsonb;
declare required_capability public.staff_capability;
declare operational_case_id uuid;
declare parsed_id uuid;
begin
  if char_length(trim(submitted_reason))<10 then
    raise exception 'operational reason required' using errcode='23514';
  end if;
  select existing.id into operational_case_id
  from public.admin_operational_cases existing
  where existing.actor_id=caller and existing.idempotency_key=request_key;
  if operational_case_id is not null then return operational_case_id; end if;

  select snapshot.target_campus,snapshot.snapshot into target_campus,prior
  from private.admin_target_snapshot(selected_target_type,selected_target_id) snapshot;
  if prior is null then raise exception 'administrative target unavailable' using errcode='P0002'; end if;
  required_capability:=case
    when selected_target_type='institution' then 'institutions.manage'
    when selected_target_type='profile' then 'users.restrict'
    else 'content.act'
  end;
  if not private.staff_has_capability(required_capability,target_campus) then
    raise exception 'staff capability denied' using errcode='42501';
  end if;

  insert into public.admin_operational_cases(
    campus_id,actor_id,capability,action,target_type,target_id,reason,
    before_state,idempotency_key
  ) values(
    target_campus,caller,required_capability,selected_action,selected_target_type,
    selected_target_id,trim(submitted_reason),prior,request_key
  ) returning id into operational_case_id;

  if selected_target_type='institution' then
    if selected_action='suspend_registration' then
      update public.institution_directory set registration_status='suspended',updated_at=now()
        where id=selected_target_id;
    elsif selected_action='open_registration' then
      update public.institution_directory set registration_status='open',updated_at=now()
        where id=selected_target_id and status='active';
    elsif selected_action='suspend_campus' then
      update public.campuses set status='suspended'
        where id=(select campus_id from public.institution_directory where id=selected_target_id);
    elsif selected_action='enable_campus' then
      update public.campuses set status='enabled'
        where id=(select campus_id from public.institution_directory where id=selected_target_id)
          and status<>'suspended';
    else
      raise exception 'unsupported institution action' using errcode='23514';
    end if;
  else
    parsed_id:=selected_target_id::uuid;
    if selected_target_type='profile' and selected_action='suspend' then
      update public.profiles set status='suspended' where id=parsed_id and id<>caller;
    elsif selected_target_type='profile' and selected_action='restrict' then
      update public.profiles set
        restricted_until=now()+interval '7 days',
        restriction_reason=trim(submitted_reason)
      where id=parsed_id and id<>caller;
    elsif selected_target_type='profile' and selected_action='restore' then
      update public.profiles set status='active',restricted_until=null,restriction_reason=null
        where id=parsed_id;
    elsif selected_target_type='listing' and selected_action='remove' then
      update public.listings set status='withdrawn',deleted_at=coalesce(deleted_at,now()),
        deleted_by=caller where id=parsed_id and status<>'sold';
    elsif selected_target_type='event' and selected_action='remove' then
      update public.events set cancelled_at=coalesce(cancelled_at,now())
        where id=parsed_id;
    elsif selected_target_type='organization' and selected_action='suspend' then
      update public.organizations set status='suspended',suspended_at=coalesce(suspended_at,now())
        where id=parsed_id;
    elsif selected_target_type='organization' and selected_action='restore' then
      update public.organizations set status='active',suspended_at=null
        where id=parsed_id and deleted_at is null;
    elsif selected_target_type='social_post' and selected_action='remove' then
      update public.social_posts set status='removed',removed_at=coalesce(removed_at,now()),
        removed_by=caller,removal_reason=trim(submitted_reason)
        where id=parsed_id and status='active';
    elsif selected_target_type='social_post' and selected_action='restore' then
      update public.social_posts set status='active',removed_at=null,removed_by=null,
        removal_reason=null where id=parsed_id and status='removed';
    else
      raise exception 'unsupported administrative action' using errcode='23514';
    end if;
  end if;

  select current_state.snapshot into after_snapshot
  from private.admin_target_snapshot(selected_target_type,selected_target_id) current_state;
  update public.admin_operational_cases
    set status='applied',after_state=after_snapshot where id=operational_case_id;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(target_campus,caller,'admin.'||selected_action,selected_target_type,selected_target_id,
      jsonb_build_object('operationalCaseId',operational_case_id,'reason',trim(submitted_reason)));
  return operational_case_id;
end $$;

revoke all on function public.apply_admin_operational_action(text,text,text,text,uuid)
  from public,anon;
grant execute on function public.apply_admin_operational_action(text,text,text,text,uuid)
  to authenticated;

create or replace function public.reverse_admin_operational_action(
  target_case uuid,
  submitted_reason text,
  request_key uuid
)
returns uuid
language plpgsql security definer
set search_path='' as $$
declare caller uuid:=(select auth.uid());
declare selected public.admin_operational_cases;
declare parsed_id uuid;
begin
  if char_length(trim(submitted_reason))<10 then
    raise exception 'reversal reason required' using errcode='23514';
  end if;
  select * into selected from public.admin_operational_cases
    where id=target_case for update;
  if selected.id is null or selected.status<>'applied'
    or not private.staff_has_capability(selected.capability,selected.campus_id) then
    raise exception 'operational case is not reversible' using errcode='42501';
  end if;
  if selected.target_type='institution' then
    update public.institution_directory set
      registration_status=(selected.before_state->>'registrationStatus')::public.institution_registration_status,
      updated_at=now()
    where id=selected.target_id;
    update public.campuses set
      status=(selected.before_state->>'campusStatus')::public.campus_status
    where id=selected.campus_id and selected.before_state->>'campusStatus' is not null;
  else
    parsed_id:=selected.target_id::uuid;
    if selected.target_type='profile' then
      update public.profiles set
        status=(selected.before_state->>'status')::public.profile_status,
        restricted_until=(selected.before_state->>'restrictedUntil')::timestamptz,
        restriction_reason=selected.before_state->>'restrictionReason'
      where id=parsed_id;
    elsif selected.target_type='listing' then
      update public.listings set
        status=(selected.before_state->>'status')::public.listing_status,
        deleted_at=(selected.before_state->>'deletedAt')::timestamptz,
        deleted_by=(selected.before_state->>'deletedBy')::uuid
      where id=parsed_id;
    elsif selected.target_type='event' then
      update public.events set
        cancelled_at=(selected.before_state->>'cancelledAt')::timestamptz,
        deleted_at=(selected.before_state->>'deletedAt')::timestamptz,
        deleted_by=(selected.before_state->>'deletedBy')::uuid
      where id=parsed_id;
    elsif selected.target_type='organization' then
      update public.organizations set
        status=(selected.before_state->>'status')::public.organization_status,
        suspended_at=(selected.before_state->>'suspendedAt')::timestamptz,
        deleted_at=(selected.before_state->>'deletedAt')::timestamptz
      where id=parsed_id;
    elsif selected.target_type='social_post' then
      update public.social_posts set
        status=(selected.before_state->>'status')::public.social_post_status,
        removed_at=(selected.before_state->>'removedAt')::timestamptz,
        removed_by=(selected.before_state->>'removedBy')::uuid,
        removal_reason=selected.before_state->>'removalReason'
      where id=parsed_id;
    else
      raise exception 'target is not reversible' using errcode='23514';
    end if;
  end if;
  update public.admin_operational_cases set status='reversed',reversed_at=now(),
    reversed_by=caller,reversal_reason=trim(submitted_reason)
  where id=selected.id;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(selected.campus_id,caller,'admin.reversed',selected.target_type,selected.target_id,
      jsonb_build_object(
        'operationalCaseId',selected.id,'reason',trim(submitted_reason),
        'idempotencyKey',request_key
      ));
  return selected.id;
end $$;

revoke all on function public.reverse_admin_operational_action(uuid,text,uuid)
  from public,anon;
grant execute on function public.reverse_admin_operational_action(uuid,text,uuid)
  to authenticated;

create or replace function public.invite_campus_moderator(
  normalized_email_hash text,
  target_campus uuid,
  submitted_reason text,
  request_key uuid
)
returns uuid
language plpgsql security definer
set search_path='' as $$
declare caller uuid:=(select auth.uid());
declare invitation_id uuid;
begin
  if normalized_email_hash !~ '^[0-9a-f]{64}$'
    or char_length(trim(submitted_reason))<10 then
    raise exception 'valid invitation identity and reason required' using errcode='23514';
  end if;
  if not (
    private.staff_has_capability('staff.manage',target_campus)
    or private.staff_has_capability('campus_moderators.manage',target_campus)
  ) then
    raise exception 'staff capability denied' using errcode='42501';
  end if;
  insert into public.staff_invitations(
    email_hash,campus_id,role,invited_by,expires_at,claimed_at
  ) values(
    normalized_email_hash,target_campus,'moderator',caller,now()+interval '24 hours',null
  )
  on conflict(email_hash) do update set
    campus_id=excluded.campus_id,role='moderator',invited_by=caller,
    expires_at=excluded.expires_at,claimed_at=null
  returning id into invitation_id;
  insert into public.admin_operational_cases(
    campus_id,actor_id,capability,action,target_type,target_id,reason,
    before_state,after_state,status,idempotency_key
  ) values(
    target_campus,caller,
    case when private.staff_has_capability('staff.manage',target_campus)
      then 'staff.manage'::public.staff_capability
      else 'campus_moderators.manage'::public.staff_capability end,
    'invite','staff_invitation',invitation_id::text,trim(submitted_reason),
    '{}'::jsonb,jsonb_build_object('role','moderator','expiresAt',now()+interval '24 hours'),
    'applied',request_key
  ) on conflict(actor_id,idempotency_key) do nothing;
  return invitation_id;
end $$;

create or replace function public.revoke_campus_moderator(
  target_profile uuid,
  submitted_reason text,
  request_key uuid
)
returns uuid
language plpgsql security definer
set search_path='' as $$
declare caller uuid:=(select auth.uid());
declare campus uuid;
declare case_id uuid;
begin
  select campus_id into campus from public.role_assignments
  where profile_id=target_profile and role='moderator';
  if campus is null or char_length(trim(submitted_reason))<10
    or not (
      private.staff_has_capability('staff.manage',campus)
      or private.staff_has_capability('campus_moderators.manage',campus)
    ) then
    raise exception 'staff capability denied' using errcode='42501';
  end if;
  delete from public.role_assignments
    where profile_id=target_profile and campus_id=campus and role='moderator';
  insert into public.admin_operational_cases(
    campus_id,actor_id,capability,action,target_type,target_id,reason,
    before_state,after_state,status,idempotency_key
  ) values(
    campus,caller,
    case when private.staff_has_capability('staff.manage',campus)
      then 'staff.manage'::public.staff_capability
      else 'campus_moderators.manage'::public.staff_capability end,
    'revoke','staff_role',target_profile::text,trim(submitted_reason),
    jsonb_build_object('role','moderator'),'{}'::jsonb,'applied',request_key
  )
  on conflict(actor_id,idempotency_key) do update
    set idempotency_key=excluded.idempotency_key
  returning id into case_id;
  return case_id;
end $$;

revoke all on function public.invite_campus_moderator(text,uuid,text,uuid),
  public.revoke_campus_moderator(uuid,text,uuid)
from public,anon;
grant execute on function public.invite_campus_moderator(text,uuid,text,uuid),
  public.revoke_campus_moderator(uuid,text,uuid)
to authenticated;

create or replace function public.set_operational_setting(
  selected_key text,
  selected_value jsonb,
  submitted_reason text,
  request_key uuid
)
returns jsonb
language plpgsql security definer
set search_path='' as $$
declare caller uuid:=(select auth.uid());
declare definition public.operational_setting_definitions;
declare prior jsonb;
declare integer_value integer;
begin
  if not private.staff_has_capability('settings.manage',null) then
    raise exception 'platform administrator required' using errcode='42501';
  end if;
  if char_length(trim(submitted_reason))<10 then
    raise exception 'setting change reason required' using errcode='23514';
  end if;
  select * into definition from public.operational_setting_definitions
    where key=selected_key;
  if definition.key is null then
    raise exception 'setting is not allowlisted' using errcode='42501';
  end if;
  if definition.value_type='boolean' and jsonb_typeof(selected_value)<>'boolean' then
    raise exception 'setting requires a boolean' using errcode='23514';
  elsif definition.value_type='integer' then
    if jsonb_typeof(selected_value)<>'number' then
      raise exception 'setting requires an integer' using errcode='23514';
    end if;
    integer_value:=(selected_value#>>'{}')::integer;
    if integer_value<definition.minimum_integer or integer_value>definition.maximum_integer then
      raise exception 'setting integer is outside its allowlisted range' using errcode='23514';
    end if;
  elsif definition.value_type='text' and jsonb_typeof(selected_value)<>'string' then
    raise exception 'setting requires text' using errcode='23514';
  end if;
  select value into prior from public.runtime_settings where key=selected_key for update;
  insert into public.runtime_settings(key,value,updated_at)
    values(selected_key,selected_value,now())
  on conflict(key) do update set value=excluded.value,updated_at=now();
  insert into public.admin_operational_cases(
    campus_id,actor_id,capability,action,target_type,target_id,reason,
    before_state,after_state,status,idempotency_key
  ) values(
    null,caller,'settings.manage','update','operational_setting',selected_key,
    trim(submitted_reason),jsonb_build_object('value',prior),
    jsonb_build_object('value',selected_value),'applied',request_key
  ) on conflict(actor_id,idempotency_key) do nothing;
  return jsonb_build_object('key',selected_key,'value',selected_value);
end $$;

revoke all on function public.set_operational_setting(text,jsonb,text,uuid)
  from public,anon;
grant execute on function public.set_operational_setting(text,jsonb,text,uuid)
to authenticated;

create or replace function public.admin_operational_settings()
returns table(
  key text,label text,description text,value_type text,
  minimum_integer integer,maximum_integer integer,value jsonb
)
language sql stable security definer
set search_path='' as $$
  select d.key,initcap(replace(d.key,'_',' ')),d.description,d.value_type,
    d.minimum_integer,d.maximum_integer,s.value
  from public.operational_setting_definitions d
  left join public.runtime_settings s on s.key=d.key
  where private.staff_has_capability('settings.manage',null)
  order by d.key
$$;

revoke all on function public.admin_operational_settings() from public,anon;
grant execute on function public.admin_operational_settings() to authenticated;

create or replace function public.admin_audit_history(
  target_campus uuid default null,
  action_filter text default null,
  after_id bigint default null,
  result_limit integer default 50
)
returns table(
  id bigint,campus_id uuid,actor_id uuid,action text,target_type text,
  target_id text,metadata jsonb,created_at timestamptz
)
language sql stable security definer
set search_path='' as $$
  select a.id,a.campus_id,a.actor_id,a.action,a.target_type,a.target_id,
    a.metadata,a.created_at
  from public.audit_log a
  where private.staff_has_capability('audit.read',coalesce(target_campus,a.campus_id))
    and (target_campus is null or a.campus_id=target_campus)
    and (action_filter is null or a.action like action_filter||'%')
    and (after_id is null or a.id<after_id)
  order by a.id desc
  limit least(greatest(coalesce(result_limit,50),1),100)
$$;

revoke all on function public.admin_audit_history(uuid,text,bigint,integer)
  from public,anon;
grant execute on function public.admin_audit_history(uuid,text,bigint,integer)
  to authenticated;

-- The unified moderation surfaces inherit the centralized scope resolver.
drop policy if exists moderation_cases_scoped_staff_read on public.moderation_cases;
create policy moderation_cases_scoped_staff_read
on public.moderation_cases
for select to authenticated
using (private.staff_has_capability('cases.read',subject_campus_id));
drop policy if exists moderation_case_events_scoped_staff_read on public.moderation_case_events;
create policy moderation_case_events_scoped_staff_read
on public.moderation_case_events
for select to authenticated
using (exists(
  select 1 from public.moderation_cases c
  where c.id=case_id and private.staff_has_capability('cases.read',c.subject_campus_id)
));

revoke all on function private.staff_campus_id(uuid),
  private.staff_has_capability(public.staff_capability,uuid,uuid),
  private.admin_target_snapshot(text,text)
from public,anon,authenticated;
grant execute on function private.staff_campus_id(uuid),
  private.staff_has_capability(public.staff_capability,uuid,uuid),
  private.admin_target_snapshot(text,text)
to service_role;
grant execute on function private.staff_has_capability(public.staff_capability,uuid,uuid)
to authenticated;
grant usage on type public.staff_capability,public.admin_operational_case_status
  to authenticated,service_role;

do $$
begin
  if exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in (
        'admin_saved_views','admin_operational_cases','operational_setting_definitions'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'Step 2C administration tables must retain RLS';
  end if;
  if has_table_privilege(
    'authenticated','public.admin_operational_cases','INSERT'
  ) then
    raise exception 'administrative actions must use audited RPCs';
  end if;
  if has_table_privilege(
    'authenticated','public.runtime_settings','UPDATE'
  ) then
    raise exception 'runtime settings must use allowlisted audited RPCs';
  end if;
end $$;
