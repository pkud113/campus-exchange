create extension if not exists pg_trgm with schema extensions;
create extension if not exists citext with schema extensions;

create type public.profile_status as enum ('pending', 'active', 'suspended', 'deleted');
create type public.app_role as enum ('student', 'organizer', 'moderator', 'admin');
create type public.listing_status as enum ('draft', 'active', 'reserved', 'sold', 'withdrawn');
create type public.listing_condition as enum ('new', 'like_new', 'good', 'fair', 'poor');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.outbox_status as enum ('pending', 'processing', 'delivered', 'dead_letter');

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug extensions.citext not null unique,
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now()
);

create table public.campus_email_domains (
  campus_id uuid not null references public.campuses(id) on delete cascade,
  domain extensions.citext not null,
  primary key (campus_id, domain),
  unique (domain),
  check (domain !~ '[*@]')
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  handle extensions.citext unique,
  display_name text,
  bio text not null default '' check (char_length(bio) <= 500),
  status public.profile_status not null default 'active',
  verified_at timestamptz not null default now(),
  verified_until timestamptz not null default (now() + interval '1 year'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (handle is null or handle::text ~ '^[a-z0-9_]{3,24}$'),
  check (display_name is null or char_length(display_name) between 1 and 80)
);

create table public.role_assignments (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (profile_id, role)
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  seller_id uuid not null references public.profiles(id),
  buyer_id uuid references public.profiles(id),
  title text not null check (char_length(title) between 3 and 100),
  description text not null check (char_length(description) between 10 and 5000),
  category text not null check (category in ('books','electronics','furniture','clothing','housing','transport','other')),
  condition public.listing_condition not null,
  price_cents integer not null check (price_cents between 0 and 10000000),
  currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status public.listing_status not null default 'draft',
  idempotency_key uuid not null,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_id, idempotency_key),
  check ((status not in ('reserved','sold')) or buyer_id is not null),
  check (buyer_id is null or buyer_id <> seller_id)
);

create table public.favorites (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  created_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);

create table public.media_uploads (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  uploader_id uuid not null references public.profiles(id),
  listing_id uuid references public.listings(id) on delete cascade,
  object_key text not null unique,
  content_type text not null check (content_type in ('image/webp','image/png','image/jpeg')),
  byte_size integer not null check (byte_size between 1 and 8388608),
  status text not null default 'pending' check (status in ('pending','ready','rejected','deleted')),
  alt_text text not null default '' check (char_length(alt_text) <= 300),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  organizer_id uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 3 and 120),
  description text not null check (char_length(description) between 10 and 5000),
  location text not null check (char_length(location) between 2 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity integer check (capacity between 1 and 10000),
  cancelled_at timestamptz,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organizer_id, idempotency_key),
  check (ends_at > starts_at)
);

create table public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  listing_id uuid references public.listings(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 4000),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (sender_id, idempotency_key)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  reporter_id uuid not null references public.profiles(id),
  target_type text not null check (target_type in ('listing','event','profile','message')),
  target_id uuid not null,
  reason text not null check (reason in ('fraud','harassment','prohibited_item','spam','unsafe','other')),
  details text not null default '' check (char_length(details) <= 2000),
  message_snapshot jsonb,
  status public.report_status not null default 'open',
  idempotency_key uuid not null,
  assigned_to uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, idempotency_key)
);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  report_id uuid references public.reports(id),
  moderator_id uuid not null references public.profiles(id),
  subject_profile_id uuid references public.profiles(id),
  action text not null check (action in ('dismiss','warn','hide_content','suspend','restore')),
  reason text not null check (char_length(reason) between 3 and 1000),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 500),
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  event_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null default '{}',
  idempotency_key text not null unique,
  status public.outbox_status not null default 'pending',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  campus_id uuid references public.campuses(id),
  actor_id uuid references public.profiles(id),
  action text not null,
  target_type text not null,
  target_id text not null,
  request_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  hits integer not null check (hits >= 0)
);

create index listings_campus_status_created_idx on public.listings (campus_id, status, created_at desc, id desc);
create index listings_search_idx on public.listings using gin (search_vector);
create index listings_title_trgm_idx on public.listings using gin (title extensions.gin_trgm_ops);
create index events_campus_start_idx on public.events (campus_id, starts_at, id);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc, id desc);
create index notifications_profile_unread_idx on public.notifications (profile_id, created_at desc) where read_at is null;
create index reports_campus_status_idx on public.reports (campus_id, status, created_at);
create index outbox_available_idx on public.outbox_events (status, available_at) where status in ('pending','processing');

