-- Multi-campus discovery and global message requests.
-- Existing campuses remain enabled; newly created campuses/domains are disabled
-- until an operator explicitly activates them.

create type public.campus_status as enum ('enabled', 'suspended', 'disabled');
create type public.content_visibility as enum ('campus_only', 'network');
create type public.listing_exchange_method as enum ('campus_pickup', 'in_person_meetup', 'shipping', 'digital_delivery');
create type public.platform_role as enum ('moderator', 'admin');

alter table public.campuses
  add column short_name text,
  add column city text,
  add column region text,
  add column country_code char(2) not null default 'US' check (country_code ~ '^[A-Z]{2}$'),
  add column status public.campus_status;
update public.campuses set short_name = name, status = 'enabled' where status is null;
alter table public.campuses
  alter column short_name set not null,
  alter column status set not null,
  alter column status set default 'disabled';

alter table public.campus_email_domains add column is_enabled boolean;
update public.campus_email_domains set is_enabled = true where is_enabled is null;
alter table public.campus_email_domains
  alter column is_enabled set not null,
  alter column is_enabled set default false;

alter table public.listings
  add column visibility public.content_visibility not null default 'campus_only',
  add column exchange_methods public.listing_exchange_method[],
  add column legacy_exchange_unspecified boolean not null default true;
do $$ declare changed integer; begin loop
  update public.listings set legacy_exchange_unspecified=true where id in (
    select id from public.listings where exchange_methods is null and not legacy_exchange_unspecified limit 1000
  );
  get diagnostics changed=row_count; exit when changed=0;
end loop; end $$;
alter table public.listings add constraint listings_exchange_methods_valid check (
  (legacy_exchange_unspecified and exchange_methods is null)
  or (
    not legacy_exchange_unspecified
    and exchange_methods is not null
    and cardinality(exchange_methods) between 1 and 4
    and exchange_methods <@ enum_range(null::public.listing_exchange_method)
  )
) not valid;
alter table public.listings validate constraint listings_exchange_methods_valid;

alter table public.events
  add column visibility public.content_visibility not null default 'campus_only';

grant update (visibility,exchange_methods,legacy_exchange_unspecified) on public.listings to authenticated;
grant update (visibility) on public.events to authenticated;

alter table public.conversation_requests
  add column opening_message text,
  add column idempotency_key uuid,
  add column requester_campus_id uuid references public.campuses(id),
  add column recipient_campus_id uuid references public.campuses(id),
  add column context_type text not null default 'direct' check (context_type in ('direct','listing','event')),
  add column listing_id uuid references public.listings(id) on delete set null,
  add column event_id uuid references public.events(id) on delete set null,
  add column unavailable_reason text;

do $$ declare changed integer; begin loop
  update public.conversation_requests r set requester_campus_id=requester.campus_id,recipient_campus_id=recipient.campus_id
  from public.profiles requester,public.profiles recipient where r.id in (
    select id from public.conversation_requests where requester_campus_id is null or recipient_campus_id is null limit 1000
  ) and requester.id=r.requester_id and recipient.id=r.recipient_id;
  get diagnostics changed=row_count; exit when changed=0;
end loop; end $$;

do $$ declare changed integer; begin loop
  update public.conversation_requests set status='cancelled',responded_at=coalesce(responded_at,now()),unavailable_reason='legacy_missing_opening'
  where id in (select id from public.conversation_requests where status='pending' and opening_message is null limit 1000);
  get diagnostics changed=row_count; exit when changed=0;
end loop; end $$;

alter table public.conversation_requests
  alter column requester_campus_id set not null,
  alter column recipient_campus_id set not null,
  add constraint conversation_request_context_valid check (
    (context_type = 'direct' and listing_id is null and event_id is null)
    or (context_type = 'listing' and listing_id is not null and event_id is null)
    or (context_type = 'event' and event_id is not null and listing_id is null)
  ) not valid,
  add constraint conversation_request_opening_valid check (
    opening_message is null or (opening_message = btrim(opening_message) and char_length(opening_message) between 10 and 500)
  ) not valid;
alter table public.conversation_requests validate constraint conversation_request_context_valid;
alter table public.conversation_requests validate constraint conversation_request_opening_valid;

drop index if exists public.conversation_requests_one_pending;
create unique index conversation_requests_one_pending_pair
  on public.conversation_requests(least(requester_id::text,recipient_id::text), greatest(requester_id::text,recipient_id::text))
  where status = 'pending';
create unique index conversation_requests_idempotency
  on public.conversation_requests(requester_id,idempotency_key) where idempotency_key is not null;
create index conversation_requests_decline_cooldown
  on public.conversation_requests(requester_id,recipient_id,responded_at desc) where status = 'declined';

alter table public.conversations
  add column event_id uuid references public.events(id) on delete set null;
alter table public.messages
  add column request_id uuid unique references public.conversation_requests(id) on delete set null;

do $$ declare changed integer; begin loop
  update public.conversation_participants cp set campus_id=p.campus_id from public.profiles p where cp.profile_id=p.id and cp.conversation_id in (
    select conversation_id from public.conversation_participants x join public.profiles px on px.id=x.profile_id where x.campus_id<>px.campus_id limit 1000
  ) and cp.campus_id<>p.campus_id;
  get diagnostics changed=row_count; exit when changed=0;
end loop; end $$;

alter table public.reports
  add column subject_campus_id uuid references public.campuses(id),
  add column platform_visible boolean not null default false;
do $$ declare changed integer; begin loop
  update public.reports set subject_campus_id=campus_id where id in (select id from public.reports where subject_campus_id is null limit 1000);
  get diagnostics changed=row_count; exit when changed=0;
end loop; end $$;
alter table public.reports alter column subject_campus_id set not null;

create table public.platform_role_assignments (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.platform_role not null,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key(profile_id,role)
);
alter table public.platform_role_assignments enable row level security;
revoke insert, update, delete on public.platform_role_assignments from anon, authenticated;
create policy platform_roles_self_read on public.platform_role_assignments for select to authenticated
using (profile_id = (select auth.uid()));

insert into public.runtime_settings(key,value) values
  ('network_features_enabled','true'::jsonb),
  ('message_request_daily_limit','10'::jsonb),
  ('message_request_decline_cooldown_days','14'::jsonb),
  ('blocked_conversation_visibility','"read_only"'::jsonb)
on conflict(key) do nothing;

create index campuses_status_name_idx on public.campuses(status,name);
create index campus_domains_activation_idx on public.campus_email_domains(campus_id,is_enabled);
create index listings_network_discovery_idx on public.listings(campus_id,visibility,status,created_at desc,id desc) where deleted_at is null;
create index events_network_discovery_idx on public.events(campus_id,visibility,starts_at,id) where deleted_at is null and cancelled_at is null;
create index blocks_bidirectional_idx on public.blocks(blocked_id,blocker_id);
create index conversation_requests_listing_pending_idx on public.conversation_requests(listing_id,status) where listing_id is not null;
create index conversation_requests_event_pending_idx on public.conversation_requests(event_id,status) where event_id is not null;
create index conversations_event_idx on public.conversations(event_id) where event_id is not null;
create index event_rsvps_event_campus_idx on public.event_rsvps(event_id,campus_id);
create index reports_subject_queue_idx on public.reports(subject_campus_id,status,created_at) where status in ('open','reviewing');

create or replace function public.validate_campus_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then
    raise exception 'unknown campus timezone' using errcode='23514';
  end if;
  return new;
end $$;
create trigger campuses_timezone_guard before insert or update of timezone on public.campuses
for each row execute function public.validate_campus_timezone();

