-- Campus Exchange V1 profiles, friends, organizations, social posts, search,
-- and notification foundations. All mutations are routed through locked RPCs;
-- exposed tables are read-only to authenticated clients and protected by RLS.

create type public.profile_visibility as enum ('campus_only', 'network', 'friends', 'private');
create type public.friend_relationship_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'removed');
create type public.organization_status as enum ('active', 'suspended', 'deleted');
create type public.organization_membership_policy as enum ('open', 'approval_required', 'invitation_only');
create type public.organization_role as enum ('owner', 'administrator', 'officer', 'member');
create type public.organization_membership_status as enum ('pending', 'invited', 'active', 'declined', 'cancelled', 'removed', 'banned');
create type public.social_visibility as enum ('campus_only', 'network', 'friends');
create type public.social_post_status as enum ('active', 'removed', 'deleted');
create type public.social_reaction_kind as enum ('like', 'celebrate', 'support', 'insightful');
create type public.notification_category as enum (
  'friend_request', 'friend_accepted', 'message', 'message_request',
  'social_reaction', 'social_comment', 'social_reply',
  'organization_invitation', 'organization_membership', 'event_activity',
  'discussion_activity', 'moderation_activity', 'security_activity'
);

create or replace function private.valid_profile_interests(target_values text[]) returns boolean
language sql immutable security invoker set search_path='' as $$
  select coalesce(bool_and(char_length(value) between 2 and 40),true) from unnest(target_values) value
$$;

alter table public.profiles drop constraint if exists profiles_bio_check;
alter table public.profiles
  add constraint profiles_bio_check check (char_length(bio) <= 1000),
  add column academic_field text check (academic_field is null or char_length(academic_field) between 2 and 120),
  add column graduation_year smallint check (graduation_year is null or graduation_year between 1900 and 2200),
  add column graduation_year_visible boolean not null default false,
  add column interests text[] not null default '{}'::text[],
  add column profile_visibility public.profile_visibility not null default 'campus_only',
  add constraint profiles_interests_count check (cardinality(interests) <= 20),
  add constraint profiles_interests_values check (private.valid_profile_interests(interests));

grant update (display_name,bio,academic_field,graduation_year,graduation_year_visible,interests,profile_visibility) on public.profiles to authenticated;
grant select on public.profiles to service_role;
grant select,insert,update,delete on public.media_uploads to service_role;

create table public.friend_relationships (
  id uuid primary key default gen_random_uuid(),
  profile_low_id uuid not null references public.profiles(id) on delete cascade,
  profile_high_id uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status public.friend_relationship_status not null default 'pending',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_relationships_pair_order check (profile_low_id < profile_high_id),
  constraint friend_relationships_requester check (requested_by in (profile_low_id, profile_high_id)),
  unique (profile_low_id, profile_high_id)
);

create table private.friend_relationship_actions (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key uuid not null,
  relationship_id uuid not null references public.friend_relationships(id) on delete cascade,
  action text not null,
  result_status public.friend_relationship_status not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  created_by uuid not null references public.profiles(id),
  slug extensions.citext not null unique,
  name text not null check (char_length(name) between 3 and 120),
  description text not null default '' check (char_length(description) between 10 and 5000),
  website_url text check (website_url is null or website_url ~ '^https://'),
  avatar_media_id uuid references public.media_uploads(id) on delete set null,
  banner_media_id uuid references public.media_uploads(id) on delete set null,
  visibility public.content_visibility not null default 'campus_only',
  membership_policy public.organization_membership_policy not null default 'approval_required',
  status public.organization_status not null default 'active',
  is_official boolean not null default false,
  verified_at timestamptz,
  member_count integer not null default 1 check (member_count >= 0),
  idempotency_key uuid not null,
  suspended_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, idempotency_key),
  check (slug::text ~ '^[a-z0-9][a-z0-9-]{2,62}$')
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  role public.organization_role not null default 'member',
  status public.organization_membership_status not null,
  invited_by uuid references public.profiles(id),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, profile_id),
  check ((status = 'active') = (joined_at is not null))
);

create table private.organization_membership_actions (
  actor_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_profile_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  result_status public.organization_membership_status not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, idempotency_key)
);

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  author_profile_id uuid not null references public.profiles(id),
  organization_id uuid references public.organizations(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  visibility public.social_visibility not null default 'campus_only',
  status public.social_post_status not null default 'active',
  reaction_count integer not null default 0 check (reaction_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  idempotency_key uuid not null,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(body, ''))) stored,
  edited_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id),
  removal_reason text check (removal_reason is null or char_length(removal_reason) <= 1000),
  deleted_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_profile_id, idempotency_key)
);

create table public.social_post_media (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  media_id uuid not null references public.media_uploads(id) on delete restrict,
  position smallint not null check (position between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (post_id, media_id),
  unique (post_id, position),
  unique (media_id)
);

create table public.social_reactions (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  reaction public.social_reaction_kind not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table public.social_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  campus_id uuid not null references public.campuses(id),
  author_profile_id uuid references public.profiles(id) on delete set null,
  parent_comment_id uuid references public.social_comments(id) on delete set null,
  body text check (body is null or char_length(body) between 1 and 4000),
  idempotency_key uuid not null,
  edited_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id),
  removal_reason text check (removal_reason is null or char_length(removal_reason) <= 1000),
  deleted_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_profile_id, idempotency_key),
  check (body is not null or deleted_at is not null or removed_at is not null)
);

alter table public.media_uploads
  add column organization_id uuid references public.organizations(id) on delete cascade;

alter table public.events add column organization_id uuid references public.organizations(id) on delete set null;
alter table public.discussion_communities add column organization_id uuid references public.organizations(id) on delete set null;

alter table public.notifications add column category public.notification_category;
update public.notifications set category = case
  when kind = 'message' then 'message'::public.notification_category
  when kind = 'message_request' then 'message_request'::public.notification_category
  when kind like 'discussion%' then 'discussion_activity'::public.notification_category
  when kind like 'moderation%' then 'moderation_activity'::public.notification_category
  else 'security_activity'::public.notification_category
end;

create or replace function private.set_notification_category() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.category is null then
    new.category := case
      when new.kind = 'message' then 'message'::public.notification_category
      when new.kind = 'message_request' then 'message_request'::public.notification_category
      when new.kind like 'discussion%' then 'discussion_activity'::public.notification_category
      when new.kind like 'moderation%' then 'moderation_activity'::public.notification_category
      else 'security_activity'::public.notification_category
    end;
  end if;
  return new;
end $$;

create trigger notifications_set_category before insert or update of kind,category on public.notifications
for each row execute function private.set_notification_category();

alter table public.notifications alter column category set not null;

