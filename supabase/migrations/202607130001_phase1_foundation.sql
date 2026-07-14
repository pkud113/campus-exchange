create extension if not exists pgcrypto with schema extensions;

create type public.account_kind as enum ('student', 'staff');
create type public.conversation_request_status as enum ('pending', 'accepted', 'declined', 'cancelled');

alter table public.profiles
  alter column verified_at drop not null,
  alter column verified_until drop not null,
  add column account_kind public.account_kind not null default 'student',
  add column onboarding_completed_at timestamptz,
  add column password_setup_required boolean not null default true,
  add column avatar_media_id uuid,
  add column banner_media_id uuid;

alter table public.media_uploads
  add column purpose text not null default 'listing' check (purpose in ('listing','avatar','banner')),
  add column profile_id uuid references public.profiles(id) on delete cascade,
  add column deleted_at timestamptz,
  add column purge_after timestamptz,
  add constraint media_upload_target check (
    (purpose = 'listing' and listing_id is not null and profile_id is null)
    or (purpose in ('avatar','banner') and listing_id is null and profile_id = uploader_id)
  );

alter table public.profiles
  add constraint profiles_avatar_media_fk foreign key (avatar_media_id) references public.media_uploads(id) on delete set null,
  add constraint profiles_banner_media_fk foreign key (banner_media_id) references public.media_uploads(id) on delete set null;

alter table public.listings
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id),
  add column purge_after timestamptz;

alter table public.events
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.profiles(id),
  add column purge_after timestamptz;

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null unique check (char_length(email_hash) = 64),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  role public.app_role not null check (role in ('moderator','admin')),
  invited_by uuid references public.profiles(id),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.runtime_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.runtime_settings(key,value) values('auth_v2_enforced','false'::jsonb);

create table public.conversation_requests (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status public.conversation_request_status not null default 'pending',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);

alter table public.conversations
  add column request_id uuid unique references public.conversation_requests(id) on delete set null,
  add column direct_pair_key text unique;

alter table public.conversations drop constraint conversations_listing_id_fkey;
alter table public.conversations add constraint conversations_listing_id_fkey foreign key (listing_id) references public.listings(id) on delete set null;

with direct_pairs as (
  select cp.conversation_id, min(cp.profile_id::text)||':'||max(cp.profile_id::text) as pair_key
  from public.conversation_participants cp join public.conversations c on c.id=cp.conversation_id
  where c.listing_id is null group by cp.conversation_id having count(*)=2
)
update public.conversations c set direct_pair_key=p.pair_key from direct_pairs p where c.id=p.conversation_id;

create unique index conversation_requests_one_pending
  on public.conversation_requests(campus_id, least(requester_id::text,recipient_id::text), greatest(requester_id::text,recipient_id::text))
  where status = 'pending';
create index conversation_requests_recipient_status on public.conversation_requests(recipient_id, status, created_at desc);
create index conversation_requests_requester_status on public.conversation_requests(requester_id, status, created_at desc);
create index profiles_campus_search on public.profiles using gin ((coalesce(handle::text,'') || ' ' || coalesce(display_name,'')) extensions.gin_trgm_ops);
create index messages_conversation_created on public.messages(conversation_id, created_at desc);
create index listings_owner_active on public.listings(seller_id, created_at desc) where deleted_at is null;
create index events_owner_active on public.events(organizer_id, starts_at desc) where deleted_at is null;
create index media_purge_due on public.media_uploads(purge_after) where purge_after is not null;
create index listings_purge_due on public.listings(purge_after) where purge_after is not null;
create index events_purge_due on public.events(purge_after) where purge_after is not null;

create trigger conversation_requests_updated_at before update on public.conversation_requests
for each row execute function public.touch_updated_at();

create or replace function public.enforce_media_target() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.purpose='listing' then
    if not exists(select 1 from public.listings l where l.id=new.listing_id and l.seller_id=new.uploader_id and l.campus_id=new.campus_id and l.deleted_at is null) then
      raise exception 'listing upload ownership mismatch' using errcode='42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.listing_id::text,0));
    if (select count(*) from public.media_uploads m where m.listing_id=new.listing_id and m.status in ('pending','ready') and m.id<>new.id) >= 6 then
      raise exception 'listing image limit exceeded' using errcode='23514';
    end if;
  elsif not exists(select 1 from public.profiles p where p.id=new.profile_id and p.id=new.uploader_id and p.campus_id=new.campus_id) then
    raise exception 'profile upload ownership mismatch' using errcode='42501';
  end if;
  return new;