create or replace function public.current_campus_id() returns uuid language sql stable security definer set search_path = '' as $$
  select campus_id from public.profiles where id = (select auth.uid()) and status = 'active' and verified_until > now()
$$;

create or replace function public.is_active_student() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and status = 'active' and verified_until > now())
$$;

create or replace function public.has_role(required_roles public.app_role[]) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.role_assignments where profile_id = (select auth.uid()) and role = any(required_roles))
$$;

create or replace function public.is_conversation_participant(conversation uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.conversation_participants where conversation_id = conversation and profile_id = (select auth.uid()))
$$;

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger listings_touch before update on public.listings for each row execute function public.touch_updated_at();
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();

create or replace function public.enforce_listing_transition() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = new.status then return new; end if;
  if (old.status = 'draft' and new.status not in ('active','withdrawn'))
    or (old.status = 'active' and new.status not in ('reserved','sold','withdrawn'))
    or (old.status = 'reserved' and new.status not in ('active','sold','withdrawn'))
    or old.status in ('sold','withdrawn') then
    raise exception 'invalid listing transition from % to %', old.status, new.status using errcode = '23514';
  end if;
  if new.status in ('reserved','sold') and new.buyer_id is null then raise exception 'buyer required' using errcode = '23514'; end if;
  return new;
end $$;
create trigger listings_transition before update of status on public.listings for each row execute function public.enforce_listing_transition();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare matched_campus uuid;
begin
  select campus_id into matched_campus from public.campus_email_domains where lower(domain::text) = lower(split_part(new.email, '@', 2));
  if matched_campus is null then raise exception 'school email domain is not enabled' using errcode = '28000'; end if;
  insert into public.profiles(id, campus_id, verified_at, verified_until) values(new.id, matched_campus, now(), now() + interval '1 year');
  insert into public.role_assignments(profile_id, campus_id, role) values(new.id, matched_campus, 'student');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.message_outbox() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
  values(new.campus_id,'message.created',new.id,jsonb_build_object('conversationId',new.conversation_id,'senderId',new.sender_id),'message:' || new.id);
  return new;
end $$;
create trigger message_created after insert on public.messages for each row execute function public.message_outbox();

create or replace function public.report_snapshot() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.target_type = 'message' then
    select jsonb_build_object('messageId',m.id,'senderId',m.sender_id,'body',m.body,'createdAt',m.created_at)
    into new.message_snapshot from public.messages m where m.id = new.target_id and public.is_conversation_participant(m.conversation_id);
    if new.message_snapshot is null then raise exception 'message is not reportable' using errcode = '42501'; end if;
  end if;
  return new;
end $$;
create trigger report_message_snapshot before insert on public.reports for each row execute function public.report_snapshot();

create or replace function public.public_stats() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'activeListings', (select count(*) from public.listings where status = 'active'),
    'upcomingEvents', (select count(*) from public.events where starts_at > now() and cancelled_at is null),
    'verifiedStudents', (select count(*) from public.profiles where status = 'active' and verified_until > now())
  )
$$;
grant execute on function public.public_stats() to anon, authenticated;

create or replace function public.claim_outbox(batch_size integer default 25) returns setof public.outbox_events language plpgsql security definer set search_path = '' as $$
begin
  return query
  with claimed as (
    select id from public.outbox_events where status = 'pending' and available_at <= now() order by created_at for update skip locked limit least(batch_size, 100)
  )
  update public.outbox_events o set status='processing', locked_at=now(), attempt_count=attempt_count+1 from claimed where o.id=claimed.id returning o.*;
end $$;
revoke all on function public.claim_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox(integer) to service_role;

alter table public.campuses enable row level security;
alter table public.campus_email_domains enable row level security;
alter table public.profiles enable row level security;
alter table public.role_assignments enable row level security;
alter table public.listings enable row level security;
alter table public.favorites enable row level security;
alter table public.media_uploads enable row level security;
alter table public.events enable row level security;
alter table public.event_rsvps enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.notifications enable row level security;
alter table public.outbox_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.rate_limits enable row level security;

