-- Step 2C: universal verified-institution enrollment.
-- OTP metadata is only a transport for an opaque grant id. Every authorization
-- decision is repeated against the authenticated email in this trusted path.

create type public.membership_verification_basis as enum (
  'reviewed',
  'website_matched',
  'shared_selected',
  'explicit_selected',
  'legacy_reviewed'
);

alter table public.campuses
  add column timezone_source text not null default 'legacy'
    check (timezone_source in ('legacy','region_default','platform_override')),
  add column provisioned_from_institution_id text
    references public.institution_directory(id) on delete restrict,
  add column provisioned_at timestamptz;

create unique index campuses_provisioned_institution_idx
  on public.campuses(provisioned_from_institution_id)
  where provisioned_from_institution_id is not null;

update public.campuses c
set provisioned_from_institution_id=i.id,
    provisioned_at=coalesce(c.provisioned_at,c.created_at)
from public.institution_directory i
where i.campus_id=c.id and c.provisioned_from_institution_id is null;

create table public.registration_email_domain_denials (
  domain extensions.citext primary key,
  category text not null check (category in ('consumer','disposable')),
  source text not null check (char_length(source) between 2 and 200),
  created_at timestamptz not null default now(),
  check (
    lower(domain::text)=domain::text
    and domain::text ~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'
    and position('.' in domain::text)>0
  )
);

insert into public.registration_email_domain_denials(domain,category,source) values
  ('gmail.com','consumer','Campus Exchange maintained denylist'),
  ('googlemail.com','consumer','Campus Exchange maintained denylist'),
  ('yahoo.com','consumer','Campus Exchange maintained denylist'),
  ('outlook.com','consumer','Campus Exchange maintained denylist'),
  ('hotmail.com','consumer','Campus Exchange maintained denylist'),
  ('live.com','consumer','Campus Exchange maintained denylist'),
  ('msn.com','consumer','Campus Exchange maintained denylist'),
  ('icloud.com','consumer','Campus Exchange maintained denylist'),
  ('me.com','consumer','Campus Exchange maintained denylist'),
  ('aol.com','consumer','Campus Exchange maintained denylist'),
  ('protonmail.com','consumer','Campus Exchange maintained denylist'),
  ('proton.me','consumer','Campus Exchange maintained denylist'),
  ('mail.com','consumer','Campus Exchange maintained denylist'),
  ('gmx.com','consumer','Campus Exchange maintained denylist'),
  ('gmx.net','consumer','Campus Exchange maintained denylist'),
  ('yandex.com','consumer','Campus Exchange maintained denylist'),
  ('zoho.com','consumer','Campus Exchange maintained denylist'),
  ('fastmail.com','consumer','Campus Exchange maintained denylist'),
  ('hey.com','consumer','Campus Exchange maintained denylist'),
  ('mailinator.com','disposable','Campus Exchange maintained denylist'),
  ('guerrillamail.com','disposable','Campus Exchange maintained denylist'),
  ('10minutemail.com','disposable','Campus Exchange maintained denylist')
on conflict (domain) do nothing;

create table public.registration_enrollment_grants (
  id uuid primary key default gen_random_uuid(),
  institution_id text not null references public.institution_directory(id) on delete restrict,
  email_domain extensions.citext not null,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  requester_hash text not null check (requester_hash ~ '^[0-9a-f]{64}$'),
  assignment_basis public.membership_verification_basis not null,
  auth_user_id uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now()+interval '15 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at>created_at),
  check (consumed_at is null or consumed_at>=created_at),
  check (
    lower(email_domain::text)=email_domain::text
    and email_domain::text ~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'
    and position('.' in email_domain::text)>0
  )
);

create index registration_enrollment_grants_active_idx
  on public.registration_enrollment_grants(email_hash,expires_at)
  where consumed_at is null;
create index registration_enrollment_grants_cleanup_idx
  on public.registration_enrollment_grants(expires_at);

create table public.campus_membership_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete restrict,
  institution_id text not null references public.institution_directory(id) on delete restrict,
  email_domain extensions.citext not null,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  basis public.membership_verification_basis not null,
  grant_id uuid references public.registration_enrollment_grants(id) on delete set null,
  directory_source text not null,
  directory_source_year smallint not null check (directory_source_year between 1900 and 2200),
  verified_at timestamptz not null default now(),
  verified_until timestamptz not null default (now()+interval '1 year'),
  revoked_at timestamptz,
  revocation_reason text check (revocation_reason is null or char_length(revocation_reason) between 3 and 1000),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  check (verified_until>verified_at),
  check (revoked_at is null or revoked_at>=verified_at)
);