alter table public.media_uploads drop constraint if exists media_uploads_purpose_check;
alter table public.media_uploads drop constraint if exists media_uploads_target_check;
alter table public.media_uploads add constraint media_uploads_purpose_check check (
  purpose in ('listing', 'avatar', 'banner', 'community_icon', 'community_banner', 'discussion_post', 'organization_avatar', 'organization_banner', 'social_post')
);
alter table public.media_uploads add constraint media_uploads_target_check check (
  (purpose = 'listing' and listing_id is not null and profile_id is null and discussion_community_id is null and discussion_post_id is null and organization_id is null)
  or (purpose in ('avatar', 'banner') and listing_id is null and profile_id = uploader_id and discussion_community_id is null and discussion_post_id is null and organization_id is null)
  or (purpose in ('community_icon', 'community_banner') and listing_id is null and profile_id is null and discussion_post_id is null and organization_id is null)
  or (purpose = 'discussion_post' and listing_id is null and profile_id is null and discussion_community_id is null and organization_id is null)
  or (purpose in ('organization_avatar', 'organization_banner') and listing_id is null and profile_id is null and discussion_community_id is null and discussion_post_id is null and organization_id is not null)
  or (purpose = 'social_post' and listing_id is null and profile_id is null and discussion_community_id is null and discussion_post_id is null and organization_id is null)
);

create or replace function public.enforce_media_target() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.purpose = 'listing' then
    if new.listing_id is null or new.profile_id is not null or new.discussion_community_id is not null or new.discussion_post_id is not null or new.organization_id is not null then raise exception 'listing media must target one listing' using errcode='23514'; end if;
  elsif new.purpose in ('avatar','banner') then
    if new.profile_id is distinct from new.uploader_id or new.listing_id is not null or new.discussion_community_id is not null or new.discussion_post_id is not null or new.organization_id is not null then raise exception 'profile media must target its uploader' using errcode='23514'; end if;
  elsif new.purpose in ('community_icon','community_banner') then
    if new.listing_id is not null or new.profile_id is not null or new.discussion_post_id is not null or new.organization_id is not null then raise exception 'community media has an invalid target' using errcode='23514'; end if;
  elsif new.purpose = 'discussion_post' then
    if new.listing_id is not null or new.profile_id is not null or new.discussion_community_id is not null or new.organization_id is not null then raise exception 'discussion post media has an invalid target' using errcode='23514'; end if;
  elsif new.purpose in ('organization_avatar','organization_banner') then
    if new.listing_id is not null or new.profile_id is not null or new.discussion_community_id is not null or new.discussion_post_id is not null or new.organization_id is null then raise exception 'organization media must target one organization' using errcode='23514'; end if;
  elsif new.purpose = 'social_post' then
    if new.listing_id is not null or new.profile_id is not null or new.discussion_community_id is not null or new.discussion_post_id is not null or new.organization_id is not null then raise exception 'social post media has an invalid target' using errcode='23514'; end if;
  else raise exception 'unsupported media purpose' using errcode='23514';
  end if;
  return new;
end $$;

create index friend_relationships_profile_low_idx on public.friend_relationships(profile_low_id, status, updated_at desc);
create index friend_relationships_profile_high_idx on public.friend_relationships(profile_high_id, status, updated_at desc);
create index organizations_discovery_idx on public.organizations(campus_id, visibility, status, member_count desc, id desc);
create index organizations_search_idx on public.organizations using gin (to_tsvector('english', name || ' ' || slug::text || ' ' || description));
create index organization_memberships_profile_idx on public.organization_memberships(profile_id, status, updated_at desc);
create index organization_memberships_org_idx on public.organization_memberships(organization_id, status, role, joined_at desc);
create unique index organization_single_owner_idx on public.organization_memberships(organization_id) where role='owner' and status='active';
create index social_posts_feed_idx on public.social_posts(campus_id, visibility, created_at desc, id desc) where status='active';
create index social_posts_author_idx on public.social_posts(author_profile_id, created_at desc, id desc) where status='active';
create index social_posts_org_idx on public.social_posts(organization_id, created_at desc, id desc) where organization_id is not null and status='active';
create index social_posts_search_idx on public.social_posts using gin(search_vector);
create index social_comments_post_idx on public.social_comments(post_id, created_at, id);
create index media_organization_idx on public.media_uploads(organization_id, purpose, status) where organization_id is not null;
create index media_v1_unattached_idx on public.media_uploads(purpose, created_at) where purpose in ('organization_avatar','organization_banner','social_post') and attached_at is null;

create trigger friend_relationships_touch before update on public.friend_relationships for each row execute function public.touch_updated_at();
create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger organization_memberships_touch before update on public.organization_memberships for each row execute function public.touch_updated_at();
create trigger social_posts_touch before update on public.social_posts for each row execute function public.touch_updated_at();
create trigger social_reactions_touch before update on public.social_reactions for each row execute function public.touch_updated_at();
create trigger social_comments_touch before update on public.social_comments for each row execute function public.touch_updated_at();

create or replace function private.block_exists(first_profile uuid, second_profile uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.blocks b where (b.blocker_id=first_profile and b.blocked_id=second_profile) or (b.blocker_id=second_profile and b.blocked_id=first_profile))
$$;

create or replace function private.are_friends(first_profile uuid, second_profile uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.friend_relationships f where f.profile_low_id=least(first_profile,second_profile) and f.profile_high_id=greatest(first_profile,second_profile) and f.status='accepted')
$$;

create or replace function private.apply_block_relationships() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.friend_relationships set
    status=case when status='accepted' then 'removed'::public.friend_relationship_status else 'cancelled'::public.friend_relationship_status end,
    responded_at=now()
  where profile_low_id=least(new.blocker_id,new.blocked_id) and profile_high_id=greatest(new.blocker_id,new.blocked_id) and status in ('pending','accepted');
  return new;
end $$;

create trigger blocks_cancel_friend_relationship after insert on public.blocks for each row execute function private.apply_block_relationships();

create or replace function private.organization_role_rank(target_role public.organization_role) returns smallint
language sql immutable security invoker set search_path='' as $$
  select case target_role when 'member' then 0 when 'officer' then 1 when 'administrator' then 2 when 'owner' then 3 end::smallint
$$;

