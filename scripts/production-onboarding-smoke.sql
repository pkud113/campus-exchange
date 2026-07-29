begin;

do $production_smoke$
declare msu_user uuid:=gen_random_uuid();
declare aamu_user uuid:=gen_random_uuid();
declare duplicate_user uuid:=gen_random_uuid();
declare msu_email text:='ce.production.smoke.'||replace(msu_user::text,'-','')||'@msu.edu';
declare aamu_email text:='ce.production.smoke.'||replace(aamu_user::text,'-','')||'@aamu.edu';
declare msu_handle text:='ce_prod_msu_'||left(replace(msu_user::text,'-',''),8);
declare aamu_handle text:='ce_prod_aamu_'||left(replace(aamu_user::text,'-',''),8);
declare aamu_grant uuid;
declare expected_aamu_campus uuid;
begin
  if not coalesce((
    select value::text::boolean
    from public.runtime_settings
    where key='universal_onboarding_enabled'
  ),false) then
    raise exception 'production smoke requires universal onboarding';
  end if;

  -- Existing-campus verified student.
  insert into auth.users(
    id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
    raw_user_meta_data,aud,role
  ) values(
    msu_user,msu_email,'production-smoke-password-set',now(),'{}','{}',
    'authenticated','authenticated'
  );
  perform set_config('request.jwt.claim.sub',msu_user::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',msu_user,'role','authenticated','aal','aal1')::text,
    true
  );
  perform public.complete_onboarding(msu_handle);

  if not exists(
    select 1
    from public.profiles p
    join public.campuses c on c.id=p.campus_id
    where p.id=msu_user and p.handle=msu_handle and p.status='active'
      and p.onboarding_completed_at is not null and not p.password_setup_required
      and c.slug='michigan-state-university'
  ) then
    raise exception 'existing-campus onboarding smoke failed';
  end if;
  if not exists(
    select 1 from public.role_assignments
    where profile_id=msu_user and role='student'
  ) then
    raise exception 'existing-campus role provisioning smoke failed';
  end if;
  if exists(
    select 1 from public.content_moderation_checks where actor_id=msu_user
  ) then
    raise exception 'onboarding unexpectedly depended on shared moderation';
  end if;

  -- Non-launch enrollment grant, OTP-confirmed Auth state, lazy campus
  -- provisioning, protected membership, and final deterministic username.
  select grant_id into aamu_grant
  from public.create_registration_enrollment_grant(
    'ipeds:100654',
    encode(extensions.digest(lower(aamu_email),'sha256'),'hex'),
    'aamu.edu',
    encode(extensions.digest('production-onboarding-smoke','sha256'),'hex')
  );
  insert into auth.users(
    id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
    raw_user_meta_data,aud,role
  ) values(
    aamu_user,aamu_email,'production-smoke-password-set',now(),'{}',
    jsonb_build_object('registrationGrantId',aamu_grant),
    'authenticated','authenticated'
  );
  perform set_config('request.jwt.claim.sub',aamu_user::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',aamu_user,'role','authenticated','aal','aal1')::text,
    true
  );
  perform * from public.complete_registration_enrollment(aamu_grant);
  perform public.complete_onboarding(aamu_handle);
  select campus_id into expected_aamu_campus
  from public.institution_directory where id='ipeds:100654';

  if expected_aamu_campus is null or not exists(
    select 1 from public.profiles
    where id=aamu_user and campus_id=expected_aamu_campus
      and handle=aamu_handle and status='active'
      and onboarding_completed_at is not null and not password_setup_required
  ) then
    raise exception 'non-launch onboarding smoke failed';
  end if;
  if not exists(
    select 1 from public.campus_membership_verifications
    where profile_id=aamu_user and campus_id=expected_aamu_campus
      and institution_id='ipeds:100654' and revoked_at is null
  ) then
    raise exception 'non-launch membership verification smoke failed';
  end if;

  if private.onboarding_username_safety_reason('admin')<>'reserved'
    or private.onboarding_username_safety_reason('f_u_c_k_you')<>'profanity'
    or private.onboarding_username_safety_reason('bad-name')<>'unicode_confusable'
    or private.onboarding_username_safety_reason('аdmin')<>'unicode_confusable' then
    raise exception 'rejected-username production smoke failed';
  end if;

  -- Duplicate detection is enforced by the same trusted RPC.
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  insert into auth.users(
    id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
    raw_user_meta_data,aud,role
  ) values(
    duplicate_user,
    'ce.production.smoke.'||replace(duplicate_user::text,'-','')||'@msu.edu',
    'production-smoke-password-set',now(),'{}','{}',
    'authenticated','authenticated'
  );
  perform set_config('request.jwt.claim.sub',duplicate_user::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',duplicate_user,'role','authenticated','aal','aal1')::text,
    true
  );
  begin
    perform public.complete_onboarding(msu_handle);
    raise exception 'duplicate username unexpectedly accepted';
  exception when unique_violation then
    null;
  end;

  -- Shared content still requires a recorded allowance. This models provider
  -- or recording unavailability at the trusted database boundary.
  perform set_config('request.jwt.claim.sub',msu_user::text,true);
  begin
    insert into public.listings(
      campus_id,seller_id,title,description,category,condition,price_cents,
      idempotency_key,visibility,exchange_methods,legacy_exchange_unspecified
    )
    select campus_id,id,'Unchecked production smoke listing',
      'This shared draft has no moderation clearance.','books','good',1000,
      gen_random_uuid(),'campus_only',
      array['campus_pickup']::public.listing_exchange_method[],false
    from public.profiles where id=msu_user;
    raise exception 'shared content unexpectedly published without moderation';
  exception when insufficient_privilege then
    if sqlerrm<>'moderation clearance required' then
      raise;
    end if;
  end;
end
$production_smoke$;

select jsonb_build_object(
  'status','ok',
  'service','production-onboarding-smoke',
  'usernamePolicy','ce-username-2026-07-v1',
  'rolledBack',true
) as result;

rollback;