create or replace function public.validate_listing_exchange_and_visibility() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not new.legacy_exchange_unspecified and coalesce(cardinality(new.exchange_methods),0)=0 then
    raise exception 'choose at least one exchange method' using errcode='23514';
  end if;
  if new.exchange_methods is not null and cardinality(new.exchange_methods)<>(select count(distinct method) from unnest(new.exchange_methods) method) then
    raise exception 'exchange methods must be unique' using errcode='23514';
  end if;
  if new.legacy_exchange_unspecified and tg_op='UPDATE' and (
    (new.status='active' and old.status is distinct from new.status)
    or old.title is distinct from new.title or old.description is distinct from new.description
    or old.category is distinct from new.category or old.condition is distinct from new.condition
    or old.price_cents is distinct from new.price_cents or old.visibility is distinct from new.visibility
  ) then raise exception 'choose at least one exchange method before publishing or editing this legacy listing' using errcode='23514'; end if;
  if new.visibility='network' and (new.legacy_exchange_unspecified or cardinality(new.exchange_methods)=0) then
    raise exception 'network listings require an exchange method' using errcode='23514';
  end if;
  return new;
end $$;
create trigger listings_exchange_guard before insert or update on public.listings
for each row execute function public.validate_listing_exchange_and_visibility();

create or replace function public.handle_listing_visibility_narrowing() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.visibility='network' and new.visibility='campus_only' then
    delete from public.favorites f using public.profiles p
      where f.listing_id=new.id and p.id=f.profile_id and p.campus_id<>new.campus_id;
    update public.conversation_requests set status='cancelled',responded_at=now(),unavailable_reason='context_hidden'
      where listing_id=new.id and status='pending' and recipient_campus_id<>requester_campus_id;
  end if;
  return new;
end $$;
create trigger listings_visibility_narrowed after update of visibility on public.listings
for each row execute function public.handle_listing_visibility_narrowing();

create or replace function public.prevent_event_visibility_narrowing() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.visibility='network' and new.visibility='campus_only' and exists(
    select 1 from public.event_rsvps r join public.profiles p on p.id=r.profile_id
    where r.event_id=new.id and p.campus_id<>new.campus_id
  ) then
    raise exception 'resolve cross-campus RSVPs before making this event campus-only' using errcode='23514';
  end if;
  return new;
end $$;
create trigger events_visibility_narrowing before update of visibility on public.events
for each row execute function public.prevent_event_visibility_narrowing();

create or replace function private.network_features_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value::text::boolean from public.runtime_settings where key='network_features_enabled'),true)
$$;

create or replace function private.active_member(target_profile uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.profiles p join public.campuses c on c.id=p.campus_id
    where p.id=target_profile and p.status='active' and p.onboarding_completed_at is not null
      and (not public.auth_v2_enforced() or not p.password_setup_required)
      and (p.account_kind='staff' or (p.verified_until is not null and p.verified_until>now()))
      and c.status='enabled'
  )
$$;

create or replace function private.has_platform_role(required_roles public.platform_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.platform_role_assignments
    where profile_id=(select auth.uid()) and role=any(required_roles))
$$;

create or replace function public.network_features_enabled() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.network_features_enabled() $$;
create or replace function public.has_platform_role(required_roles public.platform_role[]) returns boolean
language sql stable security invoker set search_path = '' as $$ select private.has_platform_role(required_roles) $$;

create or replace function public.current_campus_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.campus_id from public.profiles p join public.campuses c on c.id=p.campus_id
  where p.id=(select auth.uid()) and p.status='active' and p.onboarding_completed_at is not null
    and (not public.auth_v2_enforced() or not p.password_setup_required)
    and (p.account_kind='staff' or (p.verified_until is not null and p.verified_until>now()))
    and c.status='enabled'
$$;

create or replace function public.is_active_student() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.active_member((select auth.uid()))
$$;

create or replace function private.content_is_visible(source_campus uuid, source_visibility public.content_visibility) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.active_member((select auth.uid())) and exists(
    select 1 from public.campuses c where c.id=source_campus and c.status='enabled'
  ) and (
    source_campus=public.current_campus_id()
    or (source_visibility='network' and private.network_features_enabled())
  )
$$;

drop policy if exists campuses_member_read on public.campuses;
create policy campuses_member_read on public.campuses for select to authenticated using (
  (select public.is_active_student()) and status='enabled'
);

drop policy if exists listings_member_read on public.listings;
create policy listings_member_read on public.listings for select to authenticated using (
  deleted_at is null and (
    seller_id=(select auth.uid())
    or (campus_id=public.current_campus_id() and status<>'draft')
    or (campus_id<>public.current_campus_id() and status in ('active','reserved','sold') and private.content_is_visible(campus_id,visibility))
    or (campus_id=public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa())
  )
);

drop policy if exists events_member_read on public.events;
create policy events_member_read on public.events for select to authenticated using (
  deleted_at is null and (
    organizer_id=(select auth.uid())
    or campus_id=public.current_campus_id()
    or (campus_id<>public.current_campus_id() and cancelled_at is null and private.content_is_visible(campus_id,visibility))
    or (campus_id=public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa())
  )
);

drop policy if exists conversation_requests_participant_read on public.conversation_requests;
create policy conversation_requests_participant_read on public.conversation_requests for select to authenticated using (
  requester_id=(select auth.uid()) or recipient_id=(select auth.uid())
);

drop policy if exists blocks_self_read on public.blocks;
create policy blocks_self_read on public.blocks for select to authenticated using (blocker_id=(select auth.uid()));

drop policy if exists rsvps_member_read on public.event_rsvps;
create policy rsvps_self_or_organizer_read on public.event_rsvps for select to authenticated using (
  profile_id=(select auth.uid()) or exists(
    select 1 from public.events e where e.id=event_id and e.organizer_id=(select auth.uid())
  )
);

create or replace function private.safe_profile_cards(target_ids uuid[]) returns table(
  id uuid, handle text, display_name text, avatar_media_id uuid, campus_id uuid,
  campus_name text, campus_short_name text, campus_slug text, joined_month date
)
language sql stable security definer set search_path = '' as $$
  select p.id,p.handle::text,p.display_name,p.avatar_media_id,p.campus_id,c.name,c.short_name,c.slug::text,
    date_trunc('month',p.created_at)::date
  from public.profiles p join public.campuses c on c.id=p.campus_id
  where p.id=any(target_ids) and private.active_member(p.id)
    and not exists(select 1 from public.blocks b where
      (b.blocker_id=(select auth.uid()) and b.blocked_id=p.id)
      or (b.blocker_id=p.id and b.blocked_id=(select auth.uid())))
$$;

create or replace function public.safe_profile_cards(target_ids uuid[]) returns table(
  id uuid, handle text, display_name text, avatar_media_id uuid, campus_id uuid,
  campus_name text, campus_short_name text, campus_slug text, joined_month date
)
language sql stable security invoker set search_path = '' as $$
  select * from private.safe_profile_cards(target_ids)
$$;

create or replace function private.safe_profile_by_username(target_username text) returns table(
  id uuid, handle text, display_name text, bio text, avatar_media_id uuid, banner_media_id uuid,
  campus_id uuid, campus_name text, campus_short_name text, campus_slug text, joined_month date, same_campus boolean
)
language sql stable security definer set search_path = '' as $$
  select p.id,p.handle::text,p.display_name,
    case when p.campus_id=public.current_campus_id() then p.bio else '' end,
    p.avatar_media_id,p.banner_media_id,p.campus_id,c.name,c.short_name,c.slug::text,
    date_trunc('month',p.created_at)::date,(p.campus_id=public.current_campus_id())
  from public.profiles p join public.campuses c on c.id=p.campus_id
  where lower(p.handle::text)=lower(target_username) and private.active_member(p.id)
    and private.active_member((select auth.uid()))
    and (p.campus_id=public.current_campus_id() or private.network_features_enabled())
    and not exists(select 1 from public.blocks b where
      (b.blocker_id=(select auth.uid()) and b.blocked_id=p.id)
      or (b.blocker_id=p.id and b.blocked_id=(select auth.uid())))
