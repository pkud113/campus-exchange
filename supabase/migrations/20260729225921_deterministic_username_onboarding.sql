-- Immutable onboarding handles use a deterministic policy. Shared profile
-- fields and every publishable content surface continue to require the
-- fail-closed automated moderation clearance.

create or replace function private.normalize_onboarding_username(target_username text)
returns text
language sql immutable parallel safe
set search_path=''
as $$
  select lower(btrim(normalize(coalesce(target_username,''),NFKC)))
$$;

create or replace function private.onboarding_username_safety_reason(target_username text)
returns text
language plpgsql immutable parallel safe
set search_path=''
as $$
declare normalized text:=private.normalize_onboarding_username(target_username);
declare skeleton text;
begin
  if char_length(normalized)<3 or char_length(normalized)>24 then
    return 'invalid_length';
  end if;
  -- NFKC canonicalizes compatibility forms such as full-width ASCII. Any
  -- remaining non-ASCII code point, including mixed-script lookalikes and
  -- invisible formatting controls, is rejected rather than rewritten.
  if normalized!~'^[a-z0-9_]+$' then
    return 'unicode_confusable';
  end if;
  if normalized~'(^_|_$|__)' then
    return 'invalid_separators';
  end if;

  skeleton:=replace(normalized,'_','');
  skeleton:=translate(skeleton,'013457','oieast');
  skeleton:=regexp_replace(skeleton,'([a-z])\1{2,}',E'\\1','g');

  if normalized~'(^|_)(admin|administrator|api|campus|founder|help|helpdesk|mod|moderator|official|owner|root|security|staff|support|system|verified|www)($|_)'
    or skeleton=any(array[
      'admin','administrator','api','campus','founder','help','helpdesk','mod',
      'moderator','official','owner','root','security','staff','support','system',
      'verified','www','campusexchange','campusexchangeadmin',
      'campusexchangemoderator','campusexchangeofficial',
      'campusexchangesecurity','campusexchangestaff','campusexchangesupport'
    ]) then
    return 'reserved';
  end if;
  if skeleton~'^(official|verified|real)(msu|umich|campus|support|staff|admin|moderator)'
    or skeleton~'^(msu|umich|campus)(official|verified|support|staff|admin|moderator)$' then
    return 'impersonation';
  end if;
  if skeleton~'(fuck|shit|bitch|cunt|asshole|motherfucker|dickhead)' then
    return 'profanity';
  end if;
  if skeleton~'(nigger|faggot|kike|chink|spic|wetback|tranny|retard|killyourself|gasjews)' then
    return 'hateful_or_abusive';
  end if;
  return null;
end $$;

revoke all on function private.normalize_onboarding_username(text),
  private.onboarding_username_safety_reason(text)
from public,anon,authenticated;

create or replace function private.enforce_profile_text_moderation()
returns trigger
language plpgsql security definer
set search_path=''
as $$
declare actor uuid:=(select auth.uid());
declare fields jsonb:='{}'::jsonb;
declare operation text:=case when tg_op='INSERT' then 'create' else 'edit' end;
declare trusted_username text:=current_setting('ce.onboarding_username_validated',true);
begin
  if actor is null then return new; end if;
  if session_user='postgres' and current_setting('ce.moderation_test_bypass',true)='on' then return new; end if;
  if current_setting('ce.moderation_system_seed',true)='on' then return new; end if;

  -- The trusted onboarding RPC sets a transaction-local value only after the
  -- same deterministic checks below pass. The narrow transition and exact
  -- value checks prevent this exception from covering later profile edits.
  if tg_op='UPDATE'
    and trusted_username=actor::text||':'||new.handle::text
    and new.id=actor
    and old.onboarding_completed_at is null
    and new.onboarding_completed_at is not null
    and new.handle::text=private.normalize_onboarding_username(new.handle::text)
    and new.display_name is not distinct from coalesce(old.display_name,new.handle::text)
    and new.bio is not distinct from old.bio
    and new.academic_field is not distinct from old.academic_field
    and new.interests is not distinct from old.interests then
    return new;
  end if;

  if tg_op='INSERT' then
    fields:=jsonb_build_object(
      'username',new.handle,'displayName',new.display_name,'biography',new.bio,
      'academicField',new.academic_field,'interests',new.interests
    );
  else
    fields:=jsonb_strip_nulls(jsonb_build_object(
      'username',case when new.handle is distinct from old.handle then new.handle end,
      'displayName',case when new.display_name is distinct from old.display_name then new.display_name end,
      'biography',case when new.bio is distinct from old.bio then new.bio end,
      'academicField',case when new.academic_field is distinct from old.academic_field then new.academic_field end,
      'interests',case when new.interests is distinct from old.interests then to_jsonb(new.interests) end
    ));
  end if;
  if fields='{}'::jsonb
    or not exists(
      select 1 from jsonb_each(fields)
      where value<>to_jsonb(''::text) and value<>'null'::jsonb
    ) then
    return new;
  end if;
  perform private.require_content_moderation(
    'profile',operation,fields,case when tg_op='INSERT' then null else new.id end
  );
  return new;
end $$;

drop trigger if exists profiles_shared_text_moderation on public.profiles;
create trigger profiles_shared_text_moderation
before insert or update of handle,display_name,bio,academic_field,interests
on public.profiles
for each row execute function private.enforce_profile_text_moderation();

create or replace function public.complete_onboarding(new_handle text)
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
  else
    if lower(selected.handle::text)<>normalized_handle then
      raise exception 'username cannot be changed after onboarding' using errcode='23514';
    end if;
    -- Preserve existing usernames exactly; the new policy is not retroactive.
    normalized_handle:=selected.handle::text;
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

  perform set_config(
    'ce.onboarding_username_validated',
    (select auth.uid())::text||':'||normalized_handle,
    true
  );
  update public.profiles set
    handle=normalized_handle,
    display_name=coalesce(display_name,normalized_handle),
    status=case when status='pending' then 'active'::public.profile_status else status end,
    verified_at=case when account_kind='student' then now() else verified_at end,
    verified_until=case when account_kind='student' then now()+interval '1 year' else verified_until end,
    onboarding_completed_at=now(),
    password_setup_required=false
  where id=(select auth.uid());
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(selected.campus_id,(select auth.uid()),'account.onboarding_completed','profile',
      (select auth.uid())::text,jsonb_build_object('usernamePolicy','ce-username-2026-07-v1'));
end $$;

revoke all on function private.enforce_profile_text_moderation() from public,anon,authenticated;
revoke all on function public.complete_onboarding(text) from public,anon;
grant execute on function public.complete_onboarding(text) to authenticated;
