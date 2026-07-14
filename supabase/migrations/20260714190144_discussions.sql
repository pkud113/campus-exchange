create schema if not exists private;

create type public.discussion_community_status as enum ('active', 'archived', 'deleted');
create type public.discussion_visibility as enum ('campus_private', 'hidden');
create type public.discussion_membership_role as enum ('owner', 'moderator', 'member');
create type public.discussion_membership_state as enum ('active', 'banned', 'left');
create type public.discussion_post_type as enum ('text', 'link', 'image');
create type public.discussion_posting_permission as enum ('members', 'moderators', 'owner');

insert into public.runtime_settings(key, value)
values ('discussions_enabled', 'true'::jsonb)
on conflict (key) do nothing;

create table public.discussion_communities (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  slug text not null,
  display_name text not null,
  description text not null default '',
  rules text not null default '',
  icon_media_id uuid references public.media_uploads(id) on delete set null,
  banner_media_id uuid references public.media_uploads(id) on delete set null,
  status public.discussion_community_status not null default 'active',
  visibility public.discussion_visibility not null default 'campus_private',
  posting_permission public.discussion_posting_permission not null default 'members',
  comments_enabled boolean not null default true,
  member_count integer not null default 1 check (member_count >= 0),
  post_count integer not null default 0 check (post_count >= 0),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  purge_after timestamptz,
  purged_at timestamptz,
  unique (campus_id, slug),
  unique (owner_id, idempotency_key),
  check (slug ~ '^[a-z0-9_]{3,32}$'),
  check (char_length(display_name) between 3 and 80),
  check (char_length(description) <= 5000),
  check (char_length(rules) <= 10000)
);

create table public.discussion_memberships (
  community_id uuid not null references public.discussion_communities(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  role public.discussion_membership_role not null default 'member',
  state public.discussion_membership_state not null default 'active',
  banned_by uuid references public.profiles(id),
  banned_reason text,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (community_id, profile_id),
  check (banned_reason is null or char_length(banned_reason) between 3 and 1000),
  check (role not in ('owner', 'moderator') or state = 'active')
);

create table public.discussion_posts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  community_id uuid not null references public.discussion_communities(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  post_type public.discussion_post_type not null,
  title text,
  body text,
  link_url text,
  media_id uuid references public.media_uploads(id) on delete set null,
  score integer not null default 0,
  comment_count integer not null default 0 check (comment_count >= 0),
  save_count integer not null default 0 check (save_count >= 0),
  hot_rank double precision not null default 0,
  is_pinned boolean not null default false,
  locked_at timestamptz,
  locked_by uuid references public.profiles(id),
  removed_at timestamptz,
  removed_by uuid references public.profiles(id),
  removal_reason text,
  edited_at timestamptz,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  purge_after timestamptz,
  purged_at timestamptz,
  search_vector tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) stored,
  unique (author_id, idempotency_key),
  check (title is null or char_length(title) between 3 and 300),
  check (body is null or char_length(body) <= 20000),
  check (removal_reason is null or char_length(removal_reason) between 3 and 1000),
  check (deleted_at is not null or removed_at is not null or (
    title is not null and
    (post_type <> 'text' or (body is not null and char_length(trim(body)) > 0)) and
    (post_type <> 'link' or (link_url is not null and link_url ~ '^https://')) and
    (post_type <> 'image' or media_id is not null)
  ))
);

create table public.discussion_comments (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  community_id uuid not null references public.discussion_communities(id) on delete cascade,
  post_id uuid not null references public.discussion_posts(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  parent_comment_id uuid references public.discussion_comments(id) on delete restrict,
  depth smallint not null default 0 check (depth between 0 and 8),
  body text,
  score integer not null default 0,
  reply_count integer not null default 0 check (reply_count >= 0),
  edited_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id),
  removal_reason text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  purge_after timestamptz,
  purged_at timestamptz,
  unique (author_id, idempotency_key),
  check (body is null or char_length(body) between 1 and 10000),
  check (removal_reason is null or char_length(removal_reason) between 3 and 1000),
  check (deleted_at is not null or removed_at is not null or body is not null)
);

create table public.discussion_post_votes (
  post_id uuid not null references public.discussion_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table public.discussion_comment_votes (
  comment_id uuid not null references public.discussion_comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (comment_id, profile_id)
);

create table public.discussion_saved_posts (
  post_id uuid not null references public.discussion_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table public.discussion_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  community_id uuid not null references public.discussion_communities(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_type text not null check (target_type in ('community', 'post', 'comment', 'member')),
  target_id uuid not null,
  reason text,
  request_id uuid,
  metadata jsonb not null default '{}',
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (actor_id, idempotency_key),
  check (reason is null or char_length(reason) between 3 and 1000)
);

alter table public.media_uploads
  add column discussion_community_id uuid references public.discussion_communities(id) on delete set null,
  add column discussion_post_id uuid references public.discussion_posts(id) on delete set null,
  add column attached_at timestamptz;

alter table public.media_uploads drop constraint if exists media_uploads_purpose_check;
alter table public.media_uploads drop constraint if exists media_uploads_check;
alter table public.media_uploads add constraint media_uploads_purpose_check check (
  purpose in ('listing', 'avatar', 'banner', 'community_icon', 'community_banner', 'discussion_post')
);
alter table public.media_uploads add constraint media_uploads_target_check check (
  (purpose = 'listing' and listing_id is not null and profile_id is null and discussion_community_id is null and discussion_post_id is null)
  or (purpose in ('avatar', 'banner') and listing_id is null and profile_id = uploader_id and discussion_community_id is null and discussion_post_id is null)
  or (purpose in ('community_icon', 'community_banner') and listing_id is null and profile_id is null and discussion_post_id is null)
  or (purpose = 'discussion_post' and listing_id is null and profile_id is null and discussion_community_id is null)
);

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add column content_snapshot jsonb;
alter table public.reports add constraint reports_target_type_check check (
  target_type in ('listing', 'event', 'profile', 'message', 'community', 'discussion_post', 'discussion_comment')
);

create unique index discussion_communities_slug_idx on public.discussion_communities(campus_id, lower(slug));
create index discussion_communities_popular_idx on public.discussion_communities(campus_id, member_count desc, post_count desc, id desc) where deleted_at is null;
create index discussion_communities_new_idx on public.discussion_communities(campus_id, created_at desc, id desc) where deleted_at is null;
create index discussion_communities_search_idx on public.discussion_communities using gin (to_tsvector('english', display_name || ' ' || slug || ' ' || description));
create index discussion_communities_name_trgm_idx on public.discussion_communities using gin (display_name extensions.gin_trgm_ops);
create index discussion_memberships_profile_idx on public.discussion_memberships(profile_id, state, updated_at desc);
create index discussion_memberships_community_idx on public.discussion_memberships(community_id, state, role, joined_at);
create index discussion_posts_new_idx on public.discussion_posts(campus_id, community_id, created_at desc, id desc) where deleted_at is null;
create index discussion_posts_top_idx on public.discussion_posts(campus_id, community_id, score desc, created_at desc, id desc) where deleted_at is null;
create index discussion_posts_comments_idx on public.discussion_posts(campus_id, community_id, comment_count desc, created_at desc, id desc) where deleted_at is null;
create index discussion_posts_hot_idx on public.discussion_posts(campus_id, community_id, hot_rank desc, id desc) where deleted_at is null;
create index discussion_posts_search_idx on public.discussion_posts using gin (search_vector);
create index discussion_posts_title_trgm_idx on public.discussion_posts using gin (title extensions.gin_trgm_ops);
create index discussion_comments_tree_idx on public.discussion_comments(post_id, parent_comment_id, created_at, id);
create index discussion_comments_purge_idx on public.discussion_comments(purge_after) where purge_after is not null and purged_at is null;
create index discussion_posts_purge_idx on public.discussion_posts(purge_after) where purge_after is not null and purged_at is null;
create index discussion_communities_purge_idx on public.discussion_communities(purge_after) where purge_after is not null and purged_at is null;
create index discussion_moderation_queue_idx on public.discussion_moderation_actions(community_id, created_at desc);
create index discussion_saved_profile_idx on public.discussion_saved_posts(profile_id, created_at desc);
create index media_discussion_unattached_idx on public.media_uploads(purpose, created_at) where purpose in ('community_icon', 'community_banner', 'discussion_post') and attached_at is null;

create trigger discussion_communities_touch before update on public.discussion_communities for each row execute function public.touch_updated_at();
create trigger discussion_memberships_touch before update on public.discussion_memberships for each row execute function public.touch_updated_at();
create trigger discussion_posts_touch before update on public.discussion_posts for each row execute function public.touch_updated_at();
create trigger discussion_comments_touch before update on public.discussion_comments for each row execute function public.touch_updated_at();
create trigger discussion_post_votes_touch before update on public.discussion_post_votes for each row execute function public.touch_updated_at();
create trigger discussion_comment_votes_touch before update on public.discussion_comment_votes for each row execute function public.touch_updated_at();

create or replace function public.enforce_media_target() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.purpose = 'listing' then
    if new.listing_id is null or new.profile_id is not null or new.discussion_community_id is not null or new.discussion_post_id is not null then
      raise exception 'listing media must target one listing' using errcode = '23514';
    end if;
  elsif new.purpose in ('avatar', 'banner') then
    if new.profile_id is distinct from new.uploader_id or new.listing_id is not null or new.discussion_community_id is not null or new.discussion_post_id is not null then
      raise exception 'profile media must target its uploader' using errcode = '23514';
    end if;
  elsif new.purpose in ('community_icon', 'community_banner') then
    if new.listing_id is not null or new.profile_id is not null or new.discussion_post_id is not null then
      raise exception 'community media has an invalid target' using errcode = '23514';
    end if;
  elsif new.purpose = 'discussion_post' then
    if new.listing_id is not null or new.profile_id is not null or new.discussion_community_id is not null then
      raise exception 'discussion post media has an invalid target' using errcode = '23514';
    end if;
  else
    raise exception 'unsupported media purpose' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function private.discussions_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select value::text::boolean from public.runtime_settings where key = 'discussions_enabled'), true)
