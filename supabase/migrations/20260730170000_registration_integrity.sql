-- Final launch stabilization: registration evidence, campus lifecycle, and
-- retry-safe onboarding validation.

create table public.institution_domain_pairings (
  institution_id text not null references public.institution_directory(id) on delete restrict,
  domain text not null check (
    domain=lower(domain)
    and domain ~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'
    and position('.' in domain)>0
  ),
  basis text not null check (basis in ('shared_reviewed')),
  review_status text not null default 'reviewed' check (review_status in ('reviewed','revoked')),
  source_url text not null check (source_url ~ '^https://'),
  reviewed_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revocation_reason text,
  primary key(institution_id,domain)
);

alter table public.institution_domain_pairings enable row level security;
revoke all on public.institution_domain_pairings from public,anon,authenticated;
grant all on public.institution_domain_pairings to service_role;

-- Preserve every existing reviewed shared-domain relationship as an explicit,
-- auditable institution/domain pairing.
insert into public.institution_domain_pairings(
  institution_id,domain,basis,review_status,source_url,reviewed_at
)
select d.institution_id,lower(d.domain::text),'shared_reviewed','reviewed',
  d.source_url,coalesce(d.reviewed_at,now())
from public.campus_email_domains d
where d.institution_id is not null
  and d.domain_kind='shared'
  and d.review_status='reviewed'
  and d.source_url ~ '^https://'
on conflict(institution_id,domain) do nothing;

-- U-M uses one centrally managed mailbox namespace across three separately
-- selected institutions. These reviewed pairings keep that legitimate shared
-- flow without treating arbitrary domains as institution evidence.
insert into public.institution_domain_pairings(
  institution_id,domain,basis,review_status,source_url
) values
  ('ipeds:170976','umich.edu','shared_reviewed','reviewed',
   'https://documentation.its.umich.edu/email'),
  ('ipeds:171137','umich.edu','shared_reviewed','reviewed',
   'https://umdearborn.edu/information-technology-services'),
  ('ipeds:171146','umich.edu','shared_reviewed','reviewed',
   'https://www.umflint.edu/its/')
on conflict(institution_id,domain) do update set
  review_status='reviewed',
  source_url=excluded.source_url,
  reviewed_at=now(),
  revoked_at=null,
  revocation_reason=null;

create or replace function private.registration_assignment_basis(
  selected_institution_id text,
  normalized_email_domain text
)
returns public.membership_verification_basis
language plpgsql stable security definer
set search_path='' as $$
declare selected public.institution_directory;
declare website_host text;
begin
  select * into selected
  from public.institution_directory
  where id=selected_institution_id;
  if selected.id is null then
    raise exception 'institution unavailable' using errcode='P0002';
  end if;

  if exists(
    select 1
    from public.campus_email_domains d
    where d.institution_id=selected.id
      and lower(d.domain::text)=normalized_email_domain
      and d.review_status='reviewed'
      and d.domain_kind in ('student','institutional')
      and (d.review_expires_at is null or d.review_expires_at>now())
  ) then
    return 'reviewed';
  end if;

  if exists(
    select 1
    from public.institution_domain_pairings p
    where p.institution_id=selected.id
      and p.domain=normalized_email_domain
      and p.basis='shared_reviewed'
      and p.review_status='reviewed'
      and p.revoked_at is null
  ) then
    return 'shared_selected';
  end if;

  website_host:=lower(regexp_replace(
    regexp_replace(coalesce(selected.website,''),'^https?://','','i'),
    '/.*$',''
  ));
  website_host:=regexp_replace(website_host,'^www\.','','i');
  if website_host<>'' and (
    normalized_email_domain=website_host
    or normalized_email_domain like '%.'||website_host
  ) then
    return 'website_matched';
  end if;

  raise exception 'institution domain review required' using errcode='42501';
end $$;

revoke all on function private.registration_assignment_basis(text,text)
from public,anon,authenticated;
grant execute on function private.registration_assignment_basis(text,text)
to service_role;