end $$;
create trigger media_target_guard before insert or update of listing_id,profile_id,purpose,uploader_id,campus_id
on public.media_uploads for each row execute function public.enforce_media_target();

alter table public.staff_invitations enable row level security;
alter table public.runtime_settings enable row level security;
alter table public.conversation_requests enable row level security;

revoke all on public.runtime_settings from anon, authenticated;

create or replace function public.auth_v2_enforced() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value::text::boolean from public.runtime_settings where key='auth_v2_enforced'), false)
$$;
grant execute on function public.auth_v2_enforced() to authenticated;

create or replace function public.has_mfa() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt()->>'aal', '') = 'aal2'
$$;

create policy conversation_realtime_read on realtime.messages for select to authenticated using (
  public.is_active_student()
  and realtime.topic() ~ '^conversation:[0-9a-f-]{36}$'
  and exists(
    select 1 from public.conversation_participants cp
    where cp.conversation_id = split_part(realtime.topic(), ':', 2)::uuid and cp.profile_id = auth.uid()
  )
);

create policy notification_realtime_read on realtime.messages for select to authenticated using (
  public.is_active_student() and realtime.topic() = 'notification:' || auth.uid()::text
);

create policy conversation_requests_participant_read on public.conversation_requests
for select to authenticated using (
  campus_id = public.current_campus_id()
  and (requester_id = auth.uid() or recipient_id = auth.uid())
);

drop policy if exists profiles_campus_read on public.profiles;
create policy profiles_campus_read on public.profiles for select to authenticated using (
  id = auth.uid()
  or (
    public.is_active_student() and campus_id = public.current_campus_id()
    and (
      (
        status = 'active' and onboarding_completed_at is not null
        and (not public.auth_v2_enforced() or not password_setup_required)
        and (account_kind='staff' or (verified_until is not null and verified_until>now()))
      )
      or (public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa())
    )
  )
);

drop policy if exists listings_member_read on public.listings;
create policy listings_member_read on public.listings for select to authenticated using (
  public.is_active_student()
  and campus_id = public.current_campus_id()
  and deleted_at is null
  and (status <> 'draft' or seller_id = auth.uid())
);

drop policy if exists events_member_read on public.events;
create policy events_member_read on public.events for select to authenticated using (
  public.is_active_student()
  and campus_id = public.current_campus_id()
  and deleted_at is null
);

create policy listings_staff_update on public.listings for update to authenticated using (
  campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa()
) with check (campus_id = public.current_campus_id());

create policy events_staff_update on public.events for update to authenticated using (
  campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa()
) with check (campus_id = public.current_campus_id());

create policy media_staff_update on public.media_uploads for update to authenticated using (
  campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa()
) with check (campus_id = public.current_campus_id());

drop policy if exists roles_self_read on public.role_assignments;
create policy roles_self_read on public.role_assignments for select to authenticated using (
  profile_id = auth.uid()
  or (campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa())
);
drop policy if exists roles_admin_manage on public.role_assignments;

drop policy if exists reports_self_or_staff_read on public.reports;
create policy reports_self_or_staff_read on public.reports for select to authenticated using (
  reporter_id = auth.uid()
  or (campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa())
);
drop policy if exists reports_staff_update on public.reports;
drop policy if exists moderation_staff_all on public.moderation_actions;
create policy moderation_staff_read on public.moderation_actions for select to authenticated using (
  campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa()
);
drop policy if exists audit_staff_read on public.audit_log;
create policy audit_staff_read on public.audit_log for select to authenticated using (
  campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa()
);

drop policy if exists listings_owner_delete on public.listings;

revoke update on public.profiles from authenticated;
grant update (display_name, bio) on public.profiles to authenticated;
revoke update on public.media_uploads from authenticated;
revoke insert, delete on public.media_uploads from authenticated;
revoke update on public.listings from authenticated;
grant update (title, description, category, condition, price_cents, currency, status, buyer_id) on public.listings to authenticated;
revoke update on public.events from authenticated;
grant update (title, description, location, starts_at, ends_at, capacity) on public.events to authenticated;
revoke delete on public.listings from authenticated;
revoke insert, update, delete on public.role_assignments from authenticated;
revoke update on public.reports from authenticated;
revoke select on public.reports from authenticated;
revoke insert, update, delete on public.moderation_actions from authenticated;