$$;

create or replace function public.discussions_enabled() returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.discussions_enabled()
$$;

create or replace function private.discussion_hot_rank(target_score integer, target_comments integer, target_created timestamptz)
returns double precision language sql immutable set search_path = '' as $$
  select (
    3 * sign((target_score + 2 * target_comments)::numeric)
      * ln(1 + abs((target_score + 2 * target_comments)::numeric))
    + extract(epoch from target_created) / 259200.0
  )::double precision
$$;

create or replace function private.refresh_discussion_hot_rank() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.hot_rank := private.discussion_hot_rank(new.score, new.comment_count, new.created_at);
  return new;
end $$;
create trigger discussion_posts_hot_rank before insert or update of score, comment_count on public.discussion_posts
for each row execute function private.refresh_discussion_hot_rank();

create or replace function private.discussion_is_community_moderator(target_community uuid, actor uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.discussion_memberships m
    where m.community_id = target_community and m.profile_id = actor
      and m.state = 'active' and m.role in ('owner', 'moderator')
  )
$$;

create or replace function private.discussion_can_moderate(target_community uuid, actor uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select private.discussion_is_community_moderator(target_community, actor)
    or (
      exists(
        select 1 from public.discussion_communities c
        where c.id = target_community and c.campus_id = public.current_campus_id()
      )
      and public.has_role(array['moderator', 'admin']::public.app_role[])
      and public.has_mfa()
    )
$$;

create or replace function private.discussion_is_owner(target_community uuid, actor uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.discussion_communities c
    where c.id = target_community and c.owner_id = actor and c.campus_id = public.current_campus_id()
  )
$$;

create or replace function private.require_discussion_participant(target_community uuid, actor uuid default auth.uid())
returns public.discussion_memberships
language plpgsql stable security definer set search_path = '' as $$
declare selected public.discussion_memberships;
begin
  if actor is null or not public.is_active_student() or not private.discussions_enabled() then
    raise exception 'active campus membership required' using errcode = '42501';
  end if;
  select * into selected from public.discussion_memberships
  where community_id = target_community and profile_id = actor and campus_id = public.current_campus_id();
  if selected.profile_id is null or selected.state <> 'active' then
    raise exception 'active community membership required' using errcode = '42501';
  end if;
  return selected;
end $$;

create or replace function private.create_discussion_community(
  submitted_slug text,
  submitted_name text,
  submitted_description text,
  submitted_rules text,
  submitted_permission public.discussion_posting_permission,
  submitted_key uuid
) returns public.discussion_communities
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  campus uuid := public.current_campus_id();
  created public.discussion_communities;
begin
  if caller is null or campus is null or not private.discussions_enabled() then
    raise exception 'active campus membership required' using errcode = '42501';
  end if;
  if lower(trim(submitted_slug)) !~ '^[a-z0-9_]{3,32}$' then
    raise exception 'invalid community slug' using errcode = '23514';
  end if;
  select * into created from public.discussion_communities
    where owner_id = caller and idempotency_key = submitted_key;
  if created.id is not null then return created; end if;
  insert into public.discussion_communities(
    campus_id, owner_id, slug, display_name, description, rules, posting_permission, idempotency_key
  ) values (
    campus, caller, lower(trim(submitted_slug)), trim(submitted_name), trim(submitted_description),
    trim(submitted_rules), submitted_permission, submitted_key
  ) returning * into created;
  insert into public.discussion_memberships(community_id, profile_id, campus_id, role, state)
  values(created.id, caller, campus, 'owner', 'active');
  return created;
end $$;

create or replace function public.create_discussion_community(
  submitted_slug text,
  submitted_name text,
  submitted_description text,
  submitted_rules text,
  submitted_permission public.discussion_posting_permission,
  submitted_key uuid
) returns public.discussion_communities
language sql security invoker set search_path = '' as $$
  select private.create_discussion_community(
    submitted_slug, submitted_name, submitted_description, submitted_rules, submitted_permission, submitted_key
  )
$$;

create or replace function private.set_discussion_membership(target_slug text, desired boolean)
returns public.discussion_memberships
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  campus uuid := public.current_campus_id();
  community public.discussion_communities;
  previous public.discussion_memberships;
  changed public.discussion_memberships;
begin
  if caller is null or campus is null or not private.discussions_enabled() then
    raise exception 'active campus membership required' using errcode = '42501';
  end if;
  select * into community from public.discussion_communities
  where campus_id = campus and slug = lower(target_slug) and deleted_at is null for update;
  if community.id is null then raise exception 'community unavailable' using errcode = 'P0002'; end if;
  select * into previous from public.discussion_memberships
  where community_id = community.id and profile_id = caller for update;
  if previous.role = 'owner' and not desired then
    raise exception 'transfer ownership before leaving' using errcode = '42501';
  end if;
  if previous.state = 'banned' and desired then
    raise exception 'banned members cannot rejoin' using errcode = '42501';
  end if;
  if desired then
    insert into public.discussion_memberships(community_id, profile_id, campus_id, role, state, joined_at)
    values(community.id, caller, campus, 'member', 'active', now())
    on conflict(community_id, profile_id) do update set state = 'active', joined_at = now(), banned_by = null, banned_reason = null
    returning * into changed;
    if previous.profile_id is null or previous.state <> 'active' then
      update public.discussion_communities set member_count = member_count + 1 where id = community.id;
    end if;
  else
    if previous.profile_id is null or previous.state <> 'active' then
      raise exception 'active membership not found' using errcode = 'P0002';
    end if;
    update public.discussion_memberships set state = 'left', role = 'member'
    where community_id = community.id and profile_id = caller returning * into changed;
    update public.discussion_communities set member_count = greatest(0, member_count - 1) where id = community.id;
  end if;
  return changed;
end $$;

create or replace function public.set_discussion_membership(target_slug text, desired boolean)
returns public.discussion_memberships language sql security invoker set search_path = '' as $$
  select private.set_discussion_membership(target_slug, desired)
$$;

create or replace function private.update_discussion_community(
  target_slug text,
  submitted_name text,
  submitted_description text,
  submitted_rules text,
  submitted_permission public.discussion_posting_permission,
  submitted_comments_enabled boolean
) returns public.discussion_communities
language plpgsql security definer set search_path = '' as $$
declare community public.discussion_communities;
begin
  select * into community from public.discussion_communities
  where campus_id = public.current_campus_id() and slug = lower(target_slug) and deleted_at is null for update;
  if community.id is null then raise exception 'community unavailable' using errcode = 'P0002'; end if;
  if not private.discussion_is_owner(community.id) then
    raise exception 'community owner required' using errcode = '42501';
  end if;
  update public.discussion_communities set
    display_name = trim(submitted_name), description = trim(submitted_description), rules = trim(submitted_rules),
    posting_permission = submitted_permission, comments_enabled = submitted_comments_enabled
  where id = community.id returning * into community;
  return community;
end $$;

create or replace function public.update_discussion_community(
  target_slug text,
  submitted_name text,
  submitted_description text,
  submitted_rules text,
  submitted_permission public.discussion_posting_permission,
  submitted_comments_enabled boolean
) returns public.discussion_communities language sql security invoker set search_path = '' as $$
  select private.update_discussion_community(
    target_slug, submitted_name, submitted_description, submitted_rules, submitted_permission, submitted_comments_enabled
  )
$$;

create or replace function private.create_discussion_post(
  target_slug text,
  submitted_type public.discussion_post_type,
  submitted_title text,
  submitted_body text,
  submitted_link text,
  submitted_media uuid,
  submitted_key uuid
) returns public.discussion_posts
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  campus uuid := public.current_campus_id();
  community public.discussion_communities;
  membership public.discussion_memberships;
  media public.media_uploads;
  created public.discussion_posts;
begin
  select * into community from public.discussion_communities
  where campus_id = campus and slug = lower(target_slug) and deleted_at is null for update;
  if community.id is null or community.status <> 'active' or community.visibility <> 'campus_private' then
    raise exception 'community is not accepting posts' using errcode = '42501';
  end if;
  membership := private.require_discussion_participant(community.id, caller);
  if (community.posting_permission = 'moderators' and membership.role = 'member')
    or (community.posting_permission = 'owner' and membership.role <> 'owner') then
    raise exception 'posting permission denied' using errcode = '42501';
  end if;
  select * into created from public.discussion_posts where author_id = caller and idempotency_key = submitted_key;
  if created.id is not null then return created; end if;
  if submitted_type = 'text' and char_length(trim(coalesce(submitted_body, ''))) = 0 then
    raise exception 'text posts require a body' using errcode = '23514';
  elsif submitted_type = 'link' and coalesce(submitted_link, '') !~ '^https://[^[:space:]]+$' then
    raise exception 'link posts require an HTTPS URL' using errcode = '23514';
  elsif submitted_type = 'image' then
    select * into media from public.media_uploads
    where id = submitted_media and campus_id = campus and uploader_id = caller and purpose = 'discussion_post'
      and status = 'ready' and attached_at is null and discussion_post_id is null for update;
    if media.id is null then raise exception 'owned ready discussion media required' using errcode = '42501'; end if;
  end if;
  insert into public.discussion_posts(
    campus_id, community_id, author_id, post_type, title, body, link_url, media_id, idempotency_key
  ) values (
    campus, community.id, caller, submitted_type, trim(submitted_title), nullif(trim(coalesce(submitted_body, '')), ''),
    case when submitted_type = 'link' then trim(submitted_link) else null end,
    case when submitted_type = 'image' then submitted_media else null end, submitted_key
  ) returning * into created;
  if submitted_type = 'image' then
    update public.media_uploads set discussion_post_id = created.id, attached_at = now() where id = submitted_media;
  end if;
  update public.discussion_communities set post_count = post_count + 1 where id = community.id;
  return created;
end $$;

create or replace function public.create_discussion_post(
  target_slug text,
  submitted_type public.discussion_post_type,
  submitted_title text,
  submitted_body text,
  submitted_link text,
  submitted_media uuid,
  submitted_key uuid
) returns public.discussion_posts language sql security invoker set search_path = '' as $$
  select private.create_discussion_post(
    target_slug, submitted_type, submitted_title, submitted_body, submitted_link, submitted_media, submitted_key
  )
$$;

create or replace function private.update_discussion_post(target_post uuid, submitted_title text, submitted_body text, submitted_link text)
returns public.discussion_posts language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); selected public.discussion_posts; community public.discussion_communities;
begin
  select * into selected from public.discussion_posts where id = target_post and campus_id = public.current_campus_id() for update;
  if selected.id is null then raise exception 'post unavailable' using errcode = 'P0002'; end if;
  select * into community from public.discussion_communities where id = selected.community_id;
  if selected.author_id is distinct from caller or selected.deleted_at is not null or selected.removed_at is not null or community.status <> 'active' then
    raise exception 'post cannot be edited' using errcode = '42501';
  end if;
  if selected.post_type = 'text' and char_length(trim(coalesce(submitted_body, ''))) = 0 then
    raise exception 'text posts require a body' using errcode = '23514';
  end if;
  if selected.post_type = 'link' and coalesce(submitted_link, '') !~ '^https://[^[:space:]]+$' then
    raise exception 'link posts require an HTTPS URL' using errcode = '23514';
  end if;
  update public.discussion_posts set title = trim(submitted_title),
    body = case when post_type = 'image' then nullif(trim(coalesce(submitted_body, '')), '') else nullif(trim(coalesce(submitted_body, '')), '') end,
    link_url = case when post_type = 'link' then trim(submitted_link) else null end, edited_at = now()
  where id = target_post returning * into selected;
  return selected;