create policy campuses_member_read on public.campuses for select to authenticated using (id = public.current_campus_id());
create policy profiles_campus_read on public.profiles for select to authenticated using (public.is_active_student() and campus_id = public.current_campus_id());
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and campus_id = public.current_campus_id() and status = 'active');
create policy roles_self_read on public.role_assignments for select to authenticated using (profile_id = auth.uid() or (campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[])));
create policy roles_admin_manage on public.role_assignments for all to authenticated using (campus_id = public.current_campus_id() and public.has_role(array['admin']::public.app_role[])) with check (campus_id = public.current_campus_id() and public.has_role(array['admin']::public.app_role[]));

create policy listings_member_read on public.listings for select to authenticated using (public.is_active_student() and campus_id = public.current_campus_id() and (status <> 'draft' or seller_id = auth.uid()));
create policy listings_owner_insert on public.listings for insert to authenticated with check (public.is_active_student() and seller_id = auth.uid() and campus_id = public.current_campus_id());
create policy listings_owner_update on public.listings for update to authenticated using (seller_id = auth.uid() and campus_id = public.current_campus_id()) with check (seller_id = auth.uid() and campus_id = public.current_campus_id());
create policy listings_owner_delete on public.listings for delete to authenticated using (seller_id = auth.uid() and status = 'draft');
create policy favorites_self_all on public.favorites for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid() and campus_id = public.current_campus_id());
create policy media_member_read on public.media_uploads for select to authenticated using (campus_id = public.current_campus_id() and (status = 'ready' or uploader_id = auth.uid()));
create policy media_owner_insert on public.media_uploads for insert to authenticated with check (uploader_id = auth.uid() and campus_id = public.current_campus_id());
create policy media_owner_update on public.media_uploads for update to authenticated using (uploader_id = auth.uid()) with check (uploader_id = auth.uid() and campus_id = public.current_campus_id());

create policy events_member_read on public.events for select to authenticated using (public.is_active_student() and campus_id = public.current_campus_id());
create policy events_owner_insert on public.events for insert to authenticated with check (organizer_id = auth.uid() and campus_id = public.current_campus_id());
create policy events_owner_update on public.events for update to authenticated using (organizer_id = auth.uid()) with check (organizer_id = auth.uid() and campus_id = public.current_campus_id());
create policy rsvps_member_read on public.event_rsvps for select to authenticated using (campus_id = public.current_campus_id());
create policy rsvps_self_all on public.event_rsvps for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid() and campus_id = public.current_campus_id());

create policy conversations_participant_read on public.conversations for select to authenticated using (public.is_conversation_participant(id));
create policy conversations_member_insert on public.conversations for insert to authenticated with check (created_by = auth.uid() and campus_id = public.current_campus_id());
create policy participants_conversation_read on public.conversation_participants for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy participants_creator_insert on public.conversation_participants for insert to authenticated with check (campus_id = public.current_campus_id() and exists(select 1 from public.conversations c where c.id=conversation_id and c.created_by=auth.uid()));
create policy messages_participant_read on public.messages for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy messages_participant_insert on public.messages for insert to authenticated with check (sender_id = auth.uid() and campus_id = public.current_campus_id() and public.is_conversation_participant(conversation_id));

create policy blocks_self_all on public.blocks for all to authenticated using (blocker_id = auth.uid()) with check (blocker_id = auth.uid() and campus_id = public.current_campus_id());
create policy reports_self_insert on public.reports for insert to authenticated with check (reporter_id = auth.uid() and campus_id = public.current_campus_id());
create policy reports_self_or_staff_read on public.reports for select to authenticated using (reporter_id = auth.uid() or (campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[])));
create policy reports_staff_update on public.reports for update to authenticated using (campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[])) with check (campus_id = public.current_campus_id());
create policy moderation_staff_all on public.moderation_actions for all to authenticated using (campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[])) with check (campus_id = public.current_campus_id() and moderator_id = auth.uid());
create policy notifications_self_read on public.notifications for select to authenticated using (profile_id = auth.uid());
create policy notifications_self_update on public.notifications for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy audit_staff_read on public.audit_log for select to authenticated using (campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]));

revoke update, delete on public.audit_log from anon, authenticated;
alter publication supabase_realtime add table public.messages, public.notifications;