create or replace function private.can_read_organization(target_organization uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.active_member((select auth.uid())) and exists(
    select 1 from public.organizations o where o.id=target_organization and o.status='active'
      and (
        private.content_is_visible(o.campus_id,o.visibility)
        or exists(
          select 1 from public.organization_memberships m
          where m.organization_id=o.id and m.profile_id=(select auth.uid()) and m.status in ('invited','pending','active')
        )
      )
  )
$$;

create or replace function private.can_manage_organization(target_organization uuid, actor uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.active_member(actor) and exists(
    select 1 from public.organization_memberships m where m.organization_id=target_organization and m.profile_id=actor and m.status='active' and m.role in ('owner','administrator')
  )
$$;

create or replace function private.can_read_social_post(target_post uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.active_member((select auth.uid())) and exists(
    select 1 from public.social_posts p
    join public.campuses c on c.id=p.campus_id and c.status='enabled'
    where p.id=target_post and p.status='active' and not private.block_exists((select auth.uid()),p.author_profile_id)
      and (
        p.author_profile_id=(select auth.uid())
        or (p.visibility='campus_only' and p.campus_id=public.current_campus_id())
        or (p.visibility='network' and private.network_features_enabled())
        or (p.visibility='friends' and private.are_friends((select auth.uid()),p.author_profile_id))
      )
  )
$$;

create or replace function private.can_read_media(target_media uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1
    from public.media_uploads m
    left join public.listings l on l.id=m.listing_id
    left join public.profiles p on p.id=m.profile_id
    where m.id=target_media and m.status='ready' and (
      m.uploader_id=(select auth.uid())
      or (m.purpose='listing' and l.deleted_at is null and private.content_is_visible(l.campus_id,l.visibility))
      or (m.purpose in ('avatar','banner') and private.active_member(p.id) and not private.block_exists((select auth.uid()),p.id))
      or (m.purpose in ('community_icon','community_banner','discussion_post') and m.campus_id=public.current_campus_id())
      or (m.purpose='organization_avatar' and exists(
        select 1 from public.organizations o
        where o.id=m.organization_id and o.avatar_media_id=m.id and private.can_read_organization(o.id)
      ))
      or (m.purpose='organization_banner' and exists(
        select 1 from public.organizations o
        where o.id=m.organization_id and o.banner_media_id=m.id and private.can_read_organization(o.id)
      ))
      or (m.purpose='social_post' and exists(
        select 1 from public.social_post_media pm
        where pm.media_id=m.id and private.can_read_social_post(pm.post_id)
      ))
    )
  )
$$;

drop function public.safe_profile_by_username(text);
drop function private.safe_profile_by_username(text);
create function private.safe_profile_by_username(target_username text) returns table(
  id uuid,handle text,display_name text,bio text,academic_field text,graduation_year smallint,interests text[],profile_visibility public.profile_visibility,
  avatar_media_id uuid,banner_media_id uuid,campus_id uuid,campus_name text,campus_short_name text,campus_slug text,joined_month date,same_campus boolean
)
language sql stable security definer set search_path='' as $$
  select p.id,p.handle::text,p.display_name,p.bio,p.academic_field,
    case when p.graduation_year_visible or p.id=(select auth.uid()) then p.graduation_year end,
    p.interests,p.profile_visibility,p.avatar_media_id,p.banner_media_id,p.campus_id,c.name,c.short_name,c.slug::text,date_trunc('month',p.created_at)::date,(p.campus_id=public.current_campus_id())
  from public.profiles p join public.campuses c on c.id=p.campus_id
  where lower(p.handle::text)=lower(target_username) and private.active_member(p.id) and private.active_member((select auth.uid()))
    and not private.block_exists((select auth.uid()),p.id)
    and (
      p.id=(select auth.uid())
      or (p.profile_visibility='campus_only' and p.campus_id=public.current_campus_id())
      or (p.profile_visibility='network' and (p.campus_id=public.current_campus_id() or private.network_features_enabled()))
      or (p.profile_visibility='friends' and private.are_friends((select auth.uid()),p.id))
    )
$$;
create function public.safe_profile_by_username(target_username text) returns table(
  id uuid,handle text,display_name text,bio text,academic_field text,graduation_year smallint,interests text[],profile_visibility public.profile_visibility,
  avatar_media_id uuid,banner_media_id uuid,campus_id uuid,campus_name text,campus_short_name text,campus_slug text,joined_month date,same_campus boolean
)
language sql stable security invoker set search_path='' as $$ select * from private.safe_profile_by_username(target_username) $$;

create or replace function private.search_member_directory(search_term text,campus_filter text,result_limit integer)
returns table(id uuid,handle text,display_name text,avatar_media_id uuid,campus_id uuid,campus_name text,campus_short_name text,campus_slug text,joined_month date)
language sql stable security definer set search_path='' as $$
  select p.id,p.handle::text,p.display_name,p.avatar_media_id,p.campus_id,c.name,c.short_name,c.slug::text,date_trunc('month',p.created_at)::date
  from public.profiles p join public.campuses c on c.id=p.campus_id
  where private.active_member((select auth.uid())) and private.active_member(p.id) and not private.block_exists((select auth.uid()),p.id)
    and (campus_filter is null or c.slug::text=campus_filter)
    and (p.handle::text ilike '%'||search_term||'%' or coalesce(p.display_name,'') ilike '%'||search_term||'%')
    and (
      p.id=(select auth.uid())
      or (p.profile_visibility='campus_only' and p.campus_id=public.current_campus_id())
      or (p.profile_visibility='network' and (p.campus_id=public.current_campus_id() or private.network_features_enabled()))
      or (p.profile_visibility='friends' and private.are_friends((select auth.uid()),p.id))
    )
  order by (p.campus_id=public.current_campus_id()) desc,coalesce(p.display_name,p.handle::text),p.id
  limit least(greatest(result_limit,1),50)
$$;

alter table public.friend_relationships enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_post_media enable row level security;
alter table public.social_reactions enable row level security;
alter table public.social_comments enable row level security;

create policy friend_relationships_participant_read on public.friend_relationships for select to authenticated using ((select auth.uid()) in (profile_low_id,profile_high_id));
create policy organizations_visible_read on public.organizations for select to authenticated using (private.can_read_organization(id) or private.can_manage_organization(id));
create policy organization_memberships_scoped_read on public.organization_memberships for select to authenticated using (profile_id=(select auth.uid()) or private.can_manage_organization(organization_id));
create policy social_posts_visible_read on public.social_posts for select to authenticated using (private.can_read_social_post(id));
create policy social_post_media_visible_read on public.social_post_media for select to authenticated using (private.can_read_social_post(post_id));
create policy social_reactions_visible_read on public.social_reactions for select to authenticated using (private.can_read_social_post(post_id));
create policy social_comments_visible_read on public.social_comments for select to authenticated using (private.can_read_social_post(post_id));

revoke insert,update,delete on public.friend_relationships,public.organizations,public.organization_memberships,public.social_posts,public.social_post_media,public.social_reactions,public.social_comments from anon,authenticated;
grant select on public.friend_relationships,public.organizations,public.organization_memberships,public.social_posts,public.social_post_media,public.social_reactions,public.social_comments to authenticated;
grant all on public.friend_relationships,public.organizations,public.organization_memberships,public.social_posts,public.social_post_media,public.social_reactions,public.social_comments to service_role;
grant all on private.friend_relationship_actions,private.organization_membership_actions to service_role;

create or replace function private.manage_friend_relationship(target_profile uuid, chosen_action text, request_key uuid)
returns table(id uuid,status public.friend_relationship_status)
language plpgsql security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid()); low_id uuid; high_id uuid; selected public.friend_relationships; previous private.friend_relationship_actions; target_campus uuid;
begin
  if not private.active_member(caller) then raise exception 'active membership required' using errcode='42501'; end if;
  if caller=target_profile then raise exception 'cannot friend yourself' using errcode='23514'; end if;
  if not private.active_member(target_profile) or private.block_exists(caller,target_profile) then raise exception 'profile unavailable' using errcode='P0002'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':'||request_key::text,0));
  select * into previous from private.friend_relationship_actions where actor_id=caller and idempotency_key=request_key;
  if previous.actor_id is not null then return query select previous.relationship_id,previous.result_status; return; end if;
  low_id:=least(caller,target_profile); high_id:=greatest(caller,target_profile);
  select * into selected from public.friend_relationships f where f.profile_low_id=low_id and f.profile_high_id=high_id for update;
  if chosen_action='send' then
    if selected.id is not null and selected.status in ('pending','accepted') then raise exception 'friend relationship already exists' using errcode='23505'; end if;
    if selected.id is null then
      insert into public.friend_relationships(profile_low_id,profile_high_id,requested_by,status) values(low_id,high_id,caller,'pending') returning * into selected;
    else
      update public.friend_relationships set requested_by=caller,status='pending',responded_at=null where public.friend_relationships.id=selected.id returning * into selected;
    end if;
    select campus_id into target_campus from public.profiles where public.profiles.id=target_profile;
    insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
      values(target_campus,'friend.requested',selected.id,jsonb_build_object('recipientId',target_profile,'actorId',caller,'relationshipId',selected.id),'friend-requested:'||selected.id||':'||request_key) on conflict(idempotency_key) do nothing;
  elsif chosen_action in ('accept','decline') then
    if selected.id is null or selected.status<>'pending' or selected.requested_by=caller then raise exception 'friend request unavailable' using errcode='P0002'; end if;
    update public.friend_relationships set status=(case when chosen_action='accept' then 'accepted' else 'declined' end)::public.friend_relationship_status,responded_at=now() where public.friend_relationships.id=selected.id returning * into selected;
    if chosen_action='accept' then
      select campus_id into target_campus from public.profiles where public.profiles.id=selected.requested_by;
      insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
        values(target_campus,'friend.accepted',selected.id,jsonb_build_object('recipientId',selected.requested_by,'actorId',caller,'relationshipId',selected.id),'friend-accepted:'||selected.id||':'||request_key) on conflict(idempotency_key) do nothing;
    end if;
  elsif chosen_action='cancel' then
    if selected.id is null or selected.status<>'pending' or selected.requested_by<>caller then raise exception 'friend request unavailable' using errcode='P0002'; end if;
    update public.friend_relationships set status='cancelled',responded_at=now() where public.friend_relationships.id=selected.id returning * into selected;
  elsif chosen_action='remove' then
    if selected.id is null or selected.status<>'accepted' then raise exception 'friendship unavailable' using errcode='P0002'; end if;
    update public.friend_relationships set status='removed',responded_at=now() where public.friend_relationships.id=selected.id returning * into selected;
  else raise exception 'unsupported friend action' using errcode='23514';
  end if;
  insert into private.friend_relationship_actions(actor_id,idempotency_key,relationship_id,action,result_status) values(caller,request_key,selected.id,chosen_action,selected.status);
  return query select selected.id,selected.status;