end $$;

create or replace function public.update_discussion_post(target_post uuid, submitted_title text, submitted_body text, submitted_link text)
returns public.discussion_posts language sql security invoker set search_path = '' as $$
  select private.update_discussion_post(target_post, submitted_title, submitted_body, submitted_link)
$$;

create or replace function private.delete_discussion_post(target_post uuid, submitted_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); selected public.discussion_posts;
begin
  select * into selected from public.discussion_posts where id = target_post and campus_id = public.current_campus_id() for update;
  if selected.id is null or selected.author_id is distinct from caller then
    raise exception 'post unavailable' using errcode = '42501';
  end if;
  if selected.deleted_at is null then
    update public.discussion_posts set title = '[deleted]', body = null, link_url = null, author_id = null,
      deleted_at = now(), deleted_by = caller, purge_after = now() + interval '30 days', is_pinned = false
    where id = target_post;
    if selected.media_id is not null then
      update public.media_uploads set status = 'deleted', deleted_at = now(), purge_after = now() + interval '30 days'
      where id = selected.media_id;
    end if;
    update public.discussion_communities set post_count = greatest(0, post_count - 1) where id = selected.community_id;
    insert into public.audit_log(campus_id, actor_id, action, target_type, target_id, metadata)
    values(selected.campus_id, caller, 'discussion.post_deleted', 'discussion_post', target_post::text,
      jsonb_build_object('reason', submitted_reason, 'communityId', selected.community_id));
  end if;
end $$;

create or replace function public.delete_discussion_post(target_post uuid, submitted_reason text)
returns void language sql security invoker set search_path = '' as $$ select private.delete_discussion_post(target_post, submitted_reason) $$;

create or replace function private.create_discussion_comment(
  target_post uuid,
  target_parent uuid,
  submitted_body text,
  submitted_key uuid
) returns public.discussion_comments
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  post public.discussion_posts;
  community public.discussion_communities;
  parent public.discussion_comments;
  created public.discussion_comments;
  target_depth smallint := 0;