create or replace function public.preflight_onboarding(new_handle text)
returns void
language plpgsql security definer
set search_path='' as $$
declare selected public.profiles;
declare auth_user auth.users;
declare matched_campus uuid;
declare resolution text;
declare protected_verification public.campus_membership_verifications;
declare normalized_handle text:=private.normalize_onboarding_username(new_handle);
declare safety_reason text;
begin
  select * into selected
  from public.profiles
  where id=(select auth.uid())
  for update;
  select * into auth_user
  from auth.users
  where id=(select auth.uid());

  if selected.id is null or auth_user.id is null then
    raise exception 'account not found' using errcode='P0002';
  end if;
  if selected.status not in ('pending','active')
    or (select status from public.campuses where id=selected.campus_id)<>'enabled' then
    raise exception 'account is not eligible for onboarding' using errcode='42501';
  end if;
  if selected.onboarding_completed_at is not null and not selected.password_setup_required then
    raise exception 'onboarding already complete' using errcode='23514';
  end if;

  if selected.handle is null then
    safety_reason:=private.onboarding_username_safety_reason(new_handle);
    if safety_reason is not null then
      raise exception 'username rejected: %',safety_reason using errcode='22023';
    end if;
    if exists(
      select 1 from public.profiles
      where handle=normalized_handle and id<>selected.id
    ) then
      raise exception 'username already taken' using errcode='23505';
    end if;
  elsif lower(selected.handle::text)<>normalized_handle then
    raise exception 'username cannot be changed after onboarding' using errcode='23514';
  end if;

  if selected.account_kind='student' then
    select * into protected_verification
    from public.campus_membership_verifications
    where profile_id=selected.id
      and campus_id=selected.campus_id
      and revoked_at is null
      and verified_until>now()
      and email_hash=encode(extensions.digest(lower(auth_user.email),'sha256'),'hex')
    order by verified_at desc
    limit 1;
    if protected_verification.id is null then
      select r.resolution,r.campus_id
      into resolution,matched_campus
      from private.resolve_registration_domain(split_part(auth_user.email,'@',2)) r;
      if auth_user.email_confirmed_at is null
        or resolution<>'eligible'
        or matched_campus is null
        or matched_campus<>selected.campus_id then
        raise exception 'email verification required' using errcode='42501';
      end if;
    end if;
  end if;
end $$;