create unique index campus_membership_verifications_current_idx
  on public.campus_membership_verifications(profile_id)
  where revoked_at is null;
create index campus_membership_verifications_history_idx
  on public.campus_membership_verifications(profile_id,verified_at desc,id);
create index campus_membership_verifications_institution_idx
  on public.campus_membership_verifications(institution_id,verified_at desc);

alter table public.registration_email_domain_denials enable row level security;
alter table public.registration_enrollment_grants enable row level security;
alter table public.campus_membership_verifications enable row level security;

revoke all on table
  public.registration_email_domain_denials,
  public.registration_enrollment_grants,
  public.campus_membership_verifications
from public,anon,authenticated;
grant all on table
  public.registration_email_domain_denials,
  public.registration_enrollment_grants,
  public.campus_membership_verifications
to service_role;
grant select on public.runtime_settings to service_role;

create policy membership_verifications_self_read
on public.campus_membership_verifications
for select to authenticated
using (profile_id=(select auth.uid()));
grant select on public.campus_membership_verifications to authenticated;

insert into public.runtime_settings(key,value) values
  ('universal_onboarding_enabled','false'::jsonb),
  ('institution_network_discovery_enabled','true'::jsonb)
on conflict (key) do nothing;

create or replace function private.region_default_timezone(input_region text)
returns text
language sql immutable strict
set search_path='' as $$
  select case upper(input_region)
    when 'HI' then 'Pacific/Honolulu'
    when 'AK' then 'America/Anchorage'
    when 'WA' then 'America/Los_Angeles'
    when 'OR' then 'America/Los_Angeles'
    when 'CA' then 'America/Los_Angeles'
    when 'NV' then 'America/Los_Angeles'
    when 'AZ' then 'America/Phoenix'
    when 'CO' then 'America/Denver'
    when 'ID' then 'America/Denver'
    when 'MT' then 'America/Denver'
    when 'NM' then 'America/Denver'
    when 'UT' then 'America/Denver'
    when 'WY' then 'America/Denver'
    when 'ND' then 'America/Chicago'
    when 'SD' then 'America/Chicago'
    when 'NE' then 'America/Chicago'
    when 'KS' then 'America/Chicago'
    when 'OK' then 'America/Chicago'
    when 'TX' then 'America/Chicago'
    when 'MN' then 'America/Chicago'
    when 'IA' then 'America/Chicago'
    when 'MO' then 'America/Chicago'
    when 'AR' then 'America/Chicago'
    when 'LA' then 'America/Chicago'
    when 'WI' then 'America/Chicago'
    when 'IL' then 'America/Chicago'
    when 'MS' then 'America/Chicago'
    when 'AL' then 'America/Chicago'
    when 'TN' then 'America/Chicago'
    when 'MI' then 'America/Detroit'
    when 'IN' then 'America/Indiana/Indianapolis'
    when 'KY' then 'America/Kentucky/Louisville'
    when 'PR' then 'America/Puerto_Rico'
    else 'America/New_York'
  end
$$;

create or replace function private.registration_assignment_basis(
  selected_institution_id text,
  normalized_email_domain text
)
returns public.membership_verification_basis
language plpgsql stable security definer
set search_path='' as $$
declare selected public.institution_directory;
declare website_host text;
declare mapping_count integer;
begin
  select * into selected from public.institution_directory where id=selected_institution_id;
  if selected.id is null then raise exception 'institution unavailable' using errcode='P0002'; end if;

  if exists(
    select 1 from public.campus_email_domains d
    where d.institution_id=selected.id
      and lower(d.domain::text)=normalized_email_domain
      and d.review_status='reviewed'
      and d.domain_kind in ('student','institutional')
      and (d.review_expires_at is null or d.review_expires_at>now())
  ) then
    return 'reviewed';
  end if;

  select count(*) into mapping_count
  from public.campus_email_domains d
  where lower(d.domain::text)=normalized_email_domain
    and (d.domain_kind='shared' or d.review_status='ambiguous' or d.institution_id<>selected.id);
  if mapping_count>0 then return 'shared_selected'; end if;

  website_host := lower(regexp_replace(regexp_replace(coalesce(selected.website,''),'^https?://','','i'),'/.*$',''));
  website_host := regexp_replace(website_host,'^www\.','','i');
  if website_host<>'' and (
    normalized_email_domain=website_host
    or normalized_email_domain like '%.'||website_host
    or website_host like '%.'||normalized_email_domain
  ) then
    return 'website_matched';
  end if;
  return 'explicit_selected';