end $$;

create or replace function public.manage_friend_relationship(target_profile uuid,chosen_action text,request_key uuid)
returns table(id uuid,status public.friend_relationship_status)
language sql security invoker set search_path='' as $$ select * from private.manage_friend_relationship(target_profile,chosen_action,request_key) $$;

create or replace function private.create_organization(submitted_slug text,submitted_name text,submitted_description text,submitted_visibility public.content_visibility,submitted_policy public.organization_membership_policy,submitted_website text,request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); campus uuid:=public.current_campus_id(); created_id uuid;
begin
  if not private.active_member(caller) or campus is null then raise exception 'active membership required' using errcode='42501'; end if;
  if submitted_visibility='network' and not private.network_features_enabled() then raise exception 'network organizations are unavailable' using errcode='42501'; end if;
  insert into public.organizations(campus_id,created_by,slug,name,description,visibility,membership_policy,website_url,idempotency_key)
    values(campus,caller,lower(trim(submitted_slug)),trim(submitted_name),trim(submitted_description),submitted_visibility,submitted_policy,submitted_website,request_key)
    on conflict(created_by,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into created_id;
  insert into public.organization_memberships(organization_id,profile_id,campus_id,role,status,joined_at)
    values(created_id,caller,campus,'owner','active',now()) on conflict(organization_id,profile_id) do nothing;
  return created_id;
end $$;

create or replace function public.create_organization(submitted_slug text,submitted_name text,submitted_description text,submitted_visibility public.content_visibility,submitted_policy public.organization_membership_policy,submitted_website text,request_key uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.create_organization(submitted_slug,submitted_name,submitted_description,submitted_visibility,submitted_policy,submitted_website,request_key) $$;

create or replace function private.set_organization_membership(target_organization uuid,target_profile uuid,chosen_action text,chosen_role public.organization_role,request_key uuid)
returns table(organization_id uuid,profile_id uuid,role public.organization_role,status public.organization_membership_status)
language plpgsql security definer set search_path='' as $$
declare
  caller uuid:=(select auth.uid()); org public.organizations; actor_membership public.organization_memberships; selected public.organization_memberships; previous private.organization_membership_actions; effective_target uuid:=coalesce(target_profile,caller); actor_rank smallint; target_rank smallint; target_campus uuid;
begin
  if not private.active_member(caller) then raise exception 'active membership required' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':'||request_key::text,0));
  select * into previous from private.organization_membership_actions where actor_id=caller and idempotency_key=request_key;
  if previous.actor_id is not null then
    select * into selected from public.organization_memberships where public.organization_memberships.organization_id=previous.organization_id and public.organization_memberships.profile_id=previous.target_profile_id;
    return query select selected.organization_id,selected.profile_id,selected.role,selected.status; return;
  end if;
  select * into org from public.organizations o where o.id=target_organization and o.status='active' for update;
  if org.id is null or (
    not private.can_read_organization(target_organization)
    and not exists(
      select 1 from public.organization_memberships m
      where m.organization_id=target_organization and m.profile_id=caller and m.status in ('invited','pending','active')
    )
  ) then raise exception 'organization unavailable' using errcode='P0002'; end if;
  select * into actor_membership from public.organization_memberships m where m.organization_id=target_organization and m.profile_id=caller for update;
  select * into selected from public.organization_memberships m where m.organization_id=target_organization and m.profile_id=effective_target for update;
  select campus_id into target_campus from public.profiles where id=effective_target;
  if target_campus is null then raise exception 'profile unavailable' using errcode='P0002'; end if;
  actor_rank:=case when actor_membership.status='active' then private.organization_role_rank(actor_membership.role) else -1 end;
  target_rank:=case when selected.status='active' then private.organization_role_rank(selected.role) else 0 end;
  if chosen_action='join' then
    if effective_target<>caller or org.membership_policy='invitation_only' or selected.status in ('active','pending','invited','banned') then raise exception 'membership request unavailable' using errcode='23505'; end if;
    insert into public.organization_memberships(organization_id,profile_id,campus_id,role,status,joined_at)
      values(org.id,caller,target_campus,'member',(case when org.membership_policy='open' then 'active' else 'pending' end)::public.organization_membership_status,case when org.membership_policy='open' then now() end)
      on conflict on constraint organization_memberships_pkey do update set role='member',status=excluded.status,joined_at=excluded.joined_at,invited_by=null returning * into selected;
  elsif chosen_action='invite' then
    if actor_rank<2 or not private.active_member(effective_target) or selected.status in ('active','banned') then raise exception 'invitation unavailable' using errcode='42501'; end if;
    insert into public.organization_memberships(organization_id,profile_id,campus_id,role,status,invited_by,joined_at)
      values(org.id,effective_target,target_campus,coalesce(chosen_role,'member'),'invited',caller,null)
      on conflict on constraint organization_memberships_pkey do update set role=excluded.role,status='invited',invited_by=caller,joined_at=null returning * into selected;
    insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
      values(target_campus,'organization.invited',org.id,jsonb_build_object('recipientId',effective_target,'actorId',caller,'organizationId',org.id,'organizationSlug',org.slug::text),'organization-invited:'||org.id||':'||effective_target||':'||request_key) on conflict(idempotency_key) do nothing;
  elsif chosen_action='accept' then
    if selected.status='invited' and effective_target=caller then
      update public.organization_memberships m set status='active',joined_at=now() where m.organization_id=org.id and m.profile_id=caller returning * into selected;
    elsif selected.status='pending' and actor_rank>=2 then
      update public.organization_memberships m set status='active',joined_at=now() where m.organization_id=org.id and m.profile_id=effective_target returning * into selected;
    else raise exception 'membership cannot be accepted' using errcode='42501'; end if;
  elsif chosen_action='decline' then
    if not ((selected.status='invited' and effective_target=caller) or (selected.status='pending' and actor_rank>=2)) then raise exception 'membership cannot be declined' using errcode='42501'; end if;
    update public.organization_memberships m set status='declined',joined_at=null where m.organization_id=org.id and m.profile_id=effective_target returning * into selected;
  elsif chosen_action='cancel' then
    if not ((selected.status='pending' and effective_target=caller) or (selected.status='invited' and actor_rank>=2)) then raise exception 'membership cannot be cancelled' using errcode='42501'; end if;
    update public.organization_memberships m set status='cancelled',joined_at=null where m.organization_id=org.id and m.profile_id=effective_target returning * into selected;
  elsif chosen_action='change_role' then
    if actor_rank<2 or selected.status<>'active' or selected.role='owner' or chosen_role is null or private.organization_role_rank(chosen_role)>=actor_rank or target_rank>=actor_rank then raise exception 'role change not permitted' using errcode='42501'; end if;
    update public.organization_memberships m set role=chosen_role where m.organization_id=org.id and m.profile_id=effective_target returning * into selected;
  elsif chosen_action='transfer_ownership' then
    if actor_membership.status<>'active' or actor_membership.role<>'owner' or effective_target=caller or selected.status<>'active' or selected.role='owner' then raise exception 'ownership transfer not permitted' using errcode='42501'; end if;
    update public.organization_memberships m set role='administrator' where m.organization_id=org.id and m.profile_id=caller;
    update public.organization_memberships m set role='owner' where m.organization_id=org.id and m.profile_id=effective_target returning * into selected;
  elsif chosen_action in ('remove','ban') then
    if selected.role='owner' or selected.status<>'active' or not ((effective_target=caller and actor_membership.role<>'owner' and chosen_action='remove') or (actor_rank>=2 and target_rank<actor_rank)) then raise exception 'membership action not permitted' using errcode='42501'; end if;
    update public.organization_memberships m set status=(case when chosen_action='ban' then 'banned' else 'removed' end)::public.organization_membership_status,joined_at=null where m.organization_id=org.id and m.profile_id=effective_target returning * into selected;
  elsif chosen_action='unban' then
    if actor_rank<2 or selected.status<>'banned' or selected.role='owner' then raise exception 'membership action not permitted' using errcode='42501'; end if;
    update public.organization_memberships m set status='removed',joined_at=null where m.organization_id=org.id and m.profile_id=effective_target returning * into selected;
  else raise exception 'unsupported membership action' using errcode='23514';
  end if;
  update public.organizations set member_count=(select count(*) from public.organization_memberships m where m.organization_id=org.id and m.status='active') where public.organizations.id=org.id;
  insert into private.organization_membership_actions(actor_id,idempotency_key,organization_id,target_profile_id,action,result_status)
    values(caller,request_key,org.id,effective_target,chosen_action,selected.status);
  return query select selected.organization_id,selected.profile_id,selected.role,selected.status;
