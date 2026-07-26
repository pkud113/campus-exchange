-- Enable the already-deployed universal enrollment path. Platform admins retain
-- the AAL2-protected set_operational_setting() kill switch for forward rollback.
do $$
declare previous_value jsonb;
begin
  select value into previous_value
  from public.runtime_settings
  where key='universal_onboarding_enabled'
  for update;

  insert into public.runtime_settings(key,value,updated_at)
  values('universal_onboarding_enabled','true'::jsonb,now())
  on conflict (key) do update
    set value='true'::jsonb,updated_at=now();

  if previous_value is distinct from 'true'::jsonb then
    insert into public.audit_log(
      campus_id,actor_id,action,target_type,target_id,metadata
    ) values(
      null,null,'settings.rollout_enabled','runtime_setting',
      'universal_onboarding_enabled',
      jsonb_build_object(
        'before',previous_value,
        'after',true,
        'reason','Enable verified universal institution enrollment after protected production rollout',
        'source','20260725183814_enable_universal_onboarding_rollout'
      )
    );
  end if;
end $$;

-- A malformed, expired, forged, or mismatched universal grant must never fall
-- through to the legacy exact-domain trigger path while the rollout is enabled.
-- Requests without grant metadata retain the old path for forward-compatible
-- worker/web rollback and existing reviewed-domain registration.
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
declare universal_enabled boolean;
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

  universal_enabled:=coalesce((
    select value::text::boolean from public.runtime_settings
    where key='universal_onboarding_enabled'
  ),false);
  metadata_grant:=new.raw_user_meta_data->>'registrationGrantId';
  if metadata_grant is not null
    and metadata_grant ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    select * into grant_row from public.registration_enrollment_grants
    where id=metadata_grant::uuid for update;
    if grant_row.id is not null
      and grant_row.consumed_at is null
      and grant_row.expires_at>now()
      and grant_row.email_hash=normalized_hash
      and (grant_row.auth_user_id is null or grant_row.auth_user_id=new.id) then
      update public.registration_enrollment_grants
        set auth_user_id=new.id where id=grant_row.id;
      return new;
    end if;
  end if;

  if metadata_grant is not null and universal_enabled then
    raise exception 'invalid universal enrollment grant' using errcode='28000';
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