begin
  select * into post from public.discussion_posts where id = target_post and campus_id = public.current_campus_id() for update;
  if post.id is null or post.deleted_at is not null or post.removed_at is not null or post.locked_at is not null then
    raise exception 'post is not accepting comments' using errcode = '42501';
  end if;
  select * into community from public.discussion_communities where id = post.community_id for update;
  if community.status <> 'active' or not community.comments_enabled then
    raise exception 'community is not accepting comments' using errcode = '42501';
  end if;
  perform private.require_discussion_participant(community.id, caller);
  select * into created from public.discussion_comments where author_id = caller and idempotency_key = submitted_key;
  if created.id is not null then return created; end if;
  if target_parent is not null then
    select * into parent from public.discussion_comments where id = target_parent and post_id = target_post for update;
    if parent.id is null then raise exception 'parent comment unavailable' using errcode = 'P0002'; end if;
    target_depth := parent.depth + 1;
    if target_depth > 8 then raise exception 'maximum comment depth exceeded' using errcode = '23514'; end if;
  end if;
  insert into public.discussion_comments(
    campus_id, community_id, post_id, author_id, parent_comment_id, depth, body, idempotency_key
  ) values (
    post.campus_id, post.community_id, post.id, caller, target_parent, target_depth, trim(submitted_body), submitted_key
  ) returning * into created;
  update public.discussion_posts set comment_count = comment_count + 1 where id = post.id;
  if target_parent is not null then update public.discussion_comments set reply_count = reply_count + 1 where id = target_parent; end if;
  return created;
end $$;

create or replace function public.create_discussion_comment(target_post uuid, target_parent uuid, submitted_body text, submitted_key uuid)
returns public.discussion_comments language sql security invoker set search_path = '' as $$
  select private.create_discussion_comment(target_post, target_parent, submitted_body, submitted_key)
$$;

create or replace function private.discussion_comment_tree(
  target_post uuid,
  cursor_created timestamptz default null,
  cursor_id uuid default null,
  root_limit integer default 20
) returns setof public.discussion_comments
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists(
    select 1 from public.discussion_posts p
    join public.discussion_communities c on c.id=p.community_id
    where p.id=target_post and p.campus_id=public.current_campus_id()
      and c.deleted_at is null and c.visibility='campus_private' and private.discussions_enabled()
  ) then raise exception 'post unavailable' using errcode='P0002'; end if;
  return query
  with recursive roots as materialized (
    select c.id,c.created_at from public.discussion_comments c
    where c.post_id=target_post and c.parent_comment_id is null
      and (cursor_created is null or (c.created_at,c.id)<(cursor_created,cursor_id))
    order by c.created_at desc,c.id desc
    limit least(greatest(root_limit,1),50)
  ), tree(row_data,root_id) as (
    select c,c.id from public.discussion_comments c join roots r on r.id=c.id
    union all
    select child,tree.root_id from public.discussion_comments child
    join tree on child.parent_comment_id=(tree.row_data).id
  )
  select (tree.row_data).* from tree
  join roots on roots.id=tree.root_id
  order by roots.created_at desc,roots.id desc,(tree.row_data).depth,(tree.row_data).created_at,(tree.row_data).id;
end $$;

create or replace function public.discussion_comment_tree(
  target_post uuid,
  cursor_created timestamptz default null,
  cursor_id uuid default null,
  root_limit integer default 20
) returns setof public.discussion_comments
language sql stable security invoker set search_path = '' as $$
  select * from private.discussion_comment_tree(target_post,cursor_created,cursor_id,root_limit)
$$;

create or replace function private.update_discussion_comment(target_comment uuid, submitted_body text)
returns public.discussion_comments language plpgsql security definer set search_path = '' as $$
declare selected public.discussion_comments;
begin
  select * into selected from public.discussion_comments where id = target_comment and campus_id = public.current_campus_id() for update;
  if selected.id is null or selected.author_id is distinct from auth.uid() or selected.deleted_at is not null or selected.removed_at is not null then
    raise exception 'comment cannot be edited' using errcode = '42501';
  end if;
  update public.discussion_comments set body = trim(submitted_body), edited_at = now()
  where id = target_comment returning * into selected;
  return selected;
end $$;

create or replace function public.update_discussion_comment(target_comment uuid, submitted_body text)
returns public.discussion_comments language sql security invoker set search_path = '' as $$
  select private.update_discussion_comment(target_comment, submitted_body)
$$;