end $$;

create or replace function public.create_registration_enrollment_grant(
  selected_institution_id text,
  normalized_email_hash text,
  normalized_email_domain text,
  normalized_requester_hash text
)
returns table(
  grant_id uuid,
  assignment_basis public.membership_verification_basis,
  expires_at timestamptz
)
language plpgsql security definer
set search_path='' as $$
declare selected public.institution_directory;
declare normalized_domain text:=lower(trim(trailing '.' from trim(normalized_email_domain)));
declare selected_basis public.membership_verification_basis;
begin
  if not coalesce((
    select value::text::boolean from public.runtime_settings where key='universal_onboarding_enabled'
  ),false) then
    raise exception 'universal onboarding disabled' using errcode='42501';
  end if;
  if normalized_email_hash !~ '^[0-9a-f]{64}$'
    or normalized_requester_hash !~ '^[0-9a-f]{64}$'
    or normalized_domain !~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'
    or position('.' in normalized_domain)=0 then
    raise exception 'invalid enrollment identity' using errcode='22023';
  end if;
  if exists(
    select 1 from public.registration_email_domain_denials d
    where normalized_domain=d.domain::text or normalized_domain like '%.'||d.domain::text
  ) then
    raise exception 'consumer or disposable email domain denied' using errcode='42501';
  end if;
  select * into selected from public.institution_directory
  where id=selected_institution_id for share;
  if selected.id is null or selected.status<>'active' or selected.registration_status<>'open' then
    raise exception 'institution registration unavailable' using errcode='42501';
  end if;
  selected_basis:=private.registration_assignment_basis(selected.id,normalized_domain);
  return query
    insert into public.registration_enrollment_grants(
      institution_id,email_domain,email_hash,requester_hash,assignment_basis
    ) values(
      selected.id,normalized_domain,normalized_email_hash,normalized_requester_hash,selected_basis
    )
    returning id,registration_enrollment_grants.assignment_basis,registration_enrollment_grants.expires_at;
end $$;

revoke all on function public.create_registration_enrollment_grant(text,text,text,text)
  from public,anon,authenticated;
grant execute on function public.create_registration_enrollment_grant(text,text,text,text)
  to service_role;

create or replace function public.search_institution_directory_v2(
  search_query text default '',
  lifecycle_filter text default 'active',
  presence_filter text default 'any',
  after_cursor text default null,
  result_limit integer default 20
)
returns table(
  id text,
  name text,
  aliases text,
  city text,
  region text,
  status public.institution_directory_status,
  registration_status public.institution_registration_status,
  campus_id uuid,
  campus_slug text,
  campus_name text,
  campus_short_name text,
  campus_status public.campus_status,
  availability text,
  next_cursor text
)
language sql stable security definer
set search_path='' as $$
  with input as (
    select
      lower(trim(coalesce(search_query,''))) as query,
      case when lifecycle_filter in ('active','all') then lifecycle_filter else 'active' end as lifecycle,
      case when presence_filter in ('any','provisioned','unprovisioned') then presence_filter else 'any' end as presence,
      greatest(1,least(coalesce(result_limit,20),50)) as take,
      nullif(after_cursor,'') as cursor
  )
  select
    i.id,i.name,i.aliases,i.city,i.region,i.status,i.registration_status,
    c.id,c.slug::text,c.name,c.short_name,c.status,
    case
      when i.status='active' and i.registration_status='open' then 'available'
      when i.status='active' and i.registration_status='suspended' then 'paused'
      else 'closed'
    end,
    i.id
  from public.institution_directory i
  cross join input
  left join public.campuses c on c.id=i.campus_id
  where (input.lifecycle='all' or i.status='active')
    and (
      input.presence='any'
      or (input.presence='provisioned' and i.campus_id is not null)
      or (input.presence='unprovisioned' and i.campus_id is null)
    )
    and (
      input.query=''
      or lower(i.name) like '%'||input.query||'%'
      or lower(i.aliases) like '%'||input.query||'%'
      or lower(i.city||' '||i.region) like '%'||input.query||'%'
    )
    and (
      input.cursor is null
      or (i.name,i.id)>(
        coalesce((select cursor_row.name from public.institution_directory cursor_row where cursor_row.id=input.cursor),''),
        input.cursor
      )
    )
  order by i.name,i.id
  limit (select take from input)