end $$;

create or replace function public.set_organization_membership(target_organization uuid,target_profile uuid,chosen_action text,chosen_role public.organization_role,request_key uuid)
returns table(organization_id uuid,profile_id uuid,role public.organization_role,status public.organization_membership_status)
language sql security invoker set search_path='' as $$ select * from private.set_organization_membership(target_organization,target_profile,chosen_action,chosen_role,request_key) $$;

create or replace function private.create_social_post(submitted_body text,submitted_media uuid[],submitted_visibility public.social_visibility,submitted_organization uuid,request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); campus uuid:=public.current_campus_id(); post_id uuid; media_id uuid; media_position smallint:=0; org public.organizations;
begin
  if not private.active_member(caller) or campus is null then raise exception 'active membership required' using errcode='42501'; end if;
  if submitted_visibility='network' and not private.network_features_enabled() then raise exception 'network posts are unavailable' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':'||request_key::text,0));
  select id into post_id from public.social_posts where author_profile_id=caller and idempotency_key=request_key;
  if post_id is not null then return post_id; end if;
  if submitted_organization is not null then
    select * into org from public.organizations where id=submitted_organization and status='active';
    if org.id is null or not exists(select 1 from public.organization_memberships where organization_id=submitted_organization and profile_id=caller and status='active' and role in ('owner','administrator','officer')) then raise exception 'organization posting permission required' using errcode='42501'; end if;
    if submitted_visibility='friends' or (submitted_visibility='network' and org.visibility<>'network') then raise exception 'organization post visibility is unavailable' using errcode='42501'; end if;
    campus:=org.campus_id;
  end if;
  insert into public.social_posts(campus_id,author_profile_id,organization_id,body,visibility,idempotency_key)
    values(campus,caller,submitted_organization,trim(submitted_body),submitted_visibility,request_key)
    returning id into post_id;
  if cardinality(coalesce(submitted_media,'{}'::uuid[]))>4 or cardinality(coalesce(submitted_media,'{}'::uuid[]))<>cardinality(array(select distinct unnest(coalesce(submitted_media,'{}'::uuid[])))) then raise exception 'invalid social media selection' using errcode='23514'; end if;
  foreach media_id in array coalesce(submitted_media,'{}'::uuid[]) loop
    if not exists(select 1 from public.media_uploads m where m.id=media_id and m.uploader_id=caller and m.campus_id=campus and m.purpose='social_post' and m.status='ready' and m.attached_at is null) then raise exception 'social media unavailable' using errcode='42501'; end if;
    insert into public.social_post_media(post_id,media_id,position) values(post_id,media_id,media_position) on conflict do nothing;
    update public.media_uploads set attached_at=coalesce(attached_at,now()) where id=media_id;
    media_position:=media_position+1;
  end loop;
  return post_id;