create or replace function private.delete_discussion_comment(target_comment uuid, submitted_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare selected public.discussion_comments;
begin
  select * into selected from public.discussion_comments where id = target_comment and campus_id = public.current_campus_id() for update;
  if selected.id is null or selected.author_id is distinct from auth.uid() then
    raise exception 'comment unavailable' using errcode = '42501';
  end if;
  if selected.deleted_at is null then
    update public.discussion_comments set body = null, author_id = null, deleted_at = now(), deleted_by = auth.uid(),
      purge_after = now() + interval '30 days' where id = target_comment;
    update public.discussion_posts set comment_count = greatest(0, comment_count - 1) where id = selected.post_id;
    if selected.parent_comment_id is not null then
      update public.discussion_comments set reply_count = greatest(0, reply_count - 1) where id = selected.parent_comment_id;
    end if;
    insert into public.audit_log(campus_id, actor_id, action, target_type, target_id, metadata)
    values(selected.campus_id, auth.uid(), 'discussion.comment_deleted', 'discussion_comment', target_comment::text,
      jsonb_build_object('reason', submitted_reason, 'communityId', selected.community_id, 'postId', selected.post_id));
  end if;
end $$;

create or replace function public.delete_discussion_comment(target_comment uuid, submitted_reason text)
returns void language sql security invoker set search_path = '' as $$ select private.delete_discussion_comment(target_comment, submitted_reason) $$;

create or replace function private.set_discussion_vote(target_type text, target_id uuid, desired_value smallint)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  campus uuid := public.current_campus_id();
  post public.discussion_posts;
  comment public.discussion_comments;
  community public.discussion_communities;
  old_value smallint := 0;
  delta integer;
  new_score integer;
begin
  if desired_value is not null and desired_value not in (-1, 1) then
    raise exception 'vote must be -1, 1, or null' using errcode = '23514';
  end if;
  if target_type = 'post' then
    select * into post from public.discussion_posts where id = target_id and campus_id = campus for update;
    if post.id is null then
      raise exception 'post unavailable' using errcode = 'P0002';
    end if;
    select * into community from public.discussion_communities where id=post.community_id for update;
    if desired_value is not null and (post.deleted_at is not null or post.removed_at is not null or post.locked_at is not null
      or community.status <> 'active' or community.visibility <> 'campus_private') then
      raise exception 'post unavailable' using errcode = 'P0002';
    end if;
    if desired_value is not null then perform private.require_discussion_participant(post.community_id, caller); end if;
    select value into old_value from public.discussion_post_votes where post_id = post.id and profile_id = caller for update;
    old_value := coalesce(old_value, 0);
    if desired_value is null then
      delete from public.discussion_post_votes where post_id = post.id and profile_id = caller;
    else
      insert into public.discussion_post_votes(post_id, profile_id, campus_id, value)
      values(post.id, caller, campus, desired_value)
      on conflict(post_id, profile_id) do update set value = excluded.value, updated_at = now();
    end if;
    delta := coalesce(desired_value, 0) - old_value;
    update public.discussion_posts set score = score + delta where id = post.id returning score into new_score;
  elsif target_type = 'comment' then
    select * into comment from public.discussion_comments where id = target_id and campus_id = campus for update;
    if comment.id is null then
      raise exception 'comment unavailable' using errcode = 'P0002';
    end if;
    select * into post from public.discussion_posts where id=comment.post_id for update;
    select * into community from public.discussion_communities where id=comment.community_id for update;
    if desired_value is not null and (comment.deleted_at is not null or comment.removed_at is not null
      or post.deleted_at is not null or post.removed_at is not null or post.locked_at is not null
      or community.status <> 'active' or community.visibility <> 'campus_private') then
      raise exception 'comment unavailable' using errcode = 'P0002';
    end if;
    if desired_value is not null then perform private.require_discussion_participant(comment.community_id, caller); end if;
    select value into old_value from public.discussion_comment_votes where comment_id = comment.id and profile_id = caller for update;
    old_value := coalesce(old_value, 0);
    if desired_value is null then
      delete from public.discussion_comment_votes where comment_id = comment.id and profile_id = caller;
    else
      insert into public.discussion_comment_votes(comment_id, profile_id, campus_id, value)
      values(comment.id, caller, campus, desired_value)
      on conflict(comment_id, profile_id) do update set value = excluded.value, updated_at = now();
    end if;
    delta := coalesce(desired_value, 0) - old_value;
    update public.discussion_comments set score = score + delta where id = comment.id returning score into new_score;
  else
    raise exception 'unsupported vote target' using errcode = '23514';
  end if;
  return new_score;
end $$;

create or replace function public.set_discussion_vote(target_type text, target_id uuid, desired_value smallint)
returns integer language sql security invoker set search_path = '' as $$
  select private.set_discussion_vote(target_type, target_id, desired_value)
$$;

create or replace function private.set_discussion_saved(target_post uuid, desired boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); campus uuid := public.current_campus_id(); post public.discussion_posts; community public.discussion_communities; changed integer;
begin
  select * into post from public.discussion_posts where id = target_post and campus_id = campus for update;
  if post.id is null or caller is null then raise exception 'post unavailable' using errcode = 'P0002'; end if;
  select * into community from public.discussion_communities where id=post.community_id for update;
  if desired then
    if post.deleted_at is not null or post.removed_at is not null or post.locked_at is not null
      or community.status <> 'active' or community.visibility <> 'campus_private' then
      raise exception 'post unavailable' using errcode = 'P0002';
    end if;
    perform private.require_discussion_participant(post.community_id,caller);
    insert into public.discussion_saved_posts(post_id, profile_id, campus_id)
    values(post.id, caller, campus) on conflict do nothing;
    get diagnostics changed = row_count;
    if changed > 0 then update public.discussion_posts set save_count = save_count + 1 where id = post.id; end if;
  else
    delete from public.discussion_saved_posts where post_id = post.id and profile_id = caller;
    get diagnostics changed = row_count;
    if changed > 0 then update public.discussion_posts set save_count = greatest(0, save_count - 1) where id = post.id; end if;
  end if;
  return desired;
end $$;

create or replace function public.set_discussion_saved(target_post uuid, desired boolean)
returns boolean language sql security invoker set search_path = '' as $$ select private.set_discussion_saved(target_post, desired) $$;

create or replace function private.attach_discussion_media(target_slug text, target_media uuid, target_purpose text)
returns void language plpgsql security definer set search_path = '' as $$
declare community public.discussion_communities; media public.media_uploads; previous uuid;
begin
  if target_purpose not in ('community_icon', 'community_banner') then
    raise exception 'invalid community media purpose' using errcode = '23514';
  end if;
  select * into community from public.discussion_communities
  where campus_id = public.current_campus_id() and slug = lower(target_slug) and deleted_at is null for update;
  if community.id is null or not private.discussion_is_owner(community.id) then
    raise exception 'community owner required' using errcode = '42501';
  end if;
  select * into media from public.media_uploads where id = target_media and uploader_id = auth.uid()
    and campus_id = community.campus_id and purpose = target_purpose and status = 'ready'
    and attached_at is null and discussion_community_id is null for update;
  if media.id is null then raise exception 'owned ready media required' using errcode = '42501'; end if;
  previous := case when target_purpose = 'community_icon' then community.icon_media_id else community.banner_media_id end;
  if target_purpose = 'community_icon' then
    update public.discussion_communities set icon_media_id = target_media where id = community.id;
  else
    update public.discussion_communities set banner_media_id = target_media where id = community.id;
  end if;
  update public.media_uploads set discussion_community_id = community.id, attached_at = now() where id = target_media;
  if previous is not null and previous <> target_media then
    update public.media_uploads set status = 'deleted', deleted_at = now(), purge_after = now() + interval '30 days'
    where id = previous;
  end if;
end $$;

create or replace function public.attach_discussion_media(target_slug text, target_media uuid, target_purpose text)
returns void language sql security invoker set search_path = '' as $$
  select private.attach_discussion_media(target_slug, target_media, target_purpose)
$$;

create or replace function private.moderate_discussion(
  target_slug text,
  chosen_action text,
  target_type text,
  target_id uuid,
  submitted_reason text,
  submitted_request_id uuid,
  submitted_key uuid
) returns public.discussion_moderation_actions
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  campus uuid := public.current_campus_id();
  community public.discussion_communities;
  action_row public.discussion_moderation_actions;
  target_member public.discussion_memberships;
  target_author uuid;
  owner_only boolean := chosen_action in ('add_moderator', 'remove_moderator', 'archive', 'unarchive');
begin
  select * into action_row from public.discussion_moderation_actions where actor_id = caller and idempotency_key = submitted_key;
  if action_row.id is not null then return action_row; end if;
  select * into community from public.discussion_communities
  where campus_id = campus and slug = lower(target_slug) and deleted_at is null for update;
  if community.id is null then raise exception 'community unavailable' using errcode = 'P0002'; end if;
  if not private.discussion_can_moderate(community.id, caller) then
    raise exception 'discussion moderator access required' using errcode = '42501';
  end if;
  if owner_only and not private.discussion_is_owner(community.id, caller) then
    raise exception 'community owner required' using errcode = '42501';
  end if;
  if chosen_action in ('remove_post', 'restore_post', 'lock_post', 'unlock_post', 'pin_post', 'unpin_post') then
    if target_type <> 'post' then raise exception 'post target required' using errcode = '23514'; end if;
    select author_id into target_author from public.discussion_posts where id = target_id and community_id = community.id for update;
    if not found then raise exception 'post unavailable' using errcode = 'P0002'; end if;
    if chosen_action = 'remove_post' then
      update public.discussion_posts set removed_at = now(), removed_by = caller, removal_reason = trim(submitted_reason), is_pinned = false where id = target_id;
    elsif chosen_action = 'restore_post' then
      update public.discussion_posts set removed_at = null, removed_by = null, removal_reason = null where id = target_id and deleted_at is null;
    elsif chosen_action = 'lock_post' then
      update public.discussion_posts set locked_at = now(), locked_by = caller where id = target_id;
    elsif chosen_action = 'unlock_post' then
      update public.discussion_posts set locked_at = null, locked_by = null where id = target_id;
    elsif chosen_action = 'pin_post' then
      update public.discussion_posts set is_pinned = true where id = target_id and removed_at is null and deleted_at is null;
    else
      update public.discussion_posts set is_pinned = false where id = target_id;
    end if;
  elsif chosen_action in ('remove_comment', 'restore_comment') then
    if target_type <> 'comment' then raise exception 'comment target required' using errcode = '23514'; end if;
    select author_id into target_author from public.discussion_comments where id = target_id and community_id = community.id for update;
    if not found then raise exception 'comment unavailable' using errcode = 'P0002'; end if;
    if chosen_action = 'remove_comment' then
      update public.discussion_comments set removed_at = now(), removed_by = caller, removal_reason = trim(submitted_reason) where id = target_id;
    else
      update public.discussion_comments set removed_at = null, removed_by = null, removal_reason = null where id = target_id and deleted_at is null;
    end if;
  elsif chosen_action in ('ban_member', 'unban_member', 'add_moderator', 'remove_moderator') then
    if target_type <> 'member' then raise exception 'member target required' using errcode = '23514'; end if;
    select * into target_member from public.discussion_memberships
    where community_id = community.id and profile_id = target_id for update;
    if target_member.profile_id is null then raise exception 'member unavailable' using errcode = 'P0002'; end if;
    if target_member.role = 'owner' then raise exception 'the owner cannot be moderated as a member' using errcode = '42501'; end if;
    if target_member.role = 'moderator' and chosen_action = 'ban_member' and not private.discussion_is_owner(community.id, caller) then
      raise exception 'only the owner can ban a moderator' using errcode = '42501';
    end if;
    if chosen_action = 'ban_member' then
      if target_member.state = 'active' then update public.discussion_communities set member_count = greatest(0, member_count - 1) where id = community.id; end if;
      update public.discussion_memberships set role = 'member', state = 'banned', banned_by = caller, banned_reason = trim(submitted_reason)
      where community_id = community.id and profile_id = target_id;
    elsif chosen_action = 'unban_member' then
      update public.discussion_memberships set role = 'member', state = 'left', banned_by = null, banned_reason = null
      where community_id = community.id and profile_id = target_id and state = 'banned';
    elsif chosen_action = 'add_moderator' then
      if target_member.state <> 'active' then raise exception 'active member required' using errcode = '23514'; end if;
      update public.discussion_memberships set role = 'moderator' where community_id = community.id and profile_id = target_id;
    else
      update public.discussion_memberships set role = 'member' where community_id = community.id and profile_id = target_id and role = 'moderator';
    end if;
    target_author := target_id;
  elsif chosen_action in ('archive', 'unarchive') then
    if target_type <> 'community' or target_id <> community.id then raise exception 'community target required' using errcode = '23514'; end if;
    update public.discussion_communities set
      status = (case when chosen_action = 'archive' then 'archived' else 'active' end)::public.discussion_community_status,
      archived_at = case when chosen_action = 'archive' then now() else null end
    where id = community.id;
  else
    raise exception 'unsupported discussion moderation action' using errcode = '23514';
  end if;
  insert into public.discussion_moderation_actions(
    campus_id, community_id, actor_id, action, target_type, target_id, reason, request_id, idempotency_key
  ) values (
    campus, community.id, caller, chosen_action, target_type, target_id, nullif(trim(coalesce(submitted_reason, '')), ''),
    submitted_request_id, submitted_key
  ) returning * into action_row;
  insert into public.audit_log(campus_id, actor_id, action, target_type, target_id, request_id, metadata)
  values(campus, caller, 'discussion.' || chosen_action, 'discussion_' || target_type, target_id::text, submitted_request_id,
    jsonb_build_object('communityId', community.id, 'reason', nullif(trim(coalesce(submitted_reason, '')), '')));
  if target_author is not null and target_author <> caller and chosen_action in (
    'remove_post', 'remove_comment', 'ban_member', 'unban_member', 'add_moderator', 'remove_moderator'
  ) then
    insert into public.outbox_events(campus_id, event_type, aggregate_id, payload, idempotency_key)
    values(campus, 'discussion.' || chosen_action, action_row.id,
      jsonb_build_object('recipientId', target_author, 'communityId', community.id, 'communitySlug', community.slug,
        'targetId', target_id), 'discussion-action:' || action_row.id);
  end if;
  return action_row;
end $$;

create or replace function public.moderate_discussion(
  target_slug text,
  chosen_action text,
  target_type text,
  target_id uuid,
  submitted_reason text,
  submitted_request_id uuid,
  submitted_key uuid
) returns public.discussion_moderation_actions language sql security invoker set search_path = '' as $$
  select private.moderate_discussion(target_slug, chosen_action, target_type, target_id, submitted_reason, submitted_request_id, submitted_key)
$$;

create or replace function private.transfer_discussion_ownership(
  target_slug text,
  new_owner uuid,
  submitted_reason text,
  submitted_request_id uuid,
  submitted_key uuid
) returns public.discussion_communities
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); community public.discussion_communities; incoming public.discussion_memberships; action_id uuid;
begin
  select * into community from public.discussion_communities
  where campus_id = public.current_campus_id() and slug = lower(target_slug) and deleted_at is null for update;
  if community.id is null or community.owner_id <> caller then raise exception 'community owner required' using errcode = '42501'; end if;
  if new_owner = caller then raise exception 'new owner must be another member' using errcode = '23514'; end if;
  select * into incoming from public.discussion_memberships
  where community_id = community.id and profile_id = new_owner and state = 'active' for update;
  if incoming.profile_id is null then raise exception 'new owner must be an active member' using errcode = '23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(community.id::text, 0));
  update public.discussion_memberships set role = 'moderator' where community_id = community.id and profile_id = caller;
  update public.discussion_memberships set role = 'owner' where community_id = community.id and profile_id = new_owner;
  update public.discussion_communities set owner_id = new_owner where id = community.id returning * into community;
  insert into public.discussion_moderation_actions(
    campus_id, community_id, actor_id, action, target_type, target_id, reason, request_id, idempotency_key,
    metadata
  ) values (
    community.campus_id, community.id, caller, 'transfer_ownership', 'member', new_owner, trim(submitted_reason),
    submitted_request_id, submitted_key, jsonb_build_object('previousOwnerId', caller)
  ) returning id into action_id;
  insert into public.audit_log(campus_id, actor_id, action, target_type, target_id, request_id, metadata)
  values(community.campus_id, caller, 'discussion.transfer_ownership', 'discussion_community', community.id::text,
    submitted_request_id, jsonb_build_object('newOwnerId', new_owner, 'reason', trim(submitted_reason)));
  insert into public.outbox_events(campus_id, event_type, aggregate_id, payload, idempotency_key)
  values(community.campus_id, 'discussion.ownership_transferred', action_id,
    jsonb_build_object('recipientId', new_owner, 'communityId', community.id, 'communitySlug', community.slug),
    'discussion-ownership:' || action_id);
  return community;