create or replace function public.prevent_username_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.onboarding_completed_at is not null and old.handle is not null and new.handle is distinct from old.handle then
    raise exception 'username cannot be changed after onboarding' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger profiles_immutable_username before update of handle on public.profiles
for each row execute function public.prevent_username_change();

create or replace function public.current_campus_id() returns uuid language sql stable security definer set search_path = '' as $$
  select p.campus_id from public.profiles p
  where p.id = auth.uid()
    and p.status = 'active'
    and p.onboarding_completed_at is not null
    and (not public.auth_v2_enforced() or not p.password_setup_required)
    and (p.account_kind = 'staff' or (p.verified_until is not null and p.verified_until > now()))
$$;

create or replace function public.is_active_student() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.onboarding_completed_at is not null
      and (not public.auth_v2_enforced() or not p.password_setup_required)
      and (
        p.account_kind = 'staff'
        or (p.verified_until is not null and p.verified_until > now())
      )
  )
$$;

create or replace function public.is_conversation_unblocked(target_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists(
    select 1 from public.conversation_participants other
    join public.blocks b on (b.blocker_id=auth.uid() and b.blocked_id=other.profile_id) or (b.blocked_id=auth.uid() and b.blocker_id=other.profile_id)
    where other.conversation_id=target_conversation and other.profile_id<>auth.uid()
  )
$$;

drop policy if exists messages_participant_insert on public.messages;
create policy messages_participant_insert on public.messages for insert to authenticated with check (
  sender_id=auth.uid() and campus_id=public.current_campus_id()
  and public.is_conversation_participant(conversation_id)
  and public.is_conversation_unblocked(conversation_id)
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare
  matched_campus uuid;
  staff_invite public.staff_invitations;
  normalized_hash text;
begin
  normalized_hash := encode(extensions.digest(lower(new.email), 'sha256'), 'hex');
  select * into staff_invite
  from public.staff_invitations
  where email_hash = normalized_hash and claimed_at is null and expires_at > now()
  for update;

  if staff_invite.id is not null then
    insert into public.profiles(id, campus_id, status, account_kind, verified_at, verified_until)
    values(new.id, staff_invite.campus_id, 'pending', 'staff', null, null);
    insert into public.role_assignments(profile_id, campus_id, role)
    values(new.id, staff_invite.campus_id, staff_invite.role);
    insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(staff_invite.campus_id,null,'role.provisioned','profile',new.id::text,jsonb_build_object('role',staff_invite.role,'invitationId',staff_invite.id));
    update public.staff_invitations set claimed_at = now() where id = staff_invite.id;
    return new;
  end if;

  select campus_id into matched_campus
  from public.campus_email_domains
  where lower(domain::text) = lower(split_part(new.email, '@', 2));
  if matched_campus is null then
    raise exception 'school email domain is not enabled' using errcode = '28000';
  end if;
  insert into public.profiles(id, campus_id, status, account_kind, verified_at, verified_until)
  values(new.id, matched_campus, 'pending', 'student', null, null);
  insert into public.role_assignments(profile_id, campus_id, role)
  values(new.id, matched_campus, 'student');
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
  values(matched_campus,null,'role.provisioned','profile',new.id::text,jsonb_build_object('role','student'));
  return new;
end $$;

create or replace function public.complete_onboarding(new_handle text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  selected public.profiles;
  auth_user auth.users;
begin
  select * into selected from public.profiles where id = auth.uid() for update;
  select * into auth_user from auth.users where id = auth.uid();
  if selected.id is null or auth_user.id is null then raise exception 'account not found' using errcode = 'P0002'; end if;
  if selected.status not in ('pending','active') then raise exception 'account is not eligible for onboarding' using errcode = '42501'; end if;
  if selected.onboarding_completed_at is not null and not selected.password_setup_required then raise exception 'onboarding already complete' using errcode = '23514'; end if;
  if auth_user.encrypted_password is null or auth_user.encrypted_password = '' then raise exception 'password required' using errcode = '23514'; end if;
  if selected.account_kind = 'student' and auth_user.email_confirmed_at is null then raise exception 'email verification required' using errcode = '42501'; end if;
  update public.profiles set
    handle = lower(new_handle),
    display_name = coalesce(display_name, lower(new_handle)),
    status = case when status='pending' then 'active'::public.profile_status else status end,
    verified_at = case when account_kind = 'student' then now() else verified_at end,
    verified_until = case when account_kind = 'student' then now() + interval '1 year' else verified_until end,
    onboarding_completed_at = now(),
    password_setup_required = false
  where id = auth.uid();
  insert into public.audit_log(campus_id, actor_id, action, target_type, target_id, metadata)
  values(selected.campus_id, auth.uid(), 'account.onboarding_completed', 'profile', auth.uid()::text, '{}'::jsonb);
end $$;
grant execute on function public.complete_onboarding(text) to authenticated;

create or replace function public.reverify_student() returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.profiles; auth_user auth.users;
begin
  select * into selected from public.profiles where id=auth.uid() for update;
  select * into auth_user from auth.users where id=auth.uid();
  if selected.id is null or selected.account_kind<>'student' or selected.status<>'active' or selected.onboarding_completed_at is null or selected.password_setup_required or auth_user.email_confirmed_at is null then
    raise exception 'student re-verification unavailable' using errcode='42501';
  end if;
  update public.profiles set verified_at=now(),verified_until=now()+interval '1 year' where id=auth.uid();
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
  values(selected.campus_id,auth.uid(),'account.reverified','profile',auth.uid()::text,'{}'::jsonb);
end $$;
grant execute on function public.reverify_student() to authenticated;

create or replace function public.create_direct_conversation_request(target_profile uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_campus uuid := public.current_campus_id();
  request_id uuid;
begin
  if not public.is_active_student() then raise exception 'active membership required' using errcode = '42501'; end if;
  if target_profile = caller then raise exception 'cannot request yourself' using errcode = '23514'; end if;
  if not exists(select 1 from public.profiles where id = target_profile and campus_id = caller_campus and status = 'active' and onboarding_completed_at is not null and (not public.auth_v2_enforced() or not password_setup_required) and (account_kind='staff' or (verified_until is not null and verified_until>now()))) then
    raise exception 'profile unavailable' using errcode = 'P0002';
  end if;
  if exists(select 1 from public.blocks where (blocker_id=caller and blocked_id=target_profile) or (blocker_id=target_profile and blocked_id=caller)) then
    raise exception 'request blocked' using errcode = '42501';
  end if;
  if exists(
    select 1 from public.conversations c
    join public.conversation_participants a on a.conversation_id=c.id and a.profile_id=caller
    join public.conversation_participants b on b.conversation_id=c.id and b.profile_id=target_profile
    where c.listing_id is null
  ) then raise exception 'conversation already exists' using errcode = '23505'; end if;
  insert into public.conversation_requests(campus_id, requester_id, recipient_id)
  values(caller_campus, caller, target_profile)
  returning id into request_id;
  insert into public.notifications(campus_id, profile_id, kind, title, body, href)
  values(caller_campus, target_profile, 'message_request', 'New conversation request', 'A verified campus member wants to message you.', '/messages/requests');
  return request_id;
end $$;
grant execute on function public.create_direct_conversation_request(uuid) to authenticated;

create or replace function public.respond_to_conversation_request(target_request uuid, response text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  selected public.conversation_requests;
  conversation_id uuid;
begin
  if response not in ('accepted','declined') then raise exception 'invalid response' using errcode = '23514'; end if;
  select * into selected from public.conversation_requests
  where id=target_request and recipient_id=auth.uid() and status='pending' for update;
  if selected.id is null then raise exception 'request unavailable' using errcode = 'P0002'; end if;
  update public.conversation_requests set status=response::public.conversation_request_status, responded_at=now() where id=selected.id;
  if response='accepted' then
    insert into public.conversations(campus_id, created_by, request_id, direct_pair_key)
    values(selected.campus_id, selected.requester_id, selected.id, least(selected.requester_id::text,selected.recipient_id::text)||':'||greatest(selected.requester_id::text,selected.recipient_id::text)) returning id into conversation_id;
    insert into public.conversation_participants(conversation_id, profile_id, campus_id, last_read_at)
    values(conversation_id, selected.requester_id, selected.campus_id, now()),
          (conversation_id, selected.recipient_id, selected.campus_id, now());
    insert into public.notifications(campus_id, profile_id, kind, title, body, href)
    values(selected.campus_id, selected.requester_id, 'message_request', 'Conversation request accepted', 'You can now start messaging.', '/messages');
  end if;
  return conversation_id;
end $$;
grant execute on function public.respond_to_conversation_request(uuid,text) to authenticated;

create or replace function public.cancel_conversation_request(target_request uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversation_requests set status='cancelled', responded_at=now()
  where id=target_request and requester_id=auth.uid() and status='pending';
  if not found then raise exception 'request unavailable' using errcode = 'P0002'; end if;
end $$;
grant execute on function public.cancel_conversation_request(uuid) to authenticated;

create or replace function public.conversation_inbox()
returns table(
  id uuid, listing_id uuid, listing_title text, last_message_at timestamptz,
  other_profile_id uuid, other_handle text, other_display_name text, other_avatar_id uuid,
  latest_body text, latest_created_at timestamptz, unread_count bigint
) language sql stable security definer set search_path = '' as $$
  select c.id, c.listing_id, l.title, c.last_message_at,
    other.profile_id, p.handle::text, p.display_name, p.avatar_media_id,
    latest.body, latest.created_at,
    (select count(*) from public.messages unread
      where unread.conversation_id=c.id and unread.sender_id<>auth.uid()
        and unread.created_at>coalesce(mine.last_read_at,'epoch'::timestamptz) and unread.deleted_at is null)
  from public.conversations c
  join public.conversation_participants mine on mine.conversation_id=c.id and mine.profile_id=auth.uid()
  join public.conversation_participants other on other.conversation_id=c.id and other.profile_id<>auth.uid()
  join public.profiles p on p.id=other.profile_id
  left join public.listings l on l.id=c.listing_id
  left join lateral (
    select m.body,m.created_at from public.messages m
    where m.conversation_id=c.id and m.deleted_at is null order by m.created_at desc limit 1
  ) latest on true
  order by coalesce(latest.created_at,c.created_at) desc
$$;
grant execute on function public.conversation_inbox() to authenticated;

create or replace function public.mark_conversation_read(target_conversation uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversation_participants set last_read_at=now()
  where conversation_id=target_conversation and profile_id=auth.uid();
  if not found then raise exception 'conversation unavailable' using errcode='42501'; end if;
end $$;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

create or replace function public.soft_delete_content(target_type text, target_id uuid, reason text default 'user deleted') returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  campus uuid := public.current_campus_id();
  staff boolean := public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa();
begin
  if char_length(reason) < 3 then raise exception 'reason required' using errcode='23514'; end if;
  if target_type='listing' then
    update public.listings set deleted_at=now(), deleted_by=caller, purge_after=now()+interval '30 days',
      status=case when status='sold' then status else 'withdrawn'::public.listing_status end
    where id=target_id and campus_id=campus and deleted_at is null and (seller_id=caller or staff);
    if not found then raise exception 'listing unavailable' using errcode='42501'; end if;
    update public.media_uploads set deleted_at=now(), purge_after=now()+interval '30 days', status='deleted'
    where listing_id=target_id and deleted_at is null;
  elsif target_type='event' then
    update public.events set deleted_at=now(), deleted_by=caller, purge_after=now()+interval '30 days', cancelled_at=coalesce(cancelled_at,now())
    where id=target_id and campus_id=campus and deleted_at is null and (organizer_id=caller or staff);
    if not found then raise exception 'event unavailable' using errcode='42501'; end if;
  else
    raise exception 'unsupported content type' using errcode='23514';
  end if;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
  values(campus,caller,'content.soft_deleted',target_type,target_id::text,jsonb_build_object('reason',reason,'purgeAfter',now()+interval '30 days'));
end $$;
grant execute on function public.soft_delete_content(text,uuid,text) to authenticated;

create or replace function public.attach_profile_media(target_media uuid, target_purpose text) returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.media_uploads; previous_media uuid;
begin
  if target_purpose not in ('avatar','banner') then raise exception 'invalid media purpose' using errcode='23514'; end if;
  select * into selected from public.media_uploads where id=target_media and uploader_id=auth.uid() and profile_id=auth.uid() and purpose=target_purpose and status='ready';
  if selected.id is null then raise exception 'media unavailable' using errcode='42501'; end if;
  if target_purpose='avatar' then
    select avatar_media_id into previous_media from public.profiles where id=auth.uid();
    update public.profiles set avatar_media_id=selected.id where id=auth.uid();
  else
    select banner_media_id into previous_media from public.profiles where id=auth.uid();
    update public.profiles set banner_media_id=selected.id where id=auth.uid();
  end if;
  if previous_media is not null and previous_media<>selected.id then
    update public.media_uploads set deleted_at=now(),purge_after=now()+interval '30 days',status='deleted' where id=previous_media and uploader_id=auth.uid();
  end if;
end $$;
grant execute on function public.attach_profile_media(uuid,text) to authenticated;

create or replace function public.moderation_report_queue()
returns table(id uuid,target_type text,target_id uuid,reason text,details text,message_snapshot jsonb,status public.report_status,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare campus uuid := public.current_campus_id();
begin
  if not public.has_role(array['moderator','admin']::public.app_role[]) or not public.has_mfa() then
    raise exception 'MFA-protected moderator access required' using errcode='42501';
  end if;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
  values(campus,auth.uid(),'security.sensitive_access','moderation_queue',campus::text,'{}'::jsonb);
  return query select r.id,r.target_type,r.target_id,r.reason,r.details,r.message_snapshot,r.status,r.created_at
  from public.reports r where r.campus_id=campus and r.status in ('open','reviewing') order by r.created_at limit 100;
end $$;
grant execute on function public.moderation_report_queue() to authenticated;

create or replace function public.submit_report(submitted_type text,submitted_id uuid,submitted_reason text,submitted_details text,submitted_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); campus uuid := public.current_campus_id(); report_id uuid;
begin
  if campus is null then raise exception 'active membership required' using errcode='42501'; end if;
  if submitted_type='listing' and not exists(select 1 from public.listings where id=submitted_id and campus_id=campus and deleted_at is null) then raise exception 'target unavailable' using errcode='P0002';
  elsif submitted_type='event' and not exists(select 1 from public.events where id=submitted_id and campus_id=campus and deleted_at is null) then raise exception 'target unavailable' using errcode='P0002';
  elsif submitted_type='profile' and not exists(select 1 from public.profiles where id=submitted_id and campus_id=campus) then raise exception 'target unavailable' using errcode='P0002';
  elsif submitted_type='message' and not exists(select 1 from public.messages where id=submitted_id and campus_id=campus and public.is_conversation_participant(conversation_id)) then raise exception 'target unavailable' using errcode='P0002';
  elsif submitted_type not in ('listing','event','profile','message') then raise exception 'unsupported target' using errcode='23514';
  end if;
  insert into public.reports(campus_id,reporter_id,target_type,target_id,reason,details,idempotency_key)
  values(campus,caller,submitted_type,submitted_id,submitted_reason,submitted_details,submitted_key)
  on conflict(reporter_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into report_id;
  return report_id;
end $$;
grant execute on function public.submit_report(text,uuid,text,text,uuid) to authenticated;

create or replace function public.moderate_report(target_report uuid, chosen_action text, action_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.reports; caller uuid := auth.uid();
begin
  if not public.has_role(array['moderator','admin']::public.app_role[]) or not public.has_mfa() then
    raise exception 'MFA-protected moderator access required' using errcode='42501';
  end if;
  select * into selected from public.reports
  where id=target_report and campus_id=public.current_campus_id() and status in ('open','reviewing') for update;
  if selected.id is null then raise exception 'report not found' using errcode='P0002'; end if;
  if chosen_action not in ('dismiss','warn','hide_content','suspend','restore') then raise exception 'invalid moderation action' using errcode='23514'; end if;
  if chosen_action='hide_content' and selected.target_type='listing' then
    update public.listings set status='withdrawn' where id=selected.target_id and campus_id=selected.campus_id and status not in ('sold','withdrawn');
  elsif chosen_action='hide_content' and selected.target_type='event' then
    update public.events set cancelled_at=coalesce(cancelled_at,now()) where id=selected.target_id and campus_id=selected.campus_id;
  elsif chosen_action='suspend' and selected.target_type='profile' then
    update public.profiles set status='suspended' where id=selected.target_id and campus_id=selected.campus_id;
  elsif chosen_action='restore' and selected.target_type='profile' then
    update public.profiles set status='active' where id=selected.target_id and campus_id=selected.campus_id;
  end if;
  insert into public.moderation_actions(campus_id,report_id,moderator_id,subject_profile_id,action,reason)
    values(selected.campus_id,selected.id,caller,case when selected.target_type='profile' then selected.target_id else null end,chosen_action,action_reason);
  update public.reports set status=case when chosen_action='dismiss' then 'dismissed' else 'resolved' end,resolved_at=now(),assigned_to=caller where id=selected.id;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(selected.campus_id,caller,'moderation.'||chosen_action,selected.target_type,selected.target_id::text,jsonb_build_object('reportId',selected.id,'reason',action_reason));
end $$;

create or replace function public.moderate_content(target_type text, target_id uuid, chosen_action text, new_title text, action_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); campus uuid := public.current_campus_id();
begin
  if not public.has_role(array['moderator','admin']::public.app_role[]) or not public.has_mfa() then
    raise exception 'MFA-protected moderator access required' using errcode='42501';
  end if;
  if char_length(trim(action_reason)) < 3 or chosen_action not in ('edit','hide') then
    raise exception 'valid action and reason required' using errcode='23514';
  end if;
  if target_type='listing' then
    if chosen_action='edit' then
      if char_length(trim(new_title)) not between 3 and 100 then raise exception 'invalid listing title' using errcode='23514'; end if;
      update public.listings set title=trim(new_title) where id=target_id and campus_id=campus and deleted_at is null;
    else
      update public.listings set status='withdrawn' where id=target_id and campus_id=campus and deleted_at is null and status in ('draft','active','reserved','withdrawn');
    end if;
  elsif target_type='event' then
    if chosen_action='edit' then
      if char_length(trim(new_title)) not between 3 and 120 then raise exception 'invalid event title' using errcode='23514'; end if;
      update public.events set title=trim(new_title) where id=target_id and campus_id=campus and deleted_at is null;
    else
      update public.events set cancelled_at=coalesce(cancelled_at,now()) where id=target_id and campus_id=campus and deleted_at is null;
    end if;
  else
    raise exception 'unsupported content type' using errcode='23514';
  end if;
  if not found then raise exception 'content unavailable' using errcode='P0002'; end if;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
  values(campus,caller,'content.'||chosen_action,target_type,target_id::text,jsonb_build_object('reason',action_reason,'title',new_title));
end $$;
grant execute on function public.moderate_content(text,uuid,text,text,text) to authenticated;

create or replace function public.moderate_profile(target_profile uuid, chosen_action text, action_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); campus uuid := public.current_campus_id(); target_is_staff boolean;
begin
  if not public.has_role(array['moderator','admin']::public.app_role[]) or not public.has_mfa() then
    raise exception 'MFA-protected moderator access required' using errcode='42501';
  end if;
  if target_profile=caller or chosen_action not in ('suspend','restore') or char_length(trim(action_reason))<3 then
    raise exception 'valid target, action, and reason required' using errcode='23514';
  end if;
  select exists(select 1 from public.role_assignments where profile_id=target_profile and role in ('moderator','admin')) into target_is_staff;
  if target_is_staff and not public.has_role(array['admin']::public.app_role[]) then
    raise exception 'administrator required for staff accounts' using errcode='42501';
  end if;
  update public.profiles set status=case when chosen_action='suspend' then 'suspended'::public.profile_status else 'active'::public.profile_status end
  where id=target_profile and campus_id=campus and onboarding_completed_at is not null;
  if not found then raise exception 'profile unavailable' using errcode='P0002'; end if;
  insert into public.moderation_actions(campus_id,moderator_id,subject_profile_id,action,reason)
  values(campus,caller,target_profile,chosen_action,action_reason);
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
  values(campus,caller,'moderation.'||chosen_action,'profile',target_profile::text,jsonb_build_object('reason',action_reason));
end $$;
grant execute on function public.moderate_profile(uuid,text,text) to authenticated;

-- Existing accounts remain usable during the backward-compatible deployment. The operator
-- enables auth_v2_enforced only after the new UI, first staff account, MFA, and smoke tests pass.
update public.profiles set account_kind='student', onboarding_completed_at=coalesce(onboarding_completed_at,created_at), password_setup_required=true where account_kind='student';