end $$;

create or replace function public.create_social_post(submitted_body text,submitted_media uuid[],submitted_visibility public.social_visibility,submitted_organization uuid,request_key uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.create_social_post(submitted_body,submitted_media,submitted_visibility,submitted_organization,request_key) $$;

create or replace function private.set_social_reaction(target_post uuid,chosen_reaction public.social_reaction_kind)
returns integer language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); campus uuid:=public.current_campus_id(); total integer; recipient uuid; recipient_campus uuid;
begin
  if not private.can_read_social_post(target_post) then raise exception 'post unavailable' using errcode='P0002'; end if;
  if chosen_reaction is null then delete from public.social_reactions where post_id=target_post and profile_id=caller;
  else insert into public.social_reactions(post_id,profile_id,campus_id,reaction) values(target_post,caller,campus,chosen_reaction) on conflict(post_id,profile_id) do update set reaction=excluded.reaction;
  end if;
  select count(*)::integer into total from public.social_reactions where post_id=target_post;
  update public.social_posts set reaction_count=total where id=target_post;
  if chosen_reaction is not null then
    select p.author_profile_id,profile.campus_id into recipient,recipient_campus
    from public.social_posts p join public.profiles profile on profile.id=p.author_profile_id
    where p.id=target_post;
    if recipient is distinct from caller then
      insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
        values(recipient_campus,'social.reacted',target_post,jsonb_build_object('recipientId',recipient,'actorId',caller,'postId',target_post),'social-reacted:'||target_post||':'||caller||':'||chosen_reaction::text) on conflict(idempotency_key) do nothing;
    end if;
  end if;
  return total;
end $$;

create or replace function public.set_social_reaction(target_post uuid,chosen_reaction public.social_reaction_kind)
returns integer language sql security invoker set search_path='' as $$ select private.set_social_reaction(target_post,chosen_reaction) $$;