$$;
create or replace function public.safe_profile_by_username(target_username text) returns table(
  id uuid, handle text, display_name text, bio text, avatar_media_id uuid, banner_media_id uuid,
  campus_id uuid, campus_name text, campus_short_name text, campus_slug text, joined_month date, same_campus boolean
)
language sql stable security invoker set search_path = '' as $$ select * from private.safe_profile_by_username(target_username) $$;

create or replace function private.search_member_directory(search_term text, campus_filter text, result_limit integer)
returns table(
  id uuid, handle text, display_name text, avatar_media_id uuid, campus_id uuid,
  campus_name text, campus_short_name text, campus_slug text, joined_month date
)
language sql stable security definer set search_path = '' as $$
  select p.id,p.handle::text,p.display_name,p.avatar_media_id,p.campus_id,c.name,c.short_name,c.slug::text,
    date_trunc('month',p.created_at)::date
  from public.profiles p join public.campuses c on c.id=p.campus_id
  where private.active_member((select auth.uid()))
    and (p.campus_id=public.current_campus_id() or private.network_features_enabled())
    and private.active_member(p.id) and p.id<>(select auth.uid())
    and (campus_filter is null or campus_filter='' or c.slug::text=campus_filter)
    and (p.handle::text ilike '%'||search_term||'%' or coalesce(p.display_name,'') ilike '%'||search_term||'%'
      or c.name ilike '%'||search_term||'%' or c.short_name ilike '%'||search_term||'%')
    and not exists(select 1 from public.blocks b where
      (b.blocker_id=(select auth.uid()) and b.blocked_id=p.id)
      or (b.blocker_id=p.id and b.blocked_id=(select auth.uid())))
  order by case when p.handle::text=lower(search_term) then 0 else 1 end,p.handle
  limit least(greatest(result_limit,1),50)
$$;

create or replace function public.search_member_directory(search_term text, campus_filter text default null, result_limit integer default 20)
returns table(
  id uuid, handle text, display_name text, avatar_media_id uuid, campus_id uuid,
  campus_name text, campus_short_name text, campus_slug text, joined_month date
)
language sql stable security invoker set search_path = '' as $$
  select * from private.search_member_directory(btrim(search_term),campus_filter,result_limit)
$$;

create or replace function private.safe_listing_media(target_ids uuid[]) returns table(listing_id uuid, id uuid, alt_text text, status text)
language sql stable security definer set search_path = '' as $$
  select m.listing_id,m.id,m.alt_text,m.status from public.media_uploads m
  join public.listings l on l.id=m.listing_id
  where l.id=any(target_ids) and l.deleted_at is null and m.status='ready'
    and private.content_is_visible(l.campus_id,l.visibility)
    and (l.campus_id=public.current_campus_id() or l.status in ('active','reserved','sold'))
$$;
create or replace function public.safe_listing_media(target_ids uuid[]) returns table(listing_id uuid, id uuid, alt_text text, status text)
language sql stable security invoker set search_path = '' as $$ select * from private.safe_listing_media(target_ids) $$;

create or replace function private.can_read_media(target_media uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.media_uploads m
    left join public.listings l on l.id=m.listing_id
    left join public.profiles p on p.id=m.profile_id
    where m.id=target_media and m.status='ready' and (
      m.uploader_id=(select auth.uid())
      or (m.purpose='listing' and l.deleted_at is null and private.content_is_visible(l.campus_id,l.visibility))
      or (m.purpose in ('avatar','banner') and private.active_member(p.id) and not exists(
        select 1 from public.blocks b where
          (b.blocker_id=(select auth.uid()) and b.blocked_id=p.id)
          or (b.blocker_id=p.id and b.blocked_id=(select auth.uid()))
      ))
      or (m.purpose in ('community_icon','community_banner','discussion_post') and m.campus_id=public.current_campus_id())
    )
  )
$$;
create or replace function public.can_read_media(target_media uuid) returns boolean
language sql stable security invoker set search_path = '' as $$ select private.can_read_media(target_media) $$;

create or replace function private.event_rsvp_counts(target_ids uuid[]) returns table(event_id uuid, attendee_count bigint)
language sql stable security definer set search_path = '' as $$
  select e.id,count(r.profile_id) from public.events e left join public.event_rsvps r on r.event_id=e.id
  where e.id=any(target_ids) and private.content_is_visible(e.campus_id,e.visibility)
  group by e.id
$$;
create or replace function public.event_rsvp_counts(target_ids uuid[]) returns table(event_id uuid, attendee_count bigint)
language sql stable security invoker set search_path = '' as $$ select * from private.event_rsvp_counts(target_ids) $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare matched_campus uuid; staff_invite public.staff_invitations; normalized_hash text;
begin
  normalized_hash := encode(extensions.digest(lower(new.email),'sha256'),'hex');
  select * into staff_invite from public.staff_invitations
    where email_hash=normalized_hash and claimed_at is null and expires_at>now() for update;
  if staff_invite.id is not null then
    insert into public.profiles(id,campus_id,status,account_kind,verified_at,verified_until)
      values(new.id,staff_invite.campus_id,'pending','staff',null,null);
    insert into public.role_assignments(profile_id,campus_id,role) values(new.id,staff_invite.campus_id,staff_invite.role);
    update public.staff_invitations set claimed_at=now() where id=staff_invite.id;
    insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
      values(staff_invite.campus_id,null,'role.provisioned','profile',new.id::text,jsonb_build_object('role',staff_invite.role,'invitationId',staff_invite.id));
    return new;
  end if;
  select d.campus_id into matched_campus from public.campus_email_domains d
    join public.campuses c on c.id=d.campus_id
    where lower(d.domain::text)=lower(split_part(new.email,'@',2)) and d.is_enabled and c.status='enabled';
  if matched_campus is null then raise exception 'school email domain is not enabled' using errcode='28000'; end if;
  insert into public.profiles(id,campus_id,status,account_kind,verified_at,verified_until)
    values(new.id,matched_campus,'pending','student',null,null);
  insert into public.role_assignments(profile_id,campus_id,role) values(new.id,matched_campus,'student');
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(matched_campus,null,'role.provisioned','profile',new.id::text,jsonb_build_object('role','student'));
  return new;
end $$;

create or replace function public.reverify_student() returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.profiles; auth_user auth.users; matched_campus uuid;
begin
  select * into selected from public.profiles where id=(select auth.uid()) for update;
  select * into auth_user from auth.users where id=(select auth.uid());
  select d.campus_id into matched_campus from public.campus_email_domains d join public.campuses c on c.id=d.campus_id
    where lower(d.domain::text)=lower(split_part(auth_user.email,'@',2)) and d.is_enabled and c.status='enabled';
  if selected.id is null or selected.account_kind<>'student' or selected.status<>'active'
    or selected.onboarding_completed_at is null or selected.password_setup_required or auth_user.email_confirmed_at is null
    or matched_campus is null or matched_campus<>selected.campus_id then
    raise exception 'student re-verification unavailable' using errcode='42501';
  end if;
  update public.profiles set verified_at=now(),verified_until=now()+interval '1 year' where id=(select auth.uid());
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(selected.campus_id,(select auth.uid()),'account.reverified','profile',(select auth.uid())::text,'{}'::jsonb);
end $$;

