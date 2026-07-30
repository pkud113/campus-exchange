begin;

do $production_smoke$
declare msu_user uuid:=gen_random_uuid();
declare aamu_user uuid:=gen_random_uuid();
declare shared_user uuid:=gen_random_uuid();
declare unavailable_user uuid:=gen_random_uuid();
declare duplicate_user uuid:=gen_random_uuid();
declare msu_email text:='ce.production.smoke.'||replace(msu_user::text,'-','')||'@msu.edu';
declare aamu_email text:='ce.production.smoke.'||replace(aamu_user::text,'-','')||'@aamu.edu';
declare shared_email text:='ce.production.smoke.'||replace(shared_user::text,'-','')||'@umich.edu';
declare unavailable_email text:='ce.production.smoke.'||replace(unavailable_user::text,'-','')||'@aamu.edu';
declare msu_handle text:='ce_prod_msu_'||left(replace(msu_user::text,'-',''),8);
declare aamu_handle text:='ce_prod_aamu_'||left(replace(aamu_user::text,'-',''),8);
declare aamu_grant uuid;
declare shared_grant uuid;
declare unavailable_grant uuid;
declare expected_aamu_campus uuid;
declare expected_shared_campus uuid;
declare smoke_listing_id uuid:=gen_random_uuid();
declare smoke_listing_request uuid:=gen_random_uuid();
declare smoke_conversation_one uuid:=gen_random_uuid();
declare smoke_conversation_two uuid:=gen_random_uuid();
declare smoke_message_key uuid:=gen_random_uuid();
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
  perform public.preflight_onboarding(msu_handle);
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

  -- Reviewed shared-domain evidence remains valid for the selected U-M unit.
  select grant_id into shared_grant
  from public.create_registration_enrollment_grant(
    'ipeds:171137',
    encode(extensions.digest(lower(shared_email),'sha256'),'hex'),
    'umich.edu',
    encode(extensions.digest('production-shared-domain-smoke','sha256'),'hex')
  );
  if not exists(
    select 1 from public.registration_enrollment_grants
    where id=shared_grant and institution_id='ipeds:171137'
      and email_domain='umich.edu' and assignment_basis='shared_selected'
      and consumed_at is null and expires_at>now()
  ) then
    raise exception 'shared-domain enrollment evidence smoke failed';
  end if;

  -- Unknown pairings are review-required rather than enrollment evidence.
  begin
    perform * from public.create_registration_enrollment_grant(
      'ipeds:171137',
      encode(extensions.digest('student@unreviewed.example','sha256'),'hex'),
      'unreviewed.example',
      encode(extensions.digest('production-unknown-domain-smoke','sha256'),'hex')
    );
    raise exception 'unknown institution-domain pairing unexpectedly accepted';
  exception when insufficient_privilege then
    if sqlerrm<>'institution domain review required' then raise; end if;
  end;

  -- Enrollment cannot override a deliberate campus lifecycle state.
  select grant_id into unavailable_grant
  from public.create_registration_enrollment_grant(
    'ipeds:100654',
    encode(extensions.digest(lower(unavailable_email),'sha256'),'hex'),
    'aamu.edu',
    encode(extensions.digest('production-campus-lifecycle-smoke','sha256'),'hex')
  );
  insert into auth.users(
    id,email,encrypted_password,email_confirmed_at,raw_app_meta_data,
    raw_user_meta_data,aud,role
  ) values(
    unavailable_user,unavailable_email,'production-smoke-password-set',now(),'{}',
    jsonb_build_object('registrationGrantId',unavailable_grant),
    'authenticated','authenticated'
  );
  perform set_config('request.jwt.claim.sub',unavailable_user::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',unavailable_user,'role','authenticated','aal','aal1')::text,
    true
  );
  update public.campuses set status='disabled' where id=expected_aamu_campus;
  begin
    perform * from public.complete_registration_enrollment(unavailable_grant);
    raise exception 'disabled campus unexpectedly accepted enrollment';
  exception when insufficient_privilege then
    if sqlerrm<>'campus enrollment unavailable' then raise; end if;
  end;
  if (select status from public.campuses where id=expected_aamu_campus)<>'disabled' then
    raise exception 'enrollment changed disabled campus lifecycle state';
  end if;
  update public.campuses set status='suspended' where id=expected_aamu_campus;
  begin
    perform * from public.complete_registration_enrollment(unavailable_grant);
    raise exception 'suspended campus unexpectedly accepted enrollment';
  exception when insufficient_privilege then
    if sqlerrm<>'campus enrollment unavailable' then raise; end if;
  end;
  update public.campuses set status='enabled' where id=expected_aamu_campus;

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

  -- Campus and platform staff both use the trusted, private-data-safe
  -- directory projection.
  insert into public.role_assignments(profile_id,campus_id,role)
  values(msu_user,(select campus_id from public.profiles where id=msu_user),'moderator')
  on conflict(profile_id,role) do nothing;
  perform set_config('request.jwt.claim.sub',msu_user::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',msu_user,'role','authenticated','aal','aal2')::text,
    true
  );
  if (select count(*) from public.admin_user_directory('',null,null,50))=0
    or (select count(distinct campus_id) from public.admin_user_directory('',null,null,50))<>1 then
    raise exception 'campus staff user-directory scope smoke failed';
  end if;
  insert into public.platform_role_assignments(profile_id,role)
  values(msu_user,'admin')
  on conflict(profile_id,role) do nothing;
  if (select count(*) from public.admin_user_directory('',null,null,50))=0 then
    raise exception 'platform staff user-directory scope smoke failed';
  end if;

  -- Listing state changes are atomic and request-idempotent.
  perform set_config('ce.moderation_test_bypass','on',true);
  insert into public.listings(
    id,campus_id,seller_id,title,description,category,condition,price_cents,
    status,idempotency_key,visibility,exchange_methods,
    legacy_exchange_unspecified
  )
  select smoke_listing_id,campus_id,id,'Production transition smoke',
    'Rollback-only atomic listing transition validation.','books','good',1000,
    'active',gen_random_uuid(),'campus_only',
    array['campus_pickup']::public.listing_exchange_method[],false
  from public.profiles where id=msu_user;
  perform * from public.transition_listing(
    smoke_listing_id,'active','reserved',aamu_user,smoke_listing_request
  );
  perform * from public.transition_listing(
    smoke_listing_id,'active','reserved',aamu_user,smoke_listing_request
  );
  begin
    perform * from public.transition_listing(
      smoke_listing_id,'active','sold',aamu_user,gen_random_uuid()
    );
    raise exception 'stale listing transition unexpectedly succeeded';
  exception when serialization_failure then
    if sqlerrm<>'stale listing state' then raise; end if;
  end;
  if (
    select count(*) from public.listing_transition_requests
    where listing_id=smoke_listing_id
  )<>1 then
    raise exception 'listing transition idempotency smoke failed';
  end if;

  -- The same sender key can safely be used in different conversations.
  insert into public.conversations(id,campus_id,created_by)
  select smoke_conversation_one,campus_id,msu_user
  from public.profiles where id=msu_user;
  insert into public.conversations(id,campus_id,created_by)
  select smoke_conversation_two,campus_id,msu_user
  from public.profiles where id=msu_user;
  insert into public.messages(
    campus_id,conversation_id,sender_id,body,idempotency_key
  )
  select campus_id,smoke_conversation_one,msu_user,
    'First rollback-only smoke message',smoke_message_key
  from public.profiles where id=msu_user;
  insert into public.messages(
    campus_id,conversation_id,sender_id,body,idempotency_key
  )
  select campus_id,smoke_conversation_two,msu_user,
    'Second rollback-only smoke message',smoke_message_key
  from public.profiles where id=msu_user;
  if (
    select count(*) from public.messages
    where sender_id=msu_user and idempotency_key=smoke_message_key
  )<>2 then
    raise exception 'conversation-scoped message idempotency smoke failed';
  end if;

  -- Invalid timezone data is rejected before worker delivery processing.
  begin
    update public.campuses
    set timezone='Not/A_Real_Zone'
    where id=(select campus_id from public.profiles where id=msu_user);
    raise exception 'invalid campus timezone unexpectedly accepted';
  exception when invalid_parameter_value then
    if sqlerrm<>'invalid IANA timezone' then raise; end if;
  end;
end
$production_smoke$;

select jsonb_build_object(
  'status','ok',
  'service','production-final-stabilization-smoke',
  'usernamePolicy','ce-username-2026-07-v1',
  'rolledBack',true
) as result;

rollback;