revoke all on function public.preflight_onboarding(text) from public,anon;
grant execute on function public.preflight_onboarding(text) to authenticated;

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
declare current_basis public.membership_verification_basis;
declare prior_moderation_seed text:=current_setting('ce.moderation_system_seed',true);
begin
  if caller is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  if not coalesce((
    select value::text::boolean
    from public.runtime_settings
    where key='universal_onboarding_enabled'
  ),false) then
    raise exception 'universal onboarding disabled' using errcode='42501';
  end if;

  select * into auth_user from auth.users where id=caller;
  if auth_user.id is null or auth_user.email is null
    or auth_user.email_confirmed_at is null then
    raise exception 'confirmed auth email required' using errcode='42501';
  end if;

  normalized_hash:=encode(extensions.digest(lower(auth_user.email),'sha256'),'hex');
  select * into grant_row
  from public.registration_enrollment_grants
  where id=enrollment_grant_id
  for update;
  if grant_row.id is null
    or grant_row.consumed_at is not null
    or grant_row.expires_at<=now()
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

  select * into institution_row
  from public.institution_directory
  where id=grant_row.institution_id
  for update;
  if institution_row.id is null
    or institution_row.status<>'active'
    or institution_row.registration_status<>'open' then
    raise exception 'institution registration unavailable' using errcode='42501';
  end if;

  -- Re-evaluate evidence at consumption so grants minted before a review
  -- revocation or this migration cannot bypass the current trust policy.
  current_basis:=private.registration_assignment_basis(
    institution_row.id,
    grant_row.email_domain::text
  );
  if grant_row.assignment_basis='explicit_selected'
    or current_basis<>grant_row.assignment_basis then
    raise exception 'institution domain review required' using errcode='42501';
  end if;

  select * into profile_row
  from public.profiles
  where id=caller
  for update;
  if profile_row.id is not null
    and profile_row.account_kind='student'
    and institution_row.campus_id is not null
    and profile_row.campus_id<>institution_row.campus_id then
    raise exception 'campus membership is immutable' using errcode='42501';
  end if;
  if profile_row.id is not null and profile_row.account_kind='staff' then
    update public.registration_enrollment_grants
    set auth_user_id=caller,consumed_at=now()
    where id=grant_row.id;
    return query
      select institution_row.id,institution_row.name,c.id,c.slug::text,c.name,
        grant_row.assignment_basis
      from public.campuses c
      where c.id=profile_row.campus_id;
    return;
  end if;

  if institution_row.campus_id is not null then
    select * into campus_row
    from public.campuses
    where id=institution_row.campus_id
    for update;
    if campus_row.status<>'enabled' then
      raise exception 'campus enrollment unavailable' using errcode='42501';
    end if;
  else
    candidate_slug:=left(
      trim(both '-' from regexp_replace(lower(institution_row.name),'[^a-z0-9]+','-','g')),
      72
    )||'-'||institution_row.source_id;
    if exists(select 1 from public.campuses where slug=candidate_slug) then
      candidate_slug:=left(candidate_slug,71)||'-'||
        left(replace(gen_random_uuid()::text,'-',''),8);
    end if;
    insert into public.campuses(
      name,short_name,slug,city,region,country_code,timezone,status,
      timezone_source,provisioned_from_institution_id,provisioned_at
    ) values(
      institution_row.name,
      left(coalesce(
        nullif(split_part(replace(institution_row.aliases,'||','|'),'|',1),''),
        institution_row.name
      ),120),
      candidate_slug,institution_row.city,institution_row.region,
      institution_row.country_code,
      private.region_default_timezone(institution_row.region),'enabled',
      'region_default',institution_row.id,now()
    )
    returning * into campus_row;
    update public.institution_directory
    set campus_id=campus_row.id,updated_at=now()
    where id=institution_row.id;
  end if;

  if profile_row.id is not null and profile_row.campus_id<>campus_row.id then
    raise exception 'campus membership is immutable' using errcode='42501';
  end if;
  perform set_config('ce.moderation_system_seed','on',true);
  insert into public.profiles(
    id,campus_id,status,account_kind,verified_at,verified_until
  ) values(
    caller,campus_row.id,'pending','student',now(),now()+interval '1 year'
  )
  on conflict(id) do update set
    verified_at=now(),
    verified_until=now()+interval '1 year'
  where public.profiles.campus_id=excluded.campus_id
    and public.profiles.account_kind='student';
  perform set_config(
    'ce.moderation_system_seed',
    coalesce(prior_moderation_seed,''),
    true
  );
  if not found then
    raise exception 'campus membership is immutable' using errcode='42501';
  end if;

  insert into public.role_assignments(profile_id,campus_id,role)
  values(caller,campus_row.id,'student')
  on conflict(profile_id,role) do nothing;
  update public.campus_membership_verifications
  set revoked_at=now(),revocation_reason='superseded by completed verification'
  where profile_id=caller and revoked_at is null;
  insert into public.campus_membership_verifications(
    profile_id,campus_id,institution_id,email_domain,email_hash,basis,grant_id,
    directory_source,directory_source_year,metadata
  ) values(
    caller,campus_row.id,institution_row.id,grant_row.email_domain,
    normalized_hash,grant_row.assignment_basis,grant_row.id,
    institution_row.source,institution_row.source_year,
    jsonb_build_object(
      'selectedUnitId',institution_row.source_id,
      'sharedDomain',grant_row.assignment_basis='shared_selected',
      'timezoneSource',campus_row.timezone_source
    )
  )
  returning id into verification_id;
  update public.registration_enrollment_grants
  set auth_user_id=caller,consumed_at=now()
  where id=grant_row.id;
  insert into public.audit_log(
    campus_id,actor_id,action,target_type,target_id,metadata
  ) values(
    campus_row.id,caller,'membership.verified','profile',caller::text,
    jsonb_build_object(
      'verificationId',verification_id,
      'institutionId',institution_row.id,
      'unitId',institution_row.source_id,
      'basis',grant_row.assignment_basis,
      'grantId',grant_row.id
    )
  );
  return query
    select institution_row.id,institution_row.name,campus_row.id,
      campus_row.slug::text,campus_row.name,grant_row.assignment_basis;
end $$;

revoke all on function public.complete_registration_enrollment(uuid)
from public,anon;
grant execute on function public.complete_registration_enrollment(uuid)
to authenticated;