$$;

revoke all on function public.search_institution_directory_v2(text,text,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.search_institution_directory_v2(text,text,text,text,integer)
  to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path='' as $$
declare matched_campus uuid;
declare resolution text;
declare staff_invite public.staff_invitations;
declare normalized_hash text;
declare grant_row public.registration_enrollment_grants;
declare metadata_grant text;
begin
  normalized_hash:=encode(extensions.digest(lower(new.email),'sha256'),'hex');
  select * into staff_invite from public.staff_invitations
    where email_hash=normalized_hash and claimed_at is null and expires_at>now()
    for update;
  if staff_invite.id is not null then
    insert into public.profiles(id,campus_id,status,account_kind,verified_at,verified_until)
      values(new.id,staff_invite.campus_id,'pending','staff',null,null);
    insert into public.role_assignments(profile_id,campus_id,role)
      values(new.id,staff_invite.campus_id,staff_invite.role);
    update public.staff_invitations set claimed_at=now() where id=staff_invite.id;
    insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
      values(staff_invite.campus_id,null,'role.provisioned','profile',new.id::text,
        jsonb_build_object('role',staff_invite.role,'invitationId',staff_invite.id));
    return new;
  end if;

  metadata_grant:=new.raw_user_meta_data->>'registrationGrantId';
  if metadata_grant is not null and metadata_grant ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select * into grant_row from public.registration_enrollment_grants
    where id=metadata_grant::uuid for update;
    if grant_row.id is not null
      and grant_row.consumed_at is null
      and grant_row.expires_at>now()
      and grant_row.email_hash=normalized_hash
      and (grant_row.auth_user_id is null or grant_row.auth_user_id=new.id) then
      update public.registration_enrollment_grants set auth_user_id=new.id where id=grant_row.id;
      return new;
    end if;
  end if;

  -- Forward-compatible rollback path for the existing reviewed-domain flow.
  select r.resolution,r.campus_id into resolution,matched_campus
    from private.resolve_registration_domain(split_part(new.email,'@',2)) r;
  if resolution<>'eligible' or matched_campus is null then
    raise exception 'school email domain is not eligible' using errcode='28000';
  end if;
  insert into public.profiles(id,campus_id,status,account_kind,verified_at,verified_until)
    values(new.id,matched_campus,'pending','student',null,null);
  insert into public.role_assignments(profile_id,campus_id,role)
    values(new.id,matched_campus,'student');
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(matched_campus,null,'role.provisioned','profile',new.id::text,
      jsonb_build_object('role','student','basis','legacy_reviewed'));
  return new;
end $$;

revoke all on function public.handle_new_user() from public,anon,authenticated;

create or replace function public.complete_registration_enrollment(enrollment_grant_id uuid)
returns table(
  institution_id text,
  institution_name text,
  campus_id uuid,
  campus_slug text,
  campus_name text,
  assignment_basis public.membership_verification_basis
)
language plpgsql security definer
set search_path='' as $$
declare caller uuid:=(select auth.uid());
declare auth_user auth.users;
declare grant_row public.registration_enrollment_grants;
declare institution_row public.institution_directory;
declare campus_row public.campuses;
declare profile_row public.profiles;
declare normalized_hash text;
declare candidate_slug text;
declare verification_id uuid;
declare prior_moderation_seed text:=current_setting('ce.moderation_system_seed',true);
begin
  if caller is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not coalesce((
    select value::text::boolean from public.runtime_settings where key='universal_onboarding_enabled'
  ),false) then
    raise exception 'universal onboarding disabled' using errcode='42501';
  end if;
  select * into auth_user from auth.users where id=caller;
  if auth_user.id is null or auth_user.email is null or auth_user.email_confirmed_at is null then
    raise exception 'confirmed auth email required' using errcode='42501';
  end if;
  normalized_hash:=encode(extensions.digest(lower(auth_user.email),'sha256'),'hex');
  select * into grant_row from public.registration_enrollment_grants
    where id=enrollment_grant_id for update;
  if grant_row.id is null or grant_row.consumed_at is not null or grant_row.expires_at<=now()
    or grant_row.email_hash<>normalized_hash
    or (grant_row.auth_user_id is not null and grant_row.auth_user_id<>caller) then
    raise exception 'invalid or expired enrollment grant' using errcode='42501';
  end if;
  if exists(
    select 1 from public.registration_email_domain_denials d
    where grant_row.email_domain::text=d.domain::text
      or grant_row.email_domain::text like '%.'||d.domain::text
  ) then
    raise exception 'email domain denied' using errcode='42501';
  end if;
  select * into institution_row from public.institution_directory
    where id=grant_row.institution_id for update;
  if institution_row.id is null or institution_row.status<>'active'
    or institution_row.registration_status<>'open' then
    raise exception 'institution registration unavailable' using errcode='42501';
  end if;

  select * into profile_row from public.profiles where id=caller for update;
  if profile_row.id is not null and profile_row.account_kind='student'
    and institution_row.campus_id is not null
    and profile_row.campus_id<>institution_row.campus_id then
    raise exception 'campus membership is immutable' using errcode='42501';
  end if;
  if profile_row.id is not null and profile_row.account_kind='staff' then
    update public.registration_enrollment_grants
      set auth_user_id=caller,consumed_at=now() where id=grant_row.id;
    return query
      select institution_row.id,institution_row.name,c.id,c.slug::text,c.name,grant_row.assignment_basis
      from public.campuses c where c.id=profile_row.campus_id;
    return;
  end if;

  if institution_row.campus_id is not null then
    select * into campus_row from public.campuses where id=institution_row.campus_id for update;
    if campus_row.status='suspended' then
      raise exception 'campus is suspended' using errcode='42501';
    end if;
    if campus_row.status='disabled' then
      update public.campuses set status='enabled' where id=campus_row.id
      returning * into campus_row;
    end if;
  else
    candidate_slug:=left(
      trim(both '-' from regexp_replace(lower(institution_row.name),'[^a-z0-9]+','-','g')),
      72
    )||'-'||institution_row.source_id;
    if exists(select 1 from public.campuses where slug=candidate_slug) then
      candidate_slug:=left(candidate_slug,71)||'-'||left(replace(gen_random_uuid()::text,'-',''),8);
    end if;
    insert into public.campuses(
      name,short_name,slug,city,region,country_code,timezone,status,
      timezone_source,provisioned_from_institution_id,provisioned_at
    ) values(
      institution_row.name,
      left(coalesce(nullif(split_part(replace(institution_row.aliases,'||','|'),'|',1),''),institution_row.name),120),
      candidate_slug,institution_row.city,institution_row.region,institution_row.country_code,
      private.region_default_timezone(institution_row.region),'enabled',
      'region_default',institution_row.id,now()
    ) returning * into campus_row;
    update public.institution_directory set campus_id=campus_row.id,updated_at=now()
      where id=institution_row.id;
  end if;

  if profile_row.id is not null and profile_row.campus_id<>campus_row.id then
    raise exception 'campus membership is immutable' using errcode='42501';
  end if;
  -- This trusted path creates only the empty profile shell. User-authored profile
  -- text is still required to pass the normal moderation clearance flow.
  perform set_config('ce.moderation_system_seed','on',true);
  insert into public.profiles(id,campus_id,status,account_kind,verified_at,verified_until)
    values(caller,campus_row.id,'pending','student',now(),now()+interval '1 year')
  on conflict (id) do update set
    verified_at=now(),verified_until=now()+interval '1 year'
  where public.profiles.campus_id=excluded.campus_id
    and public.profiles.account_kind='student';
  perform set_config('ce.moderation_system_seed',coalesce(prior_moderation_seed,''),true);
  if not found then raise exception 'campus membership is immutable' using errcode='42501'; end if;
  insert into public.role_assignments(profile_id,campus_id,role)
    values(caller,campus_row.id,'student')
  on conflict (profile_id,role) do nothing;

  update public.campus_membership_verifications
    set revoked_at=now(),revocation_reason='superseded by completed verification'
    where profile_id=caller and revoked_at is null;
  insert into public.campus_membership_verifications(
    profile_id,campus_id,institution_id,email_domain,email_hash,basis,grant_id,
    directory_source,directory_source_year,metadata
  ) values(
    caller,campus_row.id,institution_row.id,grant_row.email_domain,normalized_hash,
    grant_row.assignment_basis,grant_row.id,institution_row.source,institution_row.source_year,
    jsonb_build_object(
      'selectedUnitId',institution_row.source_id,
      'sharedDomain',grant_row.assignment_basis='shared_selected',
      'timezoneSource',campus_row.timezone_source
    )
  ) returning id into verification_id;
  update public.registration_enrollment_grants
    set auth_user_id=caller,consumed_at=now() where id=grant_row.id;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(campus_row.id,caller,'membership.verified','profile',caller::text,
      jsonb_build_object(
        'verificationId',verification_id,
        'institutionId',institution_row.id,
        'unitId',institution_row.source_id,
        'basis',grant_row.assignment_basis,
        'grantId',grant_row.id
      ));
  return query select
    institution_row.id,institution_row.name,campus_row.id,campus_row.slug::text,
    campus_row.name,grant_row.assignment_basis;
end $$;

revoke all on function public.complete_registration_enrollment(uuid)
  from public,anon;
grant execute on function public.complete_registration_enrollment(uuid)
  to authenticated;

create or replace function public.complete_onboarding(new_handle text)
returns void
language plpgsql security definer
set search_path='' as $$
declare selected public.profiles;
declare auth_user auth.users;
declare matched_campus uuid;
declare resolution text;
declare protected_verification public.campus_membership_verifications;
begin
  select * into selected from public.profiles where id=(select auth.uid()) for update;
  select * into auth_user from auth.users where id=(select auth.uid());
  if selected.id is null or auth_user.id is null then raise exception 'account not found' using errcode='P0002'; end if;
  if selected.status not in ('pending','active')
    or (select status from public.campuses where id=selected.campus_id)<>'enabled' then
    raise exception 'account is not eligible for onboarding' using errcode='42501';
  end if;
  if selected.onboarding_completed_at is not null and not selected.password_setup_required then
    raise exception 'onboarding already complete' using errcode='23514';
  end if;
  if auth_user.encrypted_password is null or auth_user.encrypted_password='' then
    raise exception 'password required' using errcode='23514';
  end if;
  if selected.account_kind='student' then
    select * into protected_verification
    from public.campus_membership_verifications
    where profile_id=selected.id and campus_id=selected.campus_id
      and revoked_at is null and verified_until>now()
      and email_hash=encode(extensions.digest(lower(auth_user.email),'sha256'),'hex')
    order by verified_at desc limit 1;
    if protected_verification.id is null then
      select r.resolution,r.campus_id into resolution,matched_campus
        from private.resolve_registration_domain(split_part(auth_user.email,'@',2)) r;
      if auth_user.email_confirmed_at is null or resolution<>'eligible'
        or matched_campus is null or matched_campus<>selected.campus_id then
        raise exception 'email verification required' using errcode='42501';
      end if;
    end if;
  end if;
  update public.profiles set
    handle=lower(new_handle),
    display_name=coalesce(display_name,lower(new_handle)),
    status=case when status='pending' then 'active'::public.profile_status else status end,
    verified_at=case when account_kind='student' then now() else verified_at end,
    verified_until=case when account_kind='student' then now()+interval '1 year' else verified_until end,
    onboarding_completed_at=now(),
    password_setup_required=false
  where id=(select auth.uid());
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(selected.campus_id,(select auth.uid()),'account.onboarding_completed','profile',
      (select auth.uid())::text,'{}'::jsonb);
end $$;

create or replace function public.reverify_student()
returns void
language plpgsql security definer
set search_path='' as $$
declare selected public.profiles;
declare auth_user auth.users;
declare prior_verification public.campus_membership_verifications;
declare institution_row public.institution_directory;
declare matched_campus uuid;
declare resolution text;
declare normalized_hash text;
begin
  select * into selected from public.profiles where id=(select auth.uid()) for update;
  select * into auth_user from auth.users where id=(select auth.uid());
  normalized_hash:=encode(extensions.digest(lower(auth_user.email),'sha256'),'hex');
  if selected.id is null or selected.account_kind<>'student' or selected.status<>'active'
    or selected.onboarding_completed_at is null or selected.password_setup_required
    or auth_user.email_confirmed_at is null then
    raise exception 'student re-verification unavailable' using errcode='42501';
  end if;
  select * into prior_verification
  from public.campus_membership_verifications
  where profile_id=selected.id and campus_id=selected.campus_id and revoked_at is null
    and email_hash=normalized_hash
  order by verified_at desc limit 1 for update;
  if prior_verification.id is null then
    select r.resolution,r.campus_id into resolution,matched_campus
      from private.resolve_registration_domain(split_part(auth_user.email,'@',2)) r;
    if resolution<>'eligible' or matched_campus is null or matched_campus<>selected.campus_id then
      raise exception 'student re-verification unavailable' using errcode='42501';
    end if;
    select * into institution_row from public.institution_directory
      where campus_id=selected.campus_id limit 1;
    if institution_row.id is not null then
      insert into public.campus_membership_verifications(
        profile_id,campus_id,institution_id,email_domain,email_hash,basis,
        directory_source,directory_source_year
      ) values(
        selected.id,selected.campus_id,institution_row.id,split_part(lower(auth_user.email),'@',2),
        normalized_hash,'legacy_reviewed',institution_row.source,institution_row.source_year
      );
    end if;
  else
    select * into institution_row from public.institution_directory
      where id=prior_verification.institution_id and status='active' and registration_status='open';
    if institution_row.id is null then
      raise exception 'institution registration unavailable' using errcode='42501';
    end if;
    update public.campus_membership_verifications
      set revoked_at=now(),revocation_reason='annual re-verification'
      where id=prior_verification.id;
    insert into public.campus_membership_verifications(
      profile_id,campus_id,institution_id,email_domain,email_hash,basis,
      directory_source,directory_source_year,metadata
    ) values(
      selected.id,selected.campus_id,prior_verification.institution_id,
      prior_verification.email_domain,normalized_hash,prior_verification.basis,
      institution_row.source,institution_row.source_year,
      jsonb_build_object('renewedFrom',prior_verification.id)
    );
  end if;
  update public.profiles set verified_at=now(),verified_until=now()+interval '1 year'
    where id=(select auth.uid());
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(selected.campus_id,(select auth.uid()),'account.reverified','profile',
      (select auth.uid())::text,'{}'::jsonb);
end $$;

revoke all on function public.complete_onboarding(text),public.reverify_student()
  from public,anon;
grant execute on function public.complete_onboarding(text),public.reverify_student()
  to authenticated;

create or replace function public.cleanup_expired_enrollment_artifacts(batch_limit integer default 200)
returns table(deleted_grants integer,deleted_orphan_users integer)
language plpgsql security definer
set search_path='' as $$
declare grant_count integer:=0;
declare orphan_count integer:=0;
begin
  with doomed as (
    select id from public.registration_enrollment_grants
    where consumed_at is null and expires_at<now()-interval '1 day'
    order by expires_at limit greatest(1,least(coalesce(batch_limit,200),1000))
  )
  delete from public.registration_enrollment_grants g
  using doomed where g.id=doomed.id;
  get diagnostics grant_count=row_count;

  with doomed as (
    select u.id from auth.users u
    where u.email_confirmed_at is null
      and u.created_at<now()-interval '1 day'
      and not exists(select 1 from public.profiles p where p.id=u.id)
      and coalesce(u.raw_user_meta_data->>'registrationGrantId','')
        ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    order by u.created_at
    limit greatest(1,least(coalesce(batch_limit,200),1000))
  )
  delete from auth.users u using doomed where u.id=doomed.id;
  get diagnostics orphan_count=row_count;
  return query select grant_count,orphan_count;
end $$;

revoke all on function public.cleanup_expired_enrollment_artifacts(integer)
  from public,anon,authenticated;
grant execute on function public.cleanup_expired_enrollment_artifacts(integer)
  to service_role;

do $$
begin
  if exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in (
        'registration_email_domain_denials',
        'registration_enrollment_grants',
        'campus_membership_verifications'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'Step 2C enrollment tables must retain RLS';
  end if;
  if private.region_default_timezone('MI')<>'America/Detroit' then
    raise exception 'Michigan timezone provenance is invalid';
  end if;
  if not exists(
    select 1 from public.institution_directory
    where id in ('ipeds:170976','ipeds:171137','ipeds:171146')
  ) then
    raise exception 'Michigan shared-domain institutions are incomplete';
  end if;
end $$;