end $$;

create or replace function public.transfer_discussion_ownership(
  target_slug text,
  new_owner uuid,
  submitted_reason text,
  submitted_request_id uuid,
  submitted_key uuid
) returns public.discussion_communities language sql security invoker set search_path = '' as $$
  select private.transfer_discussion_ownership(target_slug, new_owner, submitted_reason, submitted_request_id, submitted_key)
$$;

create or replace function private.discussion_comment_outbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare recipient uuid;
begin
  if new.parent_comment_id is not null then
    select author_id into recipient from public.discussion_comments where id = new.parent_comment_id;
  else
    select author_id into recipient from public.discussion_posts where id = new.post_id;
  end if;
  if recipient is not null and recipient <> new.author_id then
    insert into public.outbox_events(campus_id, event_type, aggregate_id, payload, idempotency_key)
    values(new.campus_id,
      case when new.parent_comment_id is null then 'discussion.post_replied' else 'discussion.comment_replied' end,
      new.id,
      jsonb_build_object('recipientId', recipient, 'communityId', new.community_id, 'postId', new.post_id,
        'commentId', new.id, 'parentCommentId', new.parent_comment_id),
      'discussion-reply:' || new.id);
  end if;
  return new;
end $$;
create trigger discussion_comment_created after insert on public.discussion_comments
for each row execute function private.discussion_comment_outbox();

create or replace function public.report_snapshot() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.target_type = 'message' then
    select jsonb_build_object('messageId', m.id, 'senderId', m.sender_id, 'body', m.body, 'createdAt', m.created_at)
    into new.message_snapshot from public.messages m where m.id = new.target_id and public.is_conversation_participant(m.conversation_id);
    if new.message_snapshot is null then raise exception 'message is not reportable' using errcode = '42501'; end if;
  elsif new.target_type = 'community' then
    select jsonb_build_object('communityId', c.id, 'slug', c.slug, 'displayName', c.display_name, 'description', c.description)
    into new.content_snapshot from public.discussion_communities c
    where c.id = new.target_id and c.campus_id = public.current_campus_id();
  elsif new.target_type = 'discussion_post' then
    select jsonb_build_object('postId', p.id, 'communityId', p.community_id, 'authorId', p.author_id,
      'title', p.title, 'body', p.body, 'linkUrl', p.link_url, 'createdAt', p.created_at)
    into new.content_snapshot from public.discussion_posts p
    where p.id = new.target_id and p.campus_id = public.current_campus_id();
  elsif new.target_type = 'discussion_comment' then
    select jsonb_build_object('commentId', c.id, 'communityId', c.community_id, 'postId', c.post_id,
      'authorId', c.author_id, 'body', c.body, 'createdAt', c.created_at)
    into new.content_snapshot from public.discussion_comments c
    where c.id = new.target_id and c.campus_id = public.current_campus_id();
  end if;
  if new.target_type in ('community', 'discussion_post', 'discussion_comment') and new.content_snapshot is null then
    raise exception 'discussion content is not reportable' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.submit_report(
  submitted_type text,
  submitted_id uuid,
  submitted_reason text,
  submitted_details text,
  submitted_key uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); campus uuid := public.current_campus_id(); report_id uuid;