create or replace function public.complete_onboarding(new_handle text) returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.profiles; auth_user auth.users; matched_campus uuid;
begin
  select * into selected from public.profiles where id=(select auth.uid()) for update;
  select * into auth_user from auth.users where id=(select auth.uid());
  if selected.id is null or auth_user.id is null then raise exception 'account not found' using errcode='P0002'; end if;
  if selected.status not in ('pending','active') or (select status from public.campuses where id=selected.campus_id)<>'enabled' then raise exception 'account is not eligible for onboarding' using errcode='42501'; end if;
  if selected.onboarding_completed_at is not null and not selected.password_setup_required then raise exception 'onboarding already complete' using errcode='23514'; end if;
  if auth_user.encrypted_password is null or auth_user.encrypted_password='' then raise exception 'password required' using errcode='23514'; end if;
  if selected.account_kind='student' then
    select d.campus_id into matched_campus from public.campus_email_domains d where d.is_enabled and d.campus_id=selected.campus_id
      and lower(d.domain::text)=lower(split_part(auth_user.email,'@',2));
    if auth_user.email_confirmed_at is null or matched_campus is null then raise exception 'email verification required' using errcode='42501'; end if;
  end if;
  update public.profiles set handle=lower(new_handle),display_name=coalesce(display_name,lower(new_handle)),status=case when status='pending' then 'active'::public.profile_status else status end,
    verified_at=case when account_kind='student' then now() else verified_at end,verified_until=case when account_kind='student' then now()+interval '1 year' else verified_until end,
    onboarding_completed_at=now(),password_setup_required=false where id=(select auth.uid());
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata) values(selected.campus_id,(select auth.uid()),'account.onboarding_completed','profile',(select auth.uid())::text,'{}'::jsonb);
end $$;