create or replace function private.create_social_comment(target_post uuid,parent_comment uuid,submitted_body text,request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); campus uuid:=public.current_campus_id(); comment_id uuid; total integer; recipient uuid; recipient_campus uuid;
begin
  if not private.can_read_social_post(target_post) then raise exception 'post unavailable' using errcode='P0002'; end if;
  if parent_comment is not null and not exists(select 1 from public.social_comments where id=parent_comment and post_id=target_post and parent_comment_id is null and deleted_at is null and removed_at is null) then raise exception 'parent comment unavailable' using errcode='P0002'; end if;
  insert into public.social_comments(post_id,campus_id,author_profile_id,parent_comment_id,body,idempotency_key)
    values(target_post,campus,caller,parent_comment,trim(submitted_body),request_key)
    on conflict(author_profile_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into comment_id;
  select count(*)::integer into total from public.social_comments where post_id=target_post and deleted_at is null and removed_at is null;
  update public.social_posts set comment_count=total where id=target_post;
  if parent_comment is null then
    select p.author_profile_id,profile.campus_id into recipient,recipient_campus
    from public.social_posts p join public.profiles profile on profile.id=p.author_profile_id
    where p.id=target_post;
  else
    select c.author_profile_id,profile.campus_id into recipient,recipient_campus
    from public.social_comments c join public.profiles profile on profile.id=c.author_profile_id
    where c.id=parent_comment;
  end if;
  if recipient is distinct from caller then
    insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
      values(recipient_campus,case when parent_comment is null then 'social.commented' else 'social.replied' end,comment_id,
        jsonb_build_object('recipientId',recipient,'actorId',caller,'postId',target_post,'commentId',comment_id),
        'social-comment:'||comment_id) on conflict(idempotency_key) do nothing;
  end if;
  return comment_id;
end $$;

create or replace function public.create_social_comment(target_post uuid,parent_comment uuid,submitted_body text,request_key uuid)
returns uuid language sql security invoker set search_path='' as $$ select private.create_social_comment(target_post,parent_comment,submitted_body,request_key) $$;

create or replace function public.social_feed(before_created timestamptz default null,before_id uuid default null,result_limit integer default 20)
returns setof public.social_posts language sql stable security invoker set search_path='' as $$
  select p from public.social_posts p
  where p.status='active' and (before_created is null or (p.created_at,p.id)<(before_created,before_id))
  order by p.created_at desc,p.id desc limit least(greatest(result_limit,1),50)
$$;

create or replace function private.unified_search(search_term text,result_limit integer default 20)
returns table(kind text,id uuid,title text,subtitle text,href text,image_media_id uuid,campus_slug text,campus_short_name text,visibility text,occurred_at timestamptz)
language sql stable security definer set search_path='' as $$
  with hits as (
    select 'profile'::text,p.id,coalesce(p.display_name,p.handle::text) title,'@'||p.handle::text subtitle,'/u/'||p.handle::text href,p.avatar_media_id,c.slug::text,c.short_name,
      p.profile_visibility::text visibility,p.updated_at occurred_at
    from public.profiles p join public.campuses c on c.id=p.campus_id
    where private.active_member(p.id) and not private.block_exists((select auth.uid()),p.id)
      and (p.campus_id=public.current_campus_id() or (p.profile_visibility='network' and private.network_features_enabled()) or (p.profile_visibility='friends' and private.are_friends((select auth.uid()),p.id)) or p.id=(select auth.uid()))
      and (p.handle::text ilike '%'||search_term||'%' or coalesce(p.display_name,'') ilike '%'||search_term||'%')
    union all
    select 'listing',l.id,l.title,c.short_name,'/listings/'||l.id,null::uuid,c.slug::text,c.short_name,l.visibility::text,l.created_at
    from public.listings l join public.campuses c on c.id=l.campus_id where l.deleted_at is null and l.status in ('active','reserved','sold') and private.content_is_visible(l.campus_id,l.visibility) and (l.search_vector@@websearch_to_tsquery('english',search_term) or l.title ilike '%'||search_term||'%')
    union all
    select 'organization',o.id,o.name,c.short_name,'/organizations/'||o.slug::text,o.avatar_media_id,c.slug::text,c.short_name,o.visibility::text,o.created_at
    from public.organizations o join public.campuses c on c.id=o.campus_id where private.can_read_organization(o.id) and (to_tsvector('english',o.name||' '||o.description)@@websearch_to_tsquery('english',search_term) or o.name ilike '%'||search_term||'%')
    union all
    select 'event',e.id,e.title,c.short_name,'/events',null::uuid,c.slug::text,c.short_name,e.visibility::text,e.created_at
    from public.events e join public.campuses c on c.id=e.campus_id where e.deleted_at is null and e.cancelled_at is null and private.content_is_visible(e.campus_id,e.visibility) and (e.title ilike '%'||search_term||'%' or e.description ilike '%'||search_term||'%')
    union all
    select 'community',d.id,d.display_name,c.short_name,'/discussions/c/'||d.slug,null::uuid,c.slug::text,c.short_name,'campus_only',d.created_at
    from public.discussion_communities d join public.campuses c on c.id=d.campus_id where d.campus_id=public.current_campus_id() and d.deleted_at is null and d.status='active' and (d.display_name ilike '%'||search_term||'%' or d.description ilike '%'||search_term||'%')
    union all
    select 'social_post',s.id,left(s.body,80),coalesce(o.name,p.display_name,p.handle::text),'/social?post='||s.id,null::uuid,c.slug::text,c.short_name,s.visibility::text,s.created_at
    from public.social_posts s join public.profiles p on p.id=s.author_profile_id join public.campuses c on c.id=s.campus_id left join public.organizations o on o.id=s.organization_id
    where private.can_read_social_post(s.id) and s.search_vector@@websearch_to_tsquery('english',search_term)
  )
  select * from hits order by occurred_at desc,id desc limit least(greatest(result_limit,1),50)
$$;

create or replace function public.unified_search(search_term text,result_limit integer default 20)
returns table(kind text,id uuid,title text,subtitle text,href text,image_media_id uuid,campus_slug text,campus_short_name text,visibility text,occurred_at timestamptz)
language sql stable security invoker set search_path='' as $$ select * from private.unified_search(search_term,result_limit) $$;

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (
  target_type in ('listing','event','profile','message','conversation_request','community','discussion_post','discussion_comment','organization','social_post','social_comment')
);

create or replace function public.report_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.target_type='message' then
    select jsonb_build_object('messageId',m.id,'senderId',m.sender_id,'body',m.body,'createdAt',m.created_at) into new.message_snapshot from public.messages m where m.id=new.target_id and public.is_conversation_participant(m.conversation_id);
    if new.message_snapshot is null then raise exception 'message is not reportable' using errcode='42501'; end if;
  elsif new.target_type='conversation_request' then
    select jsonb_build_object('requestId',r.id,'senderId',r.requester_id,'recipientId',r.recipient_id,'openingMessage',r.opening_message,'createdAt',r.created_at,'contextType',r.context_type) into new.message_snapshot from public.conversation_requests r where r.id=new.target_id and r.recipient_id=(select auth.uid());
    if new.message_snapshot is null then raise exception 'request is not reportable' using errcode='42501'; end if;
  elsif new.target_type='community' then select jsonb_build_object('communityId',c.id,'slug',c.slug,'displayName',c.display_name,'description',c.description) into new.content_snapshot from public.discussion_communities c where c.id=new.target_id and c.campus_id=public.current_campus_id();
  elsif new.target_type='discussion_post' then select jsonb_build_object('postId',p.id,'communityId',p.community_id,'authorId',p.author_id,'title',p.title,'body',p.body,'linkUrl',p.link_url,'createdAt',p.created_at) into new.content_snapshot from public.discussion_posts p where p.id=new.target_id and p.campus_id=public.current_campus_id();
  elsif new.target_type='discussion_comment' then select jsonb_build_object('commentId',c.id,'communityId',c.community_id,'postId',c.post_id,'authorId',c.author_id,'body',c.body,'createdAt',c.created_at) into new.content_snapshot from public.discussion_comments c where c.id=new.target_id and c.campus_id=public.current_campus_id();
  elsif new.target_type='organization' then select jsonb_build_object('organizationId',o.id,'name',o.name,'description',o.description,'createdAt',o.created_at) into new.content_snapshot from public.organizations o where o.id=new.target_id and private.can_read_organization(o.id);
  elsif new.target_type='social_post' then select jsonb_build_object('postId',p.id,'authorId',p.author_profile_id,'organizationId',p.organization_id,'body',p.body,'createdAt',p.created_at) into new.content_snapshot from public.social_posts p where p.id=new.target_id and private.can_read_social_post(p.id);
  elsif new.target_type='social_comment' then select jsonb_build_object('commentId',c.id,'postId',c.post_id,'authorId',c.author_profile_id,'body',c.body,'createdAt',c.created_at) into new.content_snapshot from public.social_comments c where c.id=new.target_id and private.can_read_social_post(c.post_id);
  end if;
  if new.target_type in ('community','discussion_post','discussion_comment','organization','social_post','social_comment') and new.content_snapshot is null then raise exception 'content is not reportable' using errcode='42501'; end if;
  return new;
end $$;

create or replace function public.submit_report(submitted_type text,submitted_id uuid,submitted_reason text,submitted_details text,submitted_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); caller_campus uuid:=public.current_campus_id(); target_campus uuid; report_id uuid; global_scope boolean:=false;
begin
  if caller_campus is null then raise exception 'active membership required' using errcode='42501'; end if;
  if submitted_type='listing' then select campus_id,(visibility='network') into target_campus,global_scope from public.listings where id=submitted_id and deleted_at is null and private.content_is_visible(campus_id,visibility);
  elsif submitted_type='event' then select campus_id,(visibility='network') into target_campus,global_scope from public.events where id=submitted_id and deleted_at is null and private.content_is_visible(campus_id,visibility);
  elsif submitted_type='profile' then select campus_id,(campus_id<>caller_campus) into target_campus,global_scope from public.profiles where id=submitted_id and private.active_member(id);
  elsif submitted_type='message' then select m.campus_id,true into target_campus,global_scope from public.messages m where m.id=submitted_id and public.is_conversation_participant(m.conversation_id);
  elsif submitted_type='conversation_request' then select requester_campus_id,true into target_campus,global_scope from public.conversation_requests where id=submitted_id and recipient_id=caller;
  elsif submitted_type in ('community','discussion_post','discussion_comment') then target_campus:=caller_campus;
  elsif submitted_type='organization' then select campus_id,(visibility='network') into target_campus,global_scope from public.organizations where id=submitted_id and private.can_read_organization(id);
  elsif submitted_type='social_post' then select campus_id,(visibility='network') into target_campus,global_scope from public.social_posts where id=submitted_id and private.can_read_social_post(id);
  elsif submitted_type='social_comment' then select c.campus_id,(p.visibility='network') into target_campus,global_scope from public.social_comments c join public.social_posts p on p.id=c.post_id where c.id=submitted_id and private.can_read_social_post(p.id);
  else raise exception 'unsupported target' using errcode='23514'; end if;
  if target_campus is null then raise exception 'target unavailable' using errcode='P0002'; end if;
  insert into public.reports(campus_id,subject_campus_id,platform_visible,reporter_id,target_type,target_id,reason,details,idempotency_key)
    values(target_campus,target_campus,global_scope,caller,submitted_type,submitted_id,submitted_reason,submitted_details,submitted_key)
    on conflict(reporter_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into report_id;
  return report_id;
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
  elsif chosen_action='hide_content' and selected.target_type='social_post' then update public.social_posts set status='removed',removed_at=coalesce(removed_at,now()),removed_by=caller,removal_reason=btrim(action_reason) where id=selected.target_id and campus_id=selected.subject_campus_id and status='active';
  elsif chosen_action='hide_content' and selected.target_type='social_comment' then update public.social_comments set removed_at=coalesce(removed_at,now()),removed_by=caller,removal_reason=btrim(action_reason),body=null where id=selected.target_id and campus_id=selected.subject_campus_id and removed_at is null;
  elsif chosen_action='suspend' and selected.target_type='profile' then update public.profiles set status='suspended' where id=selected.target_id and campus_id=selected.subject_campus_id and id<>caller;
  elsif chosen_action='restore' and selected.target_type='profile' then update public.profiles set status='active' where id=selected.target_id and campus_id=selected.subject_campus_id;
  elsif chosen_action='suspend' and selected.target_type='organization' then update public.organizations set status='suspended',suspended_at=coalesce(suspended_at,now()) where id=selected.target_id and campus_id=selected.subject_campus_id;
  elsif chosen_action='restore' and selected.target_type='organization' then update public.organizations set status='active',suspended_at=null where id=selected.target_id and campus_id=selected.subject_campus_id and deleted_at is null;
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

revoke all on private.friend_relationship_actions,private.organization_membership_actions from public,anon,authenticated;
revoke execute on function private.set_notification_category() from public,anon,authenticated;
revoke execute on function private.valid_profile_interests(text[]),private.block_exists(uuid,uuid),private.are_friends(uuid,uuid),private.apply_block_relationships(),private.organization_role_rank(public.organization_role),private.can_read_organization(uuid),private.can_manage_organization(uuid,uuid),private.can_read_social_post(uuid),private.manage_friend_relationship(uuid,text,uuid),private.create_organization(text,text,text,public.content_visibility,public.organization_membership_policy,text,uuid),private.set_organization_membership(uuid,uuid,text,public.organization_role,uuid),private.create_social_post(text,uuid[],public.social_visibility,uuid,uuid),private.set_social_reaction(uuid,public.social_reaction_kind),private.create_social_comment(uuid,uuid,text,uuid),private.unified_search(text,integer) from public,anon,authenticated;
grant execute on function private.block_exists(uuid,uuid),private.are_friends(uuid,uuid),private.organization_role_rank(public.organization_role),private.can_read_organization(uuid),private.can_manage_organization(uuid,uuid),private.can_read_social_post(uuid),private.manage_friend_relationship(uuid,text,uuid),private.create_organization(text,text,text,public.content_visibility,public.organization_membership_policy,text,uuid),private.set_organization_membership(uuid,uuid,text,public.organization_role,uuid),private.create_social_post(text,uuid[],public.social_visibility,uuid,uuid),private.set_social_reaction(uuid,public.social_reaction_kind),private.create_social_comment(uuid,uuid,text,uuid),private.unified_search(text,integer) to authenticated,service_role;
grant execute on function private.valid_profile_interests(text[]) to authenticated,service_role;
revoke execute on function public.manage_friend_relationship(uuid,text,uuid),public.create_organization(text,text,text,public.content_visibility,public.organization_membership_policy,text,uuid),public.set_organization_membership(uuid,uuid,text,public.organization_role,uuid),public.create_social_post(text,uuid[],public.social_visibility,uuid,uuid),public.set_social_reaction(uuid,public.social_reaction_kind),public.create_social_comment(uuid,uuid,text,uuid),public.social_feed(timestamptz,uuid,integer),public.unified_search(text,integer) from public,anon;
grant execute on function public.manage_friend_relationship(uuid,text,uuid),public.create_organization(text,text,text,public.content_visibility,public.organization_membership_policy,text,uuid),public.set_organization_membership(uuid,uuid,text,public.organization_role,uuid),public.create_social_post(text,uuid[],public.social_visibility,uuid,uuid),public.set_social_reaction(uuid,public.social_reaction_kind),public.create_social_comment(uuid,uuid,text,uuid),public.social_feed(timestamptz,uuid,integer),public.unified_search(text,integer) to authenticated;
revoke execute on function private.safe_profile_by_username(text) from public,anon;
grant execute on function private.safe_profile_by_username(text),public.safe_profile_by_username(text) to authenticated;
grant usage on type public.profile_visibility,public.friend_relationship_status,public.organization_status,public.organization_membership_policy,public.organization_role,public.organization_membership_status,public.social_visibility,public.social_post_status,public.social_reaction_kind,public.notification_category to authenticated,service_role;
revoke execute on function public.report_snapshot() from public,anon,authenticated;