begin
  if campus is null then raise exception 'active membership required' using errcode = '42501'; end if;
  if submitted_type = 'listing' and not exists(select 1 from public.listings where id = submitted_id and campus_id = campus and deleted_at is null) then raise exception 'target unavailable' using errcode = 'P0002';
  elsif submitted_type = 'event' and not exists(select 1 from public.events where id = submitted_id and campus_id = campus and deleted_at is null) then raise exception 'target unavailable' using errcode = 'P0002';
  elsif submitted_type = 'profile' and not exists(select 1 from public.profiles where id = submitted_id and campus_id = campus) then raise exception 'target unavailable' using errcode = 'P0002';
  elsif submitted_type = 'message' and not exists(select 1 from public.messages where id = submitted_id and campus_id = campus and public.is_conversation_participant(conversation_id)) then raise exception 'target unavailable' using errcode = 'P0002';
  elsif submitted_type = 'community' and not exists(select 1 from public.discussion_communities where id = submitted_id and campus_id = campus and deleted_at is null) then raise exception 'target unavailable' using errcode = 'P0002';
  elsif submitted_type = 'discussion_post' and not exists(select 1 from public.discussion_posts where id = submitted_id and campus_id = campus and deleted_at is null) then raise exception 'target unavailable' using errcode = 'P0002';
  elsif submitted_type = 'discussion_comment' and not exists(select 1 from public.discussion_comments where id = submitted_id and campus_id = campus and deleted_at is null) then raise exception 'target unavailable' using errcode = 'P0002';
  elsif submitted_type not in ('listing', 'event', 'profile', 'message', 'community', 'discussion_post', 'discussion_comment') then raise exception 'unsupported target' using errcode = '23514';
  end if;
  insert into public.reports(campus_id, reporter_id, target_type, target_id, reason, details, idempotency_key)
  values(campus, caller, submitted_type, submitted_id, submitted_reason, submitted_details, submitted_key)
  on conflict(reporter_id, idempotency_key) do update set idempotency_key = excluded.idempotency_key returning id into report_id;
  return report_id;
end $$;