create or replace function public.rsvp_to_event(target_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.events; attendee_count integer; caller uuid:=(select auth.uid()); caller_campus uuid:=public.current_campus_id();
begin
  if caller_campus is null then raise exception 'active membership required' using errcode='42501'; end if;
  select * into selected from public.events where id=target_event and deleted_at is null and cancelled_at is null and starts_at>now() for update;
  if selected.id is null or not private.content_is_visible(selected.campus_id,selected.visibility) then
    raise exception 'event unavailable' using errcode='P0002';
  end if;
  if selected.campus_id<>caller_campus and selected.visibility<>'network' then raise exception 'event unavailable' using errcode='P0002'; end if;
  select count(*) into attendee_count from public.event_rsvps where event_id=target_event;
  if selected.capacity is not null and attendee_count>=selected.capacity then raise exception 'event is full' using errcode='23514'; end if;
  insert into public.event_rsvps(event_id,profile_id,campus_id) values(target_event,caller,caller_campus) on conflict do nothing;
  if caller<>selected.organizer_id then
    insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
    values(selected.campus_id,'event.rsvp_created',selected.id,jsonb_build_object('recipientId',selected.organizer_id,'actorId',caller,'eventId',selected.id),
      'event-rsvp:'||selected.id||':'||caller);
  end if;
end $$;

create or replace function public.cancel_event_rsvp(target_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_campus_id() is null then raise exception 'active membership required' using errcode='42501'; end if;
  delete from public.event_rsvps where event_id=target_event and profile_id=(select auth.uid());
  if not found then raise exception 'RSVP unavailable' using errcode='P0002'; end if;
end $$;

create or replace function public.set_listing_favorite(target_listing uuid, desired boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare caller uuid:=(select auth.uid()); caller_campus uuid:=public.current_campus_id(); selected public.listings;
begin
  if caller_campus is null then raise exception 'active membership required' using errcode='42501'; end if;
  select * into selected from public.listings where id=target_listing and deleted_at is null and status in ('active','reserved','sold');
  if selected.id is null or not private.content_is_visible(selected.campus_id,selected.visibility) then raise exception 'listing unavailable' using errcode='P0002'; end if;
  if desired then
    insert into public.favorites(profile_id,listing_id,campus_id) values(caller,selected.id,caller_campus) on conflict do nothing;
  else delete from public.favorites where profile_id=caller and listing_id=selected.id;
  end if;
  return desired;
end $$;

drop function if exists public.create_direct_conversation_request(uuid);

-- Keep legacy RPC signatures present for rollback compatibility, but fail closed:
-- clients without an opening-message composer may not create new contact.
create function public.create_direct_conversation_request(target_profile uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'an opening message is required; update the client before creating requests' using errcode='0A000';
end $$;
create or replace function public.create_listing_conversation(target_listing uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'an opening message is required; update the client before contacting a seller' using errcode='0A000';
end $$;

create or replace function private.create_conversation_request(
  target_profile uuid, submitted_opening text, submitted_key uuid,
  submitted_context text default 'direct', submitted_context_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid:=(select auth.uid()); caller_campus uuid:=public.current_campus_id(); recipient_campus uuid;
  request_id uuid; existing_conversation uuid; daily_limit integer; cooldown_days integer;
  selected_listing public.listings; selected_event public.events; existing_request public.conversation_requests;
begin
  submitted_opening:=btrim(submitted_opening);
  if caller_campus is null then raise exception 'active membership required' using errcode='42501'; end if;
  if char_length(submitted_opening) not between 10 and 500 then raise exception 'opening message must be between 10 and 500 characters' using errcode='23514'; end if;
  if target_profile=caller then raise exception 'cannot request yourself' using errcode='23514'; end if;
  select * into existing_request from public.conversation_requests where requester_id=caller and idempotency_key=submitted_key;
  if existing_request.id is not null then
    if existing_request.recipient_id<>target_profile or existing_request.context_type<>submitted_context
      or existing_request.listing_id is distinct from (case when submitted_context='listing' then submitted_context_id else null end)
      or existing_request.event_id is distinct from (case when submitted_context='event' then submitted_context_id else null end) then
      raise exception 'idempotency key was already used for different input' using errcode='23505';
    end if;
    select c.id into existing_conversation from public.conversations c where c.request_id=existing_request.id;
    return jsonb_build_object('state',existing_request.status::text,'requestId',existing_request.id,'conversationId',existing_conversation);
  end if;
  select p.campus_id into recipient_campus from public.profiles p where p.id=target_profile and private.active_member(p.id);
  if recipient_campus is null then raise exception 'profile unavailable' using errcode='P0002'; end if;
  if caller_campus<>recipient_campus and not private.network_features_enabled() then raise exception 'network messaging unavailable' using errcode='42501'; end if;
  if exists(select 1 from public.blocks where (blocker_id=caller and blocked_id=target_profile) or (blocker_id=target_profile and blocked_id=caller)) then
    raise exception 'request unavailable' using errcode='42501';
  end if;
  if submitted_context='listing' then
    select * into selected_listing from public.listings where id=submitted_context_id and seller_id=target_profile and deleted_at is null and status in ('active','reserved');
    if selected_listing.id is null or not private.content_is_visible(selected_listing.campus_id,selected_listing.visibility) then raise exception 'listing unavailable' using errcode='P0002'; end if;
    select c.id into existing_conversation from public.conversations c
      join public.conversation_participants a on a.conversation_id=c.id and a.profile_id=caller
      join public.conversation_participants b on b.conversation_id=c.id and b.profile_id=target_profile
      where c.listing_id=selected_listing.id limit 1;
  elsif submitted_context='event' then
    select * into selected_event from public.events where id=submitted_context_id and organizer_id=target_profile and deleted_at is null and cancelled_at is null;
    if selected_event.id is null or not private.content_is_visible(selected_event.campus_id,selected_event.visibility) then raise exception 'event unavailable' using errcode='P0002'; end if;
    select c.id into existing_conversation from public.conversations c
      join public.conversation_participants a on a.conversation_id=c.id and a.profile_id=caller
      join public.conversation_participants b on b.conversation_id=c.id and b.profile_id=target_profile
      where c.event_id=selected_event.id limit 1;
  elsif submitted_context='direct' and submitted_context_id is null then
    select c.id into existing_conversation from public.conversations c where c.direct_pair_key=
      least(caller::text,target_profile::text)||':'||greatest(caller::text,target_profile::text) limit 1;
  else raise exception 'invalid request context' using errcode='23514';
  end if;
  if existing_conversation is not null then return jsonb_build_object('state','existing','conversationId',existing_conversation); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(caller::text,target_profile::text)||':'||greatest(caller::text,target_profile::text),0));
  select * into existing_request from public.conversation_requests where requester_id=caller and idempotency_key=submitted_key;
  if existing_request.id is not null then
    if existing_request.recipient_id<>target_profile or existing_request.context_type<>submitted_context
      or existing_request.listing_id is distinct from (case when submitted_context='listing' then submitted_context_id else null end)
      or existing_request.event_id is distinct from (case when submitted_context='event' then submitted_context_id else null end) then
      raise exception 'idempotency key was already used for different input' using errcode='23505';
    end if;
    select c.id into existing_conversation from public.conversations c where c.request_id=existing_request.id;
    return jsonb_build_object('state',existing_request.status::text,'requestId',existing_request.id,'conversationId',existing_conversation);
  end if;
  if exists(select 1 from public.conversation_requests where status='pending' and
    ((requester_id=caller and recipient_id=target_profile) or (requester_id=target_profile and recipient_id=caller))) then
    raise exception 'a pending request already exists' using errcode='23505';
  end if;
  daily_limit:=coalesce((select value::text::integer from public.runtime_settings where key='message_request_daily_limit'),10);
  cooldown_days:=coalesce((select value::text::integer from public.runtime_settings where key='message_request_decline_cooldown_days'),14);
  if (select count(*) from public.conversation_requests where requester_id=caller and created_at>now()-interval '24 hours')>=daily_limit then
    raise exception 'daily request limit reached' using errcode='P0001';
  end if;
  if exists(select 1 from public.conversation_requests where requester_id=caller and recipient_id=target_profile and status='declined'
    and responded_at>now()-make_interval(days=>cooldown_days)) then raise exception 'request unavailable' using errcode='42501'; end if;
  insert into public.conversation_requests(campus_id,requester_id,recipient_id,opening_message,idempotency_key,
    requester_campus_id,recipient_campus_id,context_type,listing_id,event_id)
  values(caller_campus,caller,target_profile,submitted_opening,submitted_key,caller_campus,recipient_campus,submitted_context,
    case when submitted_context='listing' then submitted_context_id end,case when submitted_context='event' then submitted_context_id end)
  on conflict(requester_id,idempotency_key) where idempotency_key is not null do update set idempotency_key=excluded.idempotency_key
  returning id into request_id;
  insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
    values(recipient_campus,'conversation_request.created',request_id,jsonb_build_object('recipientId',target_profile,'actorId',caller,'requestId',request_id),
      'conversation-request-created:'||request_id) on conflict(idempotency_key) do nothing;
  return jsonb_build_object('state','pending','requestId',request_id);
end $$;

create or replace function public.create_conversation_request(
  target_profile uuid, opening_message text, idempotency_key uuid,
  context_type text default 'direct', context_id uuid default null
) returns jsonb
language sql security invoker set search_path = '' as $$
  select private.create_conversation_request(target_profile,opening_message,idempotency_key,context_type,context_id)
$$;

create or replace function public.respond_to_conversation_request(target_request uuid, response text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare selected public.conversation_requests; conversation_id uuid; pair_key text;
begin
  if response not in ('accepted','declined') then raise exception 'invalid response' using errcode='23514'; end if;
  select * into selected from public.conversation_requests where id=target_request and recipient_id=(select auth.uid()) and status='pending' for update;
  if selected.id is null or selected.opening_message is null then raise exception 'request unavailable' using errcode='P0002'; end if;
  if not private.active_member(selected.requester_id) or not private.active_member(selected.recipient_id) or exists(select 1 from public.blocks where
    (blocker_id=selected.requester_id and blocked_id=selected.recipient_id) or (blocker_id=selected.recipient_id and blocked_id=selected.requester_id)) then
    update public.conversation_requests set status='cancelled',responded_at=now(),unavailable_reason='blocked' where id=selected.id;
    return null;
  end if;
  if selected.context_type='listing' and not exists(select 1 from public.listings l join public.campuses c on c.id=l.campus_id
    where l.id=selected.listing_id and l.seller_id=selected.recipient_id and l.deleted_at is null and l.status in ('active','reserved') and c.status='enabled'
      and (selected.requester_campus_id=selected.recipient_campus_id or l.visibility='network')) then
    update public.conversation_requests set status='cancelled',responded_at=now(),unavailable_reason='context_unavailable' where id=selected.id;
    return null;
  end if;
  if selected.context_type='event' and not exists(select 1 from public.events e join public.campuses c on c.id=e.campus_id
    where e.id=selected.event_id and e.organizer_id=selected.recipient_id and e.deleted_at is null and e.cancelled_at is null and c.status='enabled'
      and (selected.requester_campus_id=selected.recipient_campus_id or e.visibility='network')) then
    update public.conversation_requests set status='cancelled',responded_at=now(),unavailable_reason='context_unavailable' where id=selected.id;
    return null;
  end if;
  if response='declined' then
    update public.conversation_requests set status='declined',responded_at=now() where id=selected.id;
    return null;
  end if;
  pair_key:=least(selected.requester_id::text,selected.recipient_id::text)||':'||greatest(selected.requester_id::text,selected.recipient_id::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pair_key||':'||selected.context_type||':'||coalesce(selected.listing_id::text,selected.event_id::text,''),0));
  if selected.context_type='direct' then select id into conversation_id from public.conversations where direct_pair_key=pair_key;
  elsif selected.context_type='listing' then
    select c.id into conversation_id from public.conversations c join public.conversation_participants a on a.conversation_id=c.id and a.profile_id=selected.requester_id
      join public.conversation_participants b on b.conversation_id=c.id and b.profile_id=selected.recipient_id where c.listing_id=selected.listing_id limit 1;
  else
    select c.id into conversation_id from public.conversations c join public.conversation_participants a on a.conversation_id=c.id and a.profile_id=selected.requester_id
      join public.conversation_participants b on b.conversation_id=c.id and b.profile_id=selected.recipient_id where c.event_id=selected.event_id limit 1;
  end if;
  if conversation_id is null then
    insert into public.conversations(campus_id,created_by,request_id,direct_pair_key,listing_id,event_id)
    values(selected.requester_campus_id,selected.requester_id,selected.id,case when selected.context_type='direct' then pair_key end,selected.listing_id,selected.event_id)
    returning id into conversation_id;
    insert into public.conversation_participants(conversation_id,profile_id,campus_id,last_read_at) values
      (conversation_id,selected.requester_id,selected.requester_campus_id,now()),
      (conversation_id,selected.recipient_id,selected.recipient_campus_id,now());
  end if;
  insert into public.messages(campus_id,conversation_id,sender_id,body,idempotency_key,request_id)
    values(selected.requester_campus_id,conversation_id,selected.requester_id,selected.opening_message,selected.id,selected.id)
    on conflict(request_id) do nothing;
  update public.conversation_requests set status='accepted',responded_at=now() where id=selected.id;
  insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
    values(selected.requester_campus_id,'conversation_request.accepted',selected.id,
      jsonb_build_object('recipientId',selected.requester_id,'actorId',selected.recipient_id,'requestId',selected.id,'conversationId',conversation_id),
      'conversation-request-accepted:'||selected.id) on conflict(idempotency_key) do nothing;
  return conversation_id;
end $$;

create or replace function private.conversation_request_box(requested_box text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'requesterId',r.requester_id,'recipientId',r.recipient_id,
    'status',case when requested_box='sent' and r.status in ('declined','cancelled') then 'unavailable' else r.status::text end,
    'openingMessage',r.opening_message,'createdAt',r.created_at,'respondedAt',r.responded_at,
    'contextType',r.context_type,'listingId',r.listing_id,'eventId',r.event_id,
    'person',jsonb_build_object('id',p.id,'username',p.handle::text,'displayName',p.display_name,'avatarId',p.avatar_media_id,
      'campusId',c.id,'campusName',c.name,'campusShortName',c.short_name,'campusSlug',c.slug::text,'joinedMonth',date_trunc('month',p.created_at)::date)
  ) order by r.created_at desc),'[]'::jsonb)
  from public.conversation_requests r
  join public.profiles p on p.id=case when requested_box='incoming' then r.requester_id else r.recipient_id end
  join public.campuses c on c.id=p.campus_id
  where (requested_box='incoming' and r.recipient_id=(select auth.uid()) or requested_box='sent' and r.requester_id=(select auth.uid()))
    and r.opening_message is not null and r.created_at>now()-interval '180 days'
$$;
create or replace function public.conversation_request_box(requested_box text) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if requested_box not in ('incoming','sent') then raise exception 'invalid request box' using errcode='23514'; end if;
  return private.conversation_request_box(requested_box);
end $$;

drop function if exists public.conversation_inbox();
create function public.conversation_inbox()
returns table(
  id uuid, listing_id uuid, listing_title text, event_id uuid, event_title text,
  last_message_at timestamptz, other_profile_id uuid, other_handle text,
  other_display_name text, other_avatar_id uuid, other_campus_name text,
  other_campus_short_name text, latest_body text, latest_created_at timestamptz,
  unread_count bigint, is_blocked boolean
) language sql stable security definer set search_path = '' as $$
  select c.id,c.listing_id,
    case when l.campus_id=public.current_campus_id() or l.visibility='network' then l.title end,
    c.event_id,case when e.campus_id=public.current_campus_id() or e.visibility='network' then e.title end,
    c.last_message_at,other.profile_id,p.handle::text,p.display_name,p.avatar_media_id,
    campus.name,campus.short_name,latest.body,latest.created_at,
    (select count(*) from public.messages unread where unread.conversation_id=c.id
      and unread.sender_id<>(select auth.uid())
      and unread.created_at>coalesce(mine.last_read_at,'epoch'::timestamptz) and unread.deleted_at is null),
    not public.is_conversation_unblocked(c.id)
  from public.conversations c
  join public.conversation_participants mine on mine.conversation_id=c.id and mine.profile_id=(select auth.uid())
  join public.conversation_participants other on other.conversation_id=c.id and other.profile_id<>(select auth.uid())
  join public.profiles p on p.id=other.profile_id join public.campuses campus on campus.id=p.campus_id
  left join public.listings l on l.id=c.listing_id
  left join public.events e on e.id=c.event_id
  left join lateral (
    select m.body,m.created_at from public.messages m where m.conversation_id=c.id and m.deleted_at is null
    order by m.created_at desc limit 1
  ) latest on true
  where public.is_conversation_unblocked(c.id)
    or coalesce((select value #>> '{}' from public.runtime_settings where key='blocked_conversation_visibility'),'read_only')<>'hidden'
  order by coalesce(latest.created_at,c.created_at) desc
$$;

create or replace function public.set_profile_block(target_profile uuid, desired boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare caller uuid:=(select auth.uid()); caller_campus uuid:=public.current_campus_id();
begin
  if caller_campus is null then raise exception 'active membership required' using errcode='42501'; end if;
  if target_profile=caller then raise exception 'cannot block yourself' using errcode='23514'; end if;
  if not private.active_member(target_profile) then raise exception 'profile unavailable' using errcode='P0002'; end if;
  if desired then
    insert into public.blocks(blocker_id,blocked_id,campus_id) values(caller,target_profile,caller_campus) on conflict do nothing;
    update public.conversation_requests set status='cancelled',responded_at=now(),unavailable_reason='blocked'
      where status='pending' and ((requester_id=caller and recipient_id=target_profile) or (requester_id=target_profile and recipient_id=caller));
  else delete from public.blocks where blocker_id=caller and blocked_id=target_profile;
  end if;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(caller_campus,caller,case when desired then 'profile.blocked' else 'profile.unblocked' end,'profile',target_profile::text,'{}'::jsonb);
  return desired;
end $$;

create or replace function public.message_outbox() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at=new.created_at where id=new.conversation_id;
  insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
  values(new.campus_id,'message.created',new.id,jsonb_build_object('conversationId',new.conversation_id,'senderId',new.sender_id,'requestId',new.request_id),'message:'||new.id);
  return new;
end $$;

drop policy if exists messages_participant_insert on public.messages;
create policy messages_participant_insert on public.messages for insert to authenticated with check (
  sender_id=(select auth.uid()) and campus_id=public.current_campus_id()
  and public.is_conversation_participant(conversation_id) and public.is_conversation_unblocked(conversation_id)
);

drop policy if exists reports_self_or_staff_read on public.reports;
create policy reports_self_or_staff_read on public.reports for select to authenticated using (
  reporter_id=(select auth.uid())
  or (campus_id=public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa())
  or (platform_visible and private.has_platform_role(array['moderator','admin']::public.platform_role[]) and public.has_mfa())
);

drop policy if exists audit_staff_read on public.audit_log;
create policy audit_staff_read on public.audit_log for select to authenticated using (
  (campus_id=public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa())
  or (private.has_platform_role(array['admin']::public.platform_role[]) and public.has_mfa())
);
drop policy if exists moderation_staff_read on public.moderation_actions;
create policy moderation_staff_read on public.moderation_actions for select to authenticated using (
  (campus_id=public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa())
  or (public.has_mfa() and private.has_platform_role(array['moderator','admin']::public.platform_role[])
    and exists(select 1 from public.reports r where r.id=report_id and r.platform_visible))
);

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (
  target_type in ('listing','event','profile','message','conversation_request','community','discussion_post','discussion_comment')
);

create or replace function public.report_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.target_type='message' then
    select jsonb_build_object('messageId',m.id,'senderId',m.sender_id,'body',m.body,'createdAt',m.created_at)
      into new.message_snapshot from public.messages m where m.id=new.target_id and public.is_conversation_participant(m.conversation_id);
    if new.message_snapshot is null then raise exception 'message is not reportable' using errcode='42501'; end if;
  elsif new.target_type='conversation_request' then
    select jsonb_build_object('requestId',r.id,'senderId',r.requester_id,'recipientId',r.recipient_id,'openingMessage',r.opening_message,'createdAt',r.created_at,'contextType',r.context_type)
      into new.message_snapshot from public.conversation_requests r where r.id=new.target_id and r.recipient_id=(select auth.uid());
    if new.message_snapshot is null then raise exception 'request is not reportable' using errcode='42501'; end if;
  elsif new.target_type='community' then
    select jsonb_build_object('communityId',c.id,'slug',c.slug,'displayName',c.display_name,'description',c.description)
      into new.content_snapshot from public.discussion_communities c where c.id=new.target_id and c.campus_id=public.current_campus_id();
  elsif new.target_type='discussion_post' then
    select jsonb_build_object('postId',p.id,'communityId',p.community_id,'authorId',p.author_id,'title',p.title,'body',p.body,'linkUrl',p.link_url,'createdAt',p.created_at)
      into new.content_snapshot from public.discussion_posts p where p.id=new.target_id and p.campus_id=public.current_campus_id();
  elsif new.target_type='discussion_comment' then
    select jsonb_build_object('commentId',c.id,'communityId',c.community_id,'postId',c.post_id,'authorId',c.author_id,'body',c.body,'createdAt',c.created_at)
      into new.content_snapshot from public.discussion_comments c where c.id=new.target_id and c.campus_id=public.current_campus_id();
  end if;
  if new.target_type in ('community','discussion_post','discussion_comment') and new.content_snapshot is null then
    raise exception 'discussion content is not reportable' using errcode='42501';
  end if;
  return new;
end $$;

create or replace function public.submit_report(submitted_type text,submitted_id uuid,submitted_reason text,submitted_details text,submitted_key uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare caller uuid:=(select auth.uid()); caller_campus uuid:=public.current_campus_id(); target_campus uuid; report_id uuid; global_scope boolean:=false;
begin
  if caller_campus is null then raise exception 'active membership required' using errcode='42501'; end if;
  if submitted_type='listing' then
    select campus_id,(visibility='network') into target_campus,global_scope from public.listings
      where id=submitted_id and deleted_at is null and (campus_id=caller_campus or status in ('active','reserved','sold')) and private.content_is_visible(campus_id,visibility);
  elsif submitted_type='event' then
    select campus_id,(visibility='network') into target_campus,global_scope from public.events
      where id=submitted_id and deleted_at is null and (campus_id=caller_campus or cancelled_at is null) and private.content_is_visible(campus_id,visibility);
  elsif submitted_type='profile' then select campus_id,(campus_id<>caller_campus) into target_campus,global_scope from public.profiles where id=submitted_id and private.active_member(id);
  elsif submitted_type='message' then select m.campus_id,true into target_campus,global_scope from public.messages m where m.id=submitted_id and public.is_conversation_participant(m.conversation_id);
  elsif submitted_type='conversation_request' then select requester_campus_id,true into target_campus,global_scope from public.conversation_requests where id=submitted_id and recipient_id=caller;
  elsif submitted_type in ('community','discussion_post','discussion_comment') then target_campus:=caller_campus;
  else raise exception 'unsupported target' using errcode='23514';
  end if;
  if target_campus is null then raise exception 'target unavailable' using errcode='P0002'; end if;
  insert into public.reports(campus_id,subject_campus_id,platform_visible,reporter_id,target_type,target_id,reason,details,idempotency_key)
    values(target_campus,target_campus,global_scope,caller,submitted_type,submitted_id,submitted_reason,submitted_details,submitted_key)
    on conflict(reporter_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into report_id;
  return report_id;
end $$;

create or replace function public.moderation_report_queue()
returns table(id uuid,target_type text,target_id uuid,reason text,details text,message_snapshot jsonb,status public.report_status,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare campus uuid:=public.current_campus_id(); platform_access boolean:=private.has_platform_role(array['moderator','admin']::public.platform_role[]);
begin
  if not public.has_mfa() or not (platform_access or public.has_role(array['moderator','admin']::public.app_role[])) then
    raise exception 'MFA-protected moderator access required' using errcode='42501';
  end if;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
  values(campus,(select auth.uid()),'security.sensitive_access','moderation_queue',campus::text,
    jsonb_build_object('scope',case when platform_access then 'platform' else 'campus' end));
  return query select r.id,r.target_type,r.target_id,r.reason,r.details,r.message_snapshot,r.status,r.created_at
  from public.reports r where r.status in ('open','reviewing') and
    ((platform_access and r.platform_visible) or r.campus_id=campus) order by r.created_at limit 100;
end $$;

create or replace function public.moderate_report(target_report uuid,chosen_action text,action_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.reports; caller uuid:=(select auth.uid()); campus uuid:=public.current_campus_id(); reporter_campus uuid; platform_access boolean:=private.has_platform_role(array['moderator','admin']::public.platform_role[]); target_staff boolean:=false;
begin
  if not public.has_mfa() or not (platform_access or public.has_role(array['moderator','admin']::public.app_role[])) then raise exception 'MFA-protected moderator access required' using errcode='42501'; end if;
  select * into selected from public.reports where id=target_report and status in ('open','reviewing')
    and ((platform_access and platform_visible) or campus_id=campus) for update;
  if selected.id is null then raise exception 'report not found' using errcode='P0002'; end if;
  if chosen_action not in ('dismiss','warn','hide_content','suspend','restore') or char_length(btrim(action_reason))<3 then raise exception 'valid action and reason required' using errcode='23514'; end if;
  if selected.target_type='profile' then select exists(select 1 from public.role_assignments where profile_id=selected.target_id and role in ('moderator','admin')) or exists(select 1 from public.platform_role_assignments where profile_id=selected.target_id) into target_staff; end if;
  if target_staff and not private.has_platform_role(array['admin']::public.platform_role[]) and not (selected.campus_id=campus and public.has_role(array['admin']::public.app_role[])) then raise exception 'administrator required for staff accounts' using errcode='42501'; end if;
  if chosen_action='hide_content' and selected.target_type='listing' then update public.listings set status='withdrawn' where id=selected.target_id and campus_id=selected.subject_campus_id and status not in ('sold','withdrawn');
  elsif chosen_action='hide_content' and selected.target_type='event' then update public.events set cancelled_at=coalesce(cancelled_at,now()) where id=selected.target_id and campus_id=selected.subject_campus_id;
  elsif chosen_action='suspend' and selected.target_type='profile' then update public.profiles set status='suspended' where id=selected.target_id and campus_id=selected.subject_campus_id and id<>caller;
  elsif chosen_action='restore' and selected.target_type='profile' then update public.profiles set status='active' where id=selected.target_id and campus_id=selected.subject_campus_id;
  end if;
  insert into public.moderation_actions(campus_id,report_id,moderator_id,subject_profile_id,action,reason)
    values(selected.subject_campus_id,selected.id,caller,case when selected.target_type='profile' then selected.target_id end,chosen_action,btrim(action_reason));
  update public.reports set status=(case when chosen_action='dismiss' then 'dismissed' else 'resolved' end)::public.report_status,resolved_at=now(),assigned_to=caller where id=selected.id;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(selected.subject_campus_id,caller,'moderation.'||chosen_action,selected.target_type,selected.target_id::text,
      jsonb_build_object('reportId',selected.id,'scope',case when platform_access and selected.platform_visible then 'platform' else 'campus' end,
        'reporterCampusId',selected.campus_id,'subjectCampusId',selected.subject_campus_id));
  select campus_id into reporter_campus from public.profiles where id=selected.reporter_id;
  insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
    values(reporter_campus,'moderation.report_resolved',selected.id,
      jsonb_build_object('recipientId',selected.reporter_id,'actorId',caller,'reportId',selected.id),
      'moderation-report-resolved:'||selected.id) on conflict(idempotency_key) do nothing;
end $$;

-- Remove default execution from every new privileged helper and expose only the intended API.
-- RLS is only evaluated after PostgreSQL table privileges. Keep direct reads explicit for
-- the application surfaces that intentionally rely on RLS, while privileged mutations
-- continue to flow through the narrow functions below.
-- Production projects may retain broader legacy Data API grants than a clean local reset.
-- Normalize those grants before asserting the privileged-write boundary.
revoke insert, update, delete on table public.conversation_requests from anon, authenticated;
revoke insert, update, delete on table public.conversations from anon, authenticated;
revoke insert, update, delete on table public.conversation_participants from anon, authenticated;
revoke insert, update, delete on table public.blocks from anon, authenticated;
revoke insert, update, delete on table public.favorites from anon, authenticated;
revoke insert, update, delete on table public.event_rsvps from anon, authenticated;
revoke insert, update, delete on table public.reports from anon, authenticated;
revoke insert, update, delete on table public.moderation_actions from anon, authenticated;
revoke insert, update, delete on table public.notifications from anon, authenticated;
revoke insert, update, delete on table public.outbox_events from anon, authenticated;
revoke insert, update, delete on table public.audit_log from anon, authenticated;
revoke insert, update, delete on table public.platform_role_assignments from anon, authenticated;

grant select on table public.campuses to authenticated;
grant select on table public.profiles to authenticated;
grant select, insert on table public.listings to authenticated;
grant select on table public.favorites to authenticated;
grant select on table public.events to authenticated;
grant insert on table public.events to authenticated;
grant select on table public.event_rsvps to authenticated;
grant select on table public.conversations to authenticated;
grant select on table public.conversation_participants to authenticated;
grant select on table public.conversation_requests to authenticated;
grant select, insert on table public.messages to authenticated;
grant select on table public.blocks to authenticated;
grant select on table public.reports to authenticated;
grant select on table public.moderation_actions to authenticated;
grant select on table public.notifications to authenticated;
grant select on table public.audit_log to authenticated;
grant select on table public.role_assignments to authenticated;
grant select on table public.platform_role_assignments to authenticated;

revoke all on function private.network_features_enabled() from public,anon;
revoke all on function private.active_member(uuid) from public,anon;
revoke all on function private.has_platform_role(public.platform_role[]) from public,anon;
revoke all on function private.content_is_visible(uuid,public.content_visibility) from public,anon;
revoke all on function private.safe_profile_cards(uuid[]) from public,anon;
revoke all on function private.safe_profile_by_username(text) from public,anon;
revoke all on function private.search_member_directory(text,text,integer) from public,anon;
revoke all on function private.safe_listing_media(uuid[]) from public,anon;
revoke all on function private.can_read_media(uuid) from public,anon;
revoke all on function private.event_rsvp_counts(uuid[]) from public,anon;
revoke all on function private.create_conversation_request(uuid,text,uuid,text,uuid) from public,anon;
revoke all on function private.conversation_request_box(text) from public,anon;
grant execute on function private.network_features_enabled() to authenticated;
grant execute on function private.active_member(uuid) to authenticated;
grant execute on function private.has_platform_role(public.platform_role[]) to authenticated;
grant execute on function private.content_is_visible(uuid,public.content_visibility) to authenticated;
grant execute on function private.safe_profile_cards(uuid[]) to authenticated;
grant execute on function private.safe_profile_by_username(text) to authenticated;
grant execute on function private.search_member_directory(text,text,integer) to authenticated;
grant execute on function private.safe_listing_media(uuid[]) to authenticated;
grant execute on function private.can_read_media(uuid) to authenticated;
grant execute on function private.event_rsvp_counts(uuid[]) to authenticated;
grant execute on function private.create_conversation_request(uuid,text,uuid,text,uuid) to authenticated;
grant execute on function private.conversation_request_box(text) to authenticated;

grant execute on function public.network_features_enabled() to authenticated;
grant execute on function public.has_platform_role(public.platform_role[]) to authenticated;
grant execute on function public.safe_profile_cards(uuid[]) to authenticated;
grant execute on function public.safe_profile_by_username(text) to authenticated;
grant execute on function public.search_member_directory(text,text,integer) to authenticated;
grant execute on function public.safe_listing_media(uuid[]) to authenticated;
grant execute on function public.can_read_media(uuid) to authenticated;
grant execute on function public.event_rsvp_counts(uuid[]) to authenticated;
grant execute on function public.create_conversation_request(uuid,text,uuid,text,uuid) to authenticated;
grant execute on function public.conversation_request_box(text) to authenticated;
revoke execute on function public.create_direct_conversation_request(uuid) from public,anon;
revoke execute on function public.create_listing_conversation(uuid) from public,anon;
grant execute on function public.create_direct_conversation_request(uuid) to authenticated;
grant execute on function public.create_listing_conversation(uuid) to authenticated;
revoke execute on function public.validate_listing_exchange_and_visibility() from public,anon,authenticated;
revoke execute on function public.validate_campus_timezone() from public,anon,authenticated;
revoke execute on function public.handle_listing_visibility_narrowing() from public,anon,authenticated;
revoke execute on function public.prevent_event_visibility_narrowing() from public,anon,authenticated;
revoke execute on function public.handle_new_user() from public,anon,authenticated;
revoke execute on function public.message_outbox() from public,anon,authenticated;
revoke execute on function public.report_snapshot() from public,anon,authenticated;
revoke execute on function public.reverify_student() from public,anon;
revoke execute on function public.complete_onboarding(text) from public,anon;
revoke execute on function public.rsvp_to_event(uuid) from public,anon;
revoke execute on function public.cancel_event_rsvp(uuid) from public,anon;
revoke execute on function public.set_listing_favorite(uuid,boolean) from public,anon;
revoke execute on function public.respond_to_conversation_request(uuid,text) from public,anon;
revoke execute on function public.set_profile_block(uuid,boolean) from public,anon;
revoke execute on function public.submit_report(text,uuid,text,text,uuid) from public,anon;
grant execute on function public.reverify_student() to authenticated;
grant execute on function public.complete_onboarding(text) to authenticated;
grant execute on function public.rsvp_to_event(uuid) to authenticated;
grant execute on function public.cancel_event_rsvp(uuid) to authenticated;
grant execute on function public.set_listing_favorite(uuid,boolean) to authenticated;
grant execute on function public.respond_to_conversation_request(uuid,text) to authenticated;
grant execute on function public.set_profile_block(uuid,boolean) to authenticated;
grant execute on function public.submit_report(text,uuid,text,text,uuid) to authenticated;
grant execute on function public.conversation_inbox() to authenticated;
revoke execute on function public.moderation_report_queue() from public,anon;
revoke execute on function public.moderate_report(uuid,text,text) from public,anon;
grant execute on function public.moderation_report_queue() to authenticated;
grant execute on function public.moderate_report(uuid,text,text) to authenticated;

-- Migration invariants fail closed if a backfill was incomplete.
do $$
begin
  if exists(select 1 from public.profiles where campus_id is null) then raise exception 'profile campus backfill failed'; end if;
  if exists(select 1 from public.listings where visibility<>'campus_only' or (exchange_methods is null and not legacy_exchange_unspecified)) then
    raise exception 'listing visibility/exchange backfill failed';
  end if;
  if exists(select 1 from public.events where visibility<>'campus_only') then raise exception 'event visibility backfill failed'; end if;
  if exists(select 1 from public.conversation_requests where status='pending' and opening_message is null) then
    raise exception 'legacy pending request backfill failed';
  end if;
  if exists(select 1 from public.conversation_participants cp join public.profiles p on p.id=cp.profile_id where cp.campus_id<>p.campus_id) then
    raise exception 'conversation participant campus backfill failed';
  end if;
  if exists(select 1 from public.conversations c where (select count(*) from public.conversation_participants cp where cp.conversation_id=c.id)<2) then
    raise exception 'existing conversation participants are incomplete';
  end if;
  if exists(select 1 from public.conversation_requests r where r.status='accepted' and not exists(select 1 from public.conversations c where c.request_id=r.id)) then
    raise exception 'accepted request lost its conversation';
  end if;
  if has_table_privilege('authenticated','public.conversation_requests','INSERT')
    or has_table_privilege('authenticated','public.conversation_participants','INSERT')
    or has_table_privilege('authenticated','public.blocks','INSERT') then
    raise exception 'privileged messaging writes were exposed directly';
  end if;
  if exists(
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity
  ) then raise exception 'an exposed public table is missing RLS'; end if;
end $$;