create or replace function private.moderate_report(target_report uuid, chosen_action text, action_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  selected public.reports;
  caller uuid := auth.uid();
  target_author uuid;
  community_slug text;
  discussion_event text;
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
  elsif chosen_action='hide_content' and selected.target_type='community' then
    update public.discussion_communities set status='archived', visibility='hidden', archived_at=coalesce(archived_at,now())
    where id=selected.target_id and campus_id=selected.campus_id and deleted_at is null
    returning owner_id, slug into target_author, community_slug;
    discussion_event := 'discussion.remove_community';
  elsif chosen_action='hide_content' and selected.target_type='discussion_post' then
    update public.discussion_posts set removed_at=coalesce(removed_at,now()), removed_by=caller,
      removal_reason=trim(action_reason), is_pinned=false
    where id=selected.target_id and campus_id=selected.campus_id and deleted_at is null
    returning author_id into target_author;
    select c.slug into community_slug from public.discussion_communities c
    where c.id=(selected.content_snapshot->>'communityId')::uuid;
    discussion_event := 'discussion.remove_post';
  elsif chosen_action='hide_content' and selected.target_type='discussion_comment' then
    update public.discussion_comments set removed_at=coalesce(removed_at,now()), removed_by=caller,
      removal_reason=trim(action_reason)
    where id=selected.target_id and campus_id=selected.campus_id and deleted_at is null
    returning author_id into target_author;
    select c.slug into community_slug from public.discussion_communities c
    where c.id=(selected.content_snapshot->>'communityId')::uuid;
    discussion_event := 'discussion.remove_comment';
  elsif chosen_action='suspend' and selected.target_type='profile' then
    update public.profiles set status='suspended' where id=selected.target_id and campus_id=selected.campus_id;
  elsif chosen_action='restore' and selected.target_type='profile' then
    update public.profiles set status='active' where id=selected.target_id and campus_id=selected.campus_id;
  end if;
  insert into public.moderation_actions(campus_id,report_id,moderator_id,subject_profile_id,action,reason)
  values(selected.campus_id,selected.id,caller,
    case when selected.target_type='profile' then selected.target_id else target_author end,chosen_action,action_reason);
  update public.reports set status=(case when chosen_action='dismiss' then 'dismissed' else 'resolved' end)::public.report_status,
    resolved_at=now(),assigned_to=caller where id=selected.id;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
  values(selected.campus_id,caller,'moderation.'||chosen_action,selected.target_type,selected.target_id::text,
    jsonb_build_object('reportId',selected.id,'reason',action_reason));
  if discussion_event is not null and target_author is not null and target_author <> caller then
    insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
    values(selected.campus_id,discussion_event,selected.id,
      jsonb_build_object('recipientId',target_author,'actorId',caller,'communityId',selected.content_snapshot->>'communityId',
        'communitySlug',community_slug,'postId',selected.content_snapshot->>'postId','targetId',selected.target_id),
      'discussion-staff-report:'||selected.id);
  end if;
end $$;

create or replace function public.moderate_report(target_report uuid, chosen_action text, action_reason text) returns void
language sql security invoker set search_path = '' as $$
  select private.moderate_report(target_report,chosen_action,action_reason)
$$;

create or replace function private.discussion_report_queue(target_slug text)
returns setof public.reports language plpgsql stable security definer set search_path = '' as $$
declare community public.discussion_communities;
begin
  select * into community from public.discussion_communities
  where campus_id = public.current_campus_id() and slug = lower(target_slug) and deleted_at is null;
  if community.id is null or not private.discussion_can_moderate(community.id) then
    raise exception 'discussion moderator access required' using errcode = '42501';
  end if;
  return query select r.* from public.reports r
  where r.campus_id = community.campus_id and r.status in ('open', 'reviewing') and (
    (r.target_type = 'community' and r.target_id = community.id)
    or (r.target_type in ('discussion_post', 'discussion_comment') and r.content_snapshot->>'communityId' = community.id::text)
  ) order by r.created_at;
end $$;

create or replace function public.discussion_report_queue(target_slug text)
returns setof public.reports language sql stable security invoker set search_path = '' as $$
  select * from private.discussion_report_queue(target_slug)
$$;

create or replace function private.delete_discussion_community(target_slug text, submitted_reason text, submitted_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare community public.discussion_communities;
begin
  select * into community from public.discussion_communities
  where campus_id = public.current_campus_id() and slug = lower(target_slug) and deleted_at is null for update;
  if community.id is null or community.owner_id <> auth.uid() then
    raise exception 'community owner required' using errcode = '42501';
  end if;
  update public.discussion_communities set status = 'deleted', visibility = 'hidden', display_name = '[deleted community]',
    description = '', rules = '', deleted_at = now(), deleted_by = auth.uid(), purge_after = now() + interval '30 days',
    archived_at = coalesce(archived_at, now()) where id = community.id;
  update public.media_uploads set status = 'deleted', deleted_at = now(), purge_after = now() + interval '30 days'
    where id in (community.icon_media_id, community.banner_media_id);
  insert into public.audit_log(campus_id, actor_id, action, target_type, target_id, request_id, metadata)
  values(community.campus_id, auth.uid(), 'discussion.community_deleted', 'discussion_community', community.id::text,
    submitted_request_id, jsonb_build_object('reason', trim(submitted_reason), 'slug', community.slug));
end $$;

create or replace function public.delete_discussion_community(target_slug text, submitted_reason text, submitted_request_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.delete_discussion_community(target_slug, submitted_reason, submitted_request_id)
$$;

alter table public.discussion_communities enable row level security;
alter table public.discussion_memberships enable row level security;
alter table public.discussion_posts enable row level security;
alter table public.discussion_comments enable row level security;
alter table public.discussion_post_votes enable row level security;
alter table public.discussion_comment_votes enable row level security;
alter table public.discussion_saved_posts enable row level security;
alter table public.discussion_moderation_actions enable row level security;

create policy discussion_communities_campus_read on public.discussion_communities for select to authenticated using (
  private.discussions_enabled() and public.is_active_student() and campus_id = public.current_campus_id()
  and (
    (deleted_at is null and visibility = 'campus_private')
    or owner_id = (select auth.uid())
    or private.discussion_can_moderate(id)
  )
);

create policy discussion_memberships_campus_read on public.discussion_memberships for select to authenticated using (
  private.discussions_enabled() and public.is_active_student() and campus_id = public.current_campus_id()
  and (
    profile_id = (select auth.uid())
    or state = 'active'
    or private.discussion_can_moderate(community_id)
  )
);

create policy discussion_posts_campus_read on public.discussion_posts for select to authenticated using (
  private.discussions_enabled() and public.is_active_student() and campus_id = public.current_campus_id()
  and exists(
    select 1 from public.discussion_communities community
    where community.id = community_id and community.campus_id = public.current_campus_id()
      and community.deleted_at is null and community.visibility = 'campus_private'
  )
);

create policy discussion_comments_campus_read on public.discussion_comments for select to authenticated using (
  private.discussions_enabled() and public.is_active_student() and campus_id = public.current_campus_id()
  and exists(
    select 1 from public.discussion_communities community
    where community.id = community_id and community.campus_id = public.current_campus_id()
      and community.deleted_at is null and community.visibility = 'campus_private'
  )
);

create policy discussion_post_votes_self_read on public.discussion_post_votes for select to authenticated using (
  profile_id = (select auth.uid()) and campus_id = public.current_campus_id()
);
create policy discussion_comment_votes_self_read on public.discussion_comment_votes for select to authenticated using (
  profile_id = (select auth.uid()) and campus_id = public.current_campus_id()
);
create policy discussion_saved_posts_self_read on public.discussion_saved_posts for select to authenticated using (
  profile_id = (select auth.uid()) and campus_id = public.current_campus_id()
);
create policy discussion_moderation_actions_mod_read on public.discussion_moderation_actions for select to authenticated using (
  campus_id = public.current_campus_id() and private.discussion_can_moderate(community_id)
);

revoke all on table public.discussion_communities from anon, authenticated;
revoke all on table public.discussion_memberships from anon, authenticated;
revoke all on table public.discussion_posts from anon, authenticated;
revoke all on table public.discussion_comments from anon, authenticated;
revoke all on table public.discussion_post_votes from anon, authenticated;
revoke all on table public.discussion_comment_votes from anon, authenticated;
revoke all on table public.discussion_saved_posts from anon, authenticated;
revoke all on table public.discussion_moderation_actions from anon, authenticated;

grant select on table public.discussion_communities to authenticated;
grant select on table public.discussion_memberships to authenticated;
grant select on table public.discussion_posts to authenticated;
grant select on table public.discussion_comments to authenticated;
grant select on table public.discussion_post_votes to authenticated;
grant select on table public.discussion_comment_votes to authenticated;
grant select on table public.discussion_saved_posts to authenticated;
grant select on table public.discussion_moderation_actions to authenticated;

grant all on table public.discussion_communities to service_role;
grant all on table public.discussion_memberships to service_role;
grant all on table public.discussion_posts to service_role;
grant all on table public.discussion_comments to service_role;
grant all on table public.discussion_post_votes to service_role;
grant all on table public.discussion_comment_votes to service_role;
grant all on table public.discussion_saved_posts to service_role;
grant all on table public.discussion_moderation_actions to service_role;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
grant execute on function private.discussions_enabled() to authenticated;
grant execute on function private.discussion_is_community_moderator(uuid,uuid) to authenticated;
grant execute on function private.discussion_can_moderate(uuid,uuid) to authenticated;
grant execute on function private.discussion_is_owner(uuid,uuid) to authenticated;
grant execute on function private.require_discussion_participant(uuid,uuid) to authenticated;
grant execute on function private.create_discussion_community(text,text,text,text,public.discussion_posting_permission,uuid) to authenticated;
grant execute on function private.set_discussion_membership(text,boolean) to authenticated;
grant execute on function private.update_discussion_community(text,text,text,text,public.discussion_posting_permission,boolean) to authenticated;
grant execute on function private.create_discussion_post(text,public.discussion_post_type,text,text,text,uuid,uuid) to authenticated;
grant execute on function private.update_discussion_post(uuid,text,text,text) to authenticated;
grant execute on function private.delete_discussion_post(uuid,text) to authenticated;
grant execute on function private.create_discussion_comment(uuid,uuid,text,uuid) to authenticated;
grant execute on function private.discussion_comment_tree(uuid,timestamptz,uuid,integer) to authenticated;
grant execute on function private.update_discussion_comment(uuid,text) to authenticated;
grant execute on function private.delete_discussion_comment(uuid,text) to authenticated;
grant execute on function private.set_discussion_vote(text,uuid,smallint) to authenticated;
grant execute on function private.set_discussion_saved(uuid,boolean) to authenticated;
grant execute on function private.attach_discussion_media(text,uuid,text) to authenticated;
grant execute on function private.moderate_discussion(text,text,text,uuid,text,uuid,uuid) to authenticated;
grant execute on function private.transfer_discussion_ownership(text,uuid,text,uuid,uuid) to authenticated;
grant execute on function private.discussion_report_queue(text) to authenticated;
grant execute on function private.delete_discussion_community(text,text,uuid) to authenticated;
grant execute on function private.moderate_report(uuid,text,text) to authenticated;

revoke execute on function public.discussions_enabled() from public, anon;
revoke execute on function public.create_discussion_community(text, text, text, text, public.discussion_posting_permission, uuid) from public, anon;
revoke execute on function public.set_discussion_membership(text, boolean) from public, anon;
revoke execute on function public.update_discussion_community(text, text, text, text, public.discussion_posting_permission, boolean) from public, anon;
revoke execute on function public.create_discussion_post(text, public.discussion_post_type, text, text, text, uuid, uuid) from public, anon;
revoke execute on function public.update_discussion_post(uuid, text, text, text) from public, anon;
revoke execute on function public.delete_discussion_post(uuid, text) from public, anon;
revoke execute on function public.create_discussion_comment(uuid, uuid, text, uuid) from public, anon;
revoke execute on function public.discussion_comment_tree(uuid,timestamptz,uuid,integer) from public, anon;
revoke execute on function public.update_discussion_comment(uuid, text) from public, anon;
revoke execute on function public.delete_discussion_comment(uuid, text) from public, anon;
revoke execute on function public.set_discussion_vote(text, uuid, smallint) from public, anon;
revoke execute on function public.set_discussion_saved(uuid, boolean) from public, anon;
revoke execute on function public.attach_discussion_media(text, uuid, text) from public, anon;
revoke execute on function public.moderate_discussion(text, text, text, uuid, text, uuid, uuid) from public, anon;
revoke execute on function public.transfer_discussion_ownership(text, uuid, text, uuid, uuid) from public, anon;
revoke execute on function public.delete_discussion_community(text, text, uuid) from public, anon;
revoke execute on function public.discussion_report_queue(text) from public, anon;
revoke execute on function public.report_snapshot() from public, anon, authenticated;
revoke execute on function public.enforce_media_target() from public, anon, authenticated;

grant execute on function public.discussions_enabled() to authenticated;
grant execute on function public.create_discussion_community(text, text, text, text, public.discussion_posting_permission, uuid) to authenticated;
grant execute on function public.set_discussion_membership(text, boolean) to authenticated;
grant execute on function public.update_discussion_community(text, text, text, text, public.discussion_posting_permission, boolean) to authenticated;
grant execute on function public.create_discussion_post(text, public.discussion_post_type, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.update_discussion_post(uuid, text, text, text) to authenticated;
grant execute on function public.delete_discussion_post(uuid, text) to authenticated;
grant execute on function public.create_discussion_comment(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.discussion_comment_tree(uuid,timestamptz,uuid,integer) to authenticated;
grant execute on function public.update_discussion_comment(uuid, text) to authenticated;
grant execute on function public.delete_discussion_comment(uuid, text) to authenticated;
grant execute on function public.set_discussion_vote(text, uuid, smallint) to authenticated;
grant execute on function public.set_discussion_saved(uuid, boolean) to authenticated;
grant execute on function public.attach_discussion_media(text, uuid, text) to authenticated;
grant execute on function public.moderate_discussion(text, text, text, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.transfer_discussion_ownership(text, uuid, text, uuid, uuid) to authenticated;
grant execute on function public.delete_discussion_community(text, text, uuid) to authenticated;
grant execute on function public.discussion_report_queue(text) to authenticated;

grant usage on type public.discussion_community_status to authenticated, service_role;
grant usage on type public.discussion_visibility to authenticated, service_role;
grant usage on type public.discussion_membership_role to authenticated, service_role;
grant usage on type public.discussion_membership_state to authenticated, service_role;
grant usage on type public.discussion_post_type to authenticated, service_role;
grant usage on type public.discussion_posting_permission to authenticated, service_role;

notify pgrst, 'reload schema';
