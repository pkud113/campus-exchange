-- Campus Exchange V1 product-alignment correction.
-- Profiles use field-level privacy, organizations are permissioned workspaces,
-- and trust & safety uses scoped cases. Public tables are read-only through
-- RLS; privileged mutations remain narrow, authenticated RPCs.

-- ---------------------------------------------------------------------------
-- Profile privacy and safe social projections
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column academic_field_visible boolean not null default true,
  add column friend_list_visibility public.profile_visibility not null default 'friends',
  add column organization_membership_visibility public.profile_visibility not null default 'campus_only',
  add column activity_visibility public.profile_visibility not null default 'campus_only',
  add column restricted_until timestamptz,
  add column restriction_reason text check (restriction_reason is null or char_length(restriction_reason) between 3 and 1000);

grant update (
  display_name,bio,academic_field,graduation_year,graduation_year_visible,
  academic_field_visible,interests,profile_visibility,friend_list_visibility,
  organization_membership_visibility,activity_visibility
) on public.profiles to authenticated;

-- Supabase's default table privileges are broader than this self-service table
-- requires. Preserve the existing RLS workflow while making grants explicit.
revoke all on public.notification_preferences from anon,authenticated;
grant select,insert,update on public.notification_preferences to authenticated;

create or replace function private.profile_field_visible(
  target_profile uuid,
  target_campus uuid,
  chosen_visibility public.profile_visibility
) returns boolean
language sql stable security definer set search_path='' as $$
  select target_profile=(select auth.uid())
    or (chosen_visibility='campus_only' and target_campus=public.current_campus_id())
    or (chosen_visibility='network' and (target_campus=public.current_campus_id() or private.network_features_enabled()))
    or (chosen_visibility='friends' and private.are_friends((select auth.uid()),target_profile))
$$;

create or replace function private.profile_friend_count(target_profile uuid) returns integer
language sql stable security definer set search_path='' as $$
  select count(*)::integer from public.friend_relationships f
  where f.status='accepted' and target_profile in (f.profile_low_id,f.profile_high_id)
$$;

create or replace function private.profile_mutual_friend_count(target_profile uuid) returns integer
language sql stable security definer set search_path='' as $$
  with viewer_friends as (
    select case when profile_low_id=(select auth.uid()) then profile_high_id else profile_low_id end id
    from public.friend_relationships where status='accepted' and (select auth.uid()) in (profile_low_id,profile_high_id)
  ), target_friends as (
    select case when profile_low_id=target_profile then profile_high_id else profile_low_id end id
    from public.friend_relationships where status='accepted' and target_profile in (profile_low_id,profile_high_id)
  )
  select count(*)::integer from viewer_friends v join target_friends t using(id)
  where not private.block_exists((select auth.uid()),v.id)
$$;

drop function public.safe_profile_by_username(text);
drop function private.safe_profile_by_username(text);
create function private.safe_profile_by_username(target_username text) returns table(
  id uuid,handle text,display_name text,bio text,academic_field text,graduation_year smallint,interests text[],profile_visibility public.profile_visibility,
  avatar_media_id uuid,banner_media_id uuid,campus_id uuid,campus_name text,campus_short_name text,campus_slug text,joined_month date,same_campus boolean,
  verified_student boolean,post_count integer,friend_count integer,organization_count integer,listing_count integer,event_count integer,
  mutual_friend_count integer,relationship_status text,relationship_requested_by uuid,friend_list_visible boolean,organization_memberships_visible boolean,activity_visible boolean
)
language sql stable security definer set search_path='' as $$
  select p.id,p.handle::text,p.display_name,p.bio,
    case when p.academic_field_visible or p.id=(select auth.uid()) then p.academic_field end,
    case when p.graduation_year_visible or p.id=(select auth.uid()) then p.graduation_year end,
    p.interests,p.profile_visibility,p.avatar_media_id,p.banner_media_id,p.campus_id,c.name,c.short_name,c.slug::text,
    date_trunc('month',p.created_at)::date,(p.campus_id=public.current_campus_id()),
    (p.status='active' and p.verified_until>now()),
    case when private.profile_field_visible(p.id,p.campus_id,p.activity_visibility) then
      (select count(*)::integer from public.social_posts sp where sp.author_profile_id=p.id and sp.organization_id is null and sp.status='active' and private.can_read_social_post(sp.id)) else 0 end,
    case when private.profile_field_visible(p.id,p.campus_id,p.friend_list_visibility) then private.profile_friend_count(p.id) else 0 end,
    case when private.profile_field_visible(p.id,p.campus_id,p.organization_membership_visibility) then
      (select count(*)::integer from public.organization_memberships om where om.profile_id=p.id and om.status='active' and private.can_read_organization(om.organization_id)) else 0 end,
    case when private.profile_field_visible(p.id,p.campus_id,p.activity_visibility) then
      (select count(*)::integer from public.listings l where l.seller_id=p.id and l.deleted_at is null and (p.id=(select auth.uid()) or l.status='active') and private.content_is_visible(l.campus_id,l.visibility)) else 0 end,
    case when private.profile_field_visible(p.id,p.campus_id,p.activity_visibility) then
      (select count(*)::integer from public.events e where e.organizer_id=p.id and e.deleted_at is null and private.content_is_visible(e.campus_id,e.visibility)) else 0 end,
    private.profile_mutual_friend_count(p.id),
    coalesce((select f.status::text from public.friend_relationships f where f.profile_low_id=least(p.id,(select auth.uid())) and f.profile_high_id=greatest(p.id,(select auth.uid()))),'none'),
    (select f.requested_by from public.friend_relationships f where f.profile_low_id=least(p.id,(select auth.uid())) and f.profile_high_id=greatest(p.id,(select auth.uid()))),
    private.profile_field_visible(p.id,p.campus_id,p.friend_list_visibility),
    private.profile_field_visible(p.id,p.campus_id,p.organization_membership_visibility),
    private.profile_field_visible(p.id,p.campus_id,p.activity_visibility)
  from public.profiles p join public.campuses c on c.id=p.campus_id
  where lower(p.handle::text)=lower(target_username) and private.active_member(p.id) and private.active_member((select auth.uid()))
    and not private.block_exists((select auth.uid()),p.id)
    and private.profile_field_visible(p.id,p.campus_id,p.profile_visibility)
$$;

create function public.safe_profile_by_username(target_username text) returns table(
  id uuid,handle text,display_name text,bio text,academic_field text,graduation_year smallint,interests text[],profile_visibility public.profile_visibility,
  avatar_media_id uuid,banner_media_id uuid,campus_id uuid,campus_name text,campus_short_name text,campus_slug text,joined_month date,same_campus boolean,
  verified_student boolean,post_count integer,friend_count integer,organization_count integer,listing_count integer,event_count integer,
  mutual_friend_count integer,relationship_status text,relationship_requested_by uuid,friend_list_visible boolean,organization_memberships_visible boolean,activity_visible boolean
)
language sql stable security invoker set search_path='' as $$ select * from private.safe_profile_by_username(target_username) $$;

drop function public.search_member_directory(text,text,integer);
drop function private.search_member_directory(text,text,integer);
create function private.search_member_directory(search_term text,campus_filter text,result_limit integer)
returns table(id uuid,handle text,display_name text,avatar_media_id uuid,campus_id uuid,campus_name text,campus_short_name text,campus_slug text,joined_month date,relationship_status text,relationship_requested_by uuid,mutual_friend_count integer)
language sql stable security definer set search_path='' as $$
  select p.id,p.handle::text,p.display_name,p.avatar_media_id,p.campus_id,c.name,c.short_name,c.slug::text,date_trunc('month',p.created_at)::date,
    case when p.id=(select auth.uid()) then 'self' else coalesce(f.status::text,'none') end,
    f.requested_by,private.profile_mutual_friend_count(p.id)
  from public.profiles p join public.campuses c on c.id=p.campus_id
  left join public.friend_relationships f on f.profile_low_id=least(p.id,(select auth.uid())) and f.profile_high_id=greatest(p.id,(select auth.uid()))
  where private.active_member((select auth.uid())) and private.active_member(p.id) and not private.block_exists((select auth.uid()),p.id)
    and (campus_filter is null or c.slug::text=campus_filter)
    and (p.handle::text ilike '%'||search_term||'%' or coalesce(p.display_name,'') ilike '%'||search_term||'%')
    and private.profile_field_visible(p.id,p.campus_id,p.profile_visibility)
  order by (p.campus_id=public.current_campus_id()) desc,coalesce(p.display_name,p.handle::text),p.id
  limit least(greatest(result_limit,1),50)
$$;
create function public.search_member_directory(search_term text,campus_filter text default null,result_limit integer default 20)
returns table(id uuid,handle text,display_name text,avatar_media_id uuid,campus_id uuid,campus_name text,campus_short_name text,campus_slug text,joined_month date,relationship_status text,relationship_requested_by uuid,mutual_friend_count integer)
language sql stable security invoker set search_path='' as $$ select * from private.search_member_directory(search_term,campus_filter,result_limit) $$;

create or replace function public.profile_organization_memberships(target_profile uuid)
returns table(id uuid,slug text,name text,avatar_media_id uuid,role public.organization_role,member_count integer,joined_at timestamptz)
language sql stable security definer set search_path='' as $$
  select o.id,o.slug::text,o.name,o.avatar_media_id,m.role,o.member_count,m.joined_at
  from public.profiles p
  join public.organization_memberships m on m.profile_id=p.id and m.status='active'
  join public.organizations o on o.id=m.organization_id
  where p.id=target_profile and private.active_member((select auth.uid()))
    and not private.block_exists((select auth.uid()),p.id)
    and private.profile_field_visible(p.id,p.campus_id,p.organization_membership_visibility)
    and private.can_read_organization(o.id)
  order by m.joined_at desc,o.id desc limit 100
$$;

-- ---------------------------------------------------------------------------
-- Organization workspace model and deterministic permission resolution
-- ---------------------------------------------------------------------------

create or replace function private.organization_role_rank(target_role public.organization_role) returns smallint
language sql immutable security invoker set search_path='' as $$
  -- Membership mutations remain administrator/owner-only (rank >= 2).
  -- Fine-grained moderator/officer capabilities are resolved through the
  -- permission tables below rather than widening this legacy gate.
  select case target_role when 'member' then 0 when 'officer' then 1 when 'moderator' then 1 when 'administrator' then 2 when 'owner' then 3 end::smallint
$$;

alter table public.organizations
  add column organization_type text not null default 'student_organization' check (organization_type in ('student_organization','department','residence','study_group','other')),
  add column rules text not null default '' check (char_length(rules) <= 10000),
  add column external_links jsonb not null default '[]'::jsonb check (jsonb_typeof(external_links)='array'),
  add column is_read_only boolean not null default false,
  add column restriction_reason text check (restriction_reason is null or char_length(restriction_reason) between 3 and 1000);

alter table public.organization_memberships add column id uuid not null default gen_random_uuid();
alter table public.organization_memberships add constraint organization_memberships_id_key unique(id);

create table public.organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  builtin_key public.organization_role,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#476657' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_position smallint not null default 0,
  authority_rank smallint not null check (authority_rank between 0 and 100),
  permissions text[] not null default '{}',
  is_assignable boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name),
  unique (organization_id,builtin_key)
);

create table public.organization_role_assignments (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id uuid not null references public.organization_roles(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (role_id,profile_id),
  unique (organization_id,role_id,profile_id)
);

create table public.organization_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  sort_position smallint not null default 0,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name)
);

create table public.organization_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.organization_categories(id) on delete set null,
  name extensions.citext not null,
  description text not null default '' check (char_length(description) <= 500),
  channel_type text not null default 'text' check (channel_type in ('text','announcement')),
  visibility text not null default 'standard' check (visibility in ('standard','restricted')),
  sort_position smallint not null default 0,
  slow_mode_seconds integer not null default 0 check (slow_mode_seconds between 0 and 21600),
  status text not null default 'active' check (status in ('active','read_only','removed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name)
);

create table public.organization_channel_role_overrides (
  channel_id uuid not null references public.organization_channels(id) on delete cascade,
  role_id uuid not null references public.organization_roles(id) on delete cascade,
  view_channel boolean,
  send_messages boolean,
  manage_messages boolean,
  create_announcements boolean,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (channel_id,role_id)
);

create table public.organization_channel_member_overrides (
  channel_id uuid not null references public.organization_channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  view_channel boolean,
  send_messages boolean,
  manage_messages boolean,
  create_announcements boolean,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  primary key (channel_id,profile_id)
);

create table public.organization_channel_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.organization_channels(id) on delete cascade,
  author_profile_id uuid references public.profiles(id) on delete set null,
  parent_message_id uuid references public.organization_channel_messages(id) on delete set null,
  body text check (body is null or char_length(body) between 1 and 4000),
  idempotency_key uuid not null,
  edited_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id),
  moderation_reason text check (moderation_reason is null or char_length(moderation_reason) between 3 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_profile_id,idempotency_key),
  check (body is not null or deleted_at is not null)
);

create table public.organization_channel_reads (
  channel_id uuid not null references public.organization_channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(channel_id,profile_id)
);

create table public.organization_audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 3 and 100),
  target_type text not null,
  target_id text not null,
  reason text check (reason is null or char_length(reason) between 3 and 1000),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.organization_notification_preferences (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  announcements boolean not null default true,
  mentions boolean not null default true,
  membership_changes boolean not null default false,
  muted_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id,profile_id)
);

create index organization_roles_org_rank_idx on public.organization_roles(organization_id,authority_rank desc,sort_position);
create index organization_role_assignments_member_idx on public.organization_role_assignments(organization_id,profile_id);
create index organization_categories_order_idx on public.organization_categories(organization_id,sort_position,id);
create index organization_channels_order_idx on public.organization_channels(organization_id,category_id,sort_position,id) where status<>'removed';
create index organization_messages_page_idx on public.organization_channel_messages(channel_id,created_at desc,id desc) where deleted_at is null;
create index organization_channel_reads_profile_idx on public.organization_channel_reads(profile_id,updated_at desc);
create index organization_audit_page_idx on public.organization_audit_events(organization_id,created_at desc,id desc);

create trigger organization_roles_touch before update on public.organization_roles for each row execute function public.touch_updated_at();
create trigger organization_categories_touch before update on public.organization_categories for each row execute function public.touch_updated_at();
create trigger organization_channels_touch before update on public.organization_channels for each row execute function public.touch_updated_at();
create trigger organization_messages_touch before update on public.organization_channel_messages for each row execute function public.touch_updated_at();
create trigger organization_channel_reads_touch before update on public.organization_channel_reads for each row execute function public.touch_updated_at();

create or replace function private.seed_organization_workspace(target_organization uuid,target_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
declare information_id uuid; general_id uuid;
begin
  insert into public.organization_roles(organization_id,builtin_key,name,color,sort_position,authority_rank,permissions,is_assignable,created_by) values
    (target_organization,'owner','Owner','#D49B35',0,100,array['view_organization','view_channels','send_messages','manage_messages','create_announcements','manage_channels','manage_roles','assign_roles','invite_members','approve_membership_requests','remove_members','ban_members','manage_organization_profile','create_organization_events','create_organization_posts','view_audit_log','transfer_ownership'],false,target_owner),
    (target_organization,'administrator','Administrator','#C05A47',10,80,array['view_organization','view_channels','send_messages','manage_messages','create_announcements','manage_channels','manage_roles','assign_roles','invite_members','approve_membership_requests','remove_members','ban_members','manage_organization_profile','create_organization_events','create_organization_posts','view_audit_log'],true,target_owner),
    (target_organization,'moderator','Moderator','#7357A8',20,60,array['view_organization','view_channels','send_messages','manage_messages','create_announcements','remove_members','create_organization_posts','view_audit_log'],true,target_owner),
    (target_organization,'officer','Officer','#3D738A',30,40,array['view_organization','view_channels','send_messages','create_announcements','invite_members','create_organization_events','create_organization_posts'],true,target_owner),
    (target_organization,'member','Member','#476657',40,10,array['view_organization','view_channels','send_messages'],true,target_owner)
  on conflict (organization_id,builtin_key) do nothing;

  insert into public.organization_categories(organization_id,name,sort_position,created_by)
  values(target_organization,'INFORMATION',0,target_owner) on conflict(organization_id,name) do update set name=excluded.name returning id into information_id;
  insert into public.organization_categories(organization_id,name,sort_position,created_by)
  values(target_organization,'GENERAL',10,target_owner) on conflict(organization_id,name) do update set name=excluded.name returning id into general_id;
  insert into public.organization_channels(organization_id,category_id,name,description,channel_type,visibility,sort_position,created_by) values
    (target_organization,information_id,'announcements','Official organization updates.','announcement','standard',0,target_owner),
    (target_organization,information_id,'rules','Organization rules and member guidance.','announcement','standard',10,target_owner),
    (target_organization,general_id,'general','General member conversation.','text','standard',0,target_owner),
    (target_organization,general_id,'introductions','Introduce yourself to the workspace.','text','standard',10,target_owner)
  on conflict(organization_id,name) do nothing;
end $$;

create or replace function private.organizations_seed_workspace() returns trigger
language plpgsql security definer set search_path='' as $$ begin perform private.seed_organization_workspace(new.id,new.created_by); return new; end $$;
create trigger organizations_seed_workspace after insert on public.organizations for each row execute function private.organizations_seed_workspace();

do $$ declare row record; begin
  for row in select id,created_by from public.organizations loop perform private.seed_organization_workspace(row.id,row.created_by); end loop;
end $$;

insert into public.organization_role_assignments(organization_id,role_id,profile_id,assigned_by)
select m.organization_id,r.id,m.profile_id,o.created_by
from public.organization_memberships m
join public.organization_roles r on r.organization_id=m.organization_id and r.builtin_key=m.role
join public.organizations o on o.id=m.organization_id
where m.status='active' on conflict do nothing;

create or replace function private.sync_organization_builtin_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.organization_role_assignments where organization_id=new.organization_id and profile_id=new.profile_id
    and role_id in (select id from public.organization_roles where organization_id=new.organization_id and builtin_key is not null);
  if new.status='active' then
    insert into public.organization_role_assignments(organization_id,role_id,profile_id,assigned_by)
    select new.organization_id,id,new.profile_id,coalesce(new.invited_by,new.profile_id)
    from public.organization_roles where organization_id=new.organization_id and builtin_key=new.role;
    insert into public.organization_notification_preferences(organization_id,profile_id) values(new.organization_id,new.profile_id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger organization_memberships_sync_role after insert or update of role,status on public.organization_memberships
for each row execute function private.sync_organization_builtin_role();

create or replace function private.organization_has_permission(target_organization uuid,permission_name text,actor uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select private.active_member(actor) and exists(
    select 1 from public.organization_memberships m
    where m.organization_id=target_organization and m.profile_id=actor and m.status='active' and (
      m.role='owner' or exists(
        select 1 from public.organization_role_assignments a join public.organization_roles r on r.id=a.role_id
        where a.organization_id=target_organization and a.profile_id=actor and permission_name=any(r.permissions)
      )
    )
  ) and exists(select 1 from public.organizations o where o.id=target_organization and o.status='active')
$$;

create or replace function public.organization_member_directory(target_organization uuid)
returns table(profile_id uuid,handle text,display_name text,avatar_media_id uuid,role public.organization_role,joined_at timestamptz)
language sql stable security definer set search_path='' as $$
  select p.id,p.handle::text,p.display_name,p.avatar_media_id,m.role,m.joined_at
  from public.organization_memberships m join public.profiles p on p.id=m.profile_id
  where m.organization_id=target_organization and m.status='active'
    and private.organization_has_permission(target_organization,'view_organization')
    and private.active_member(p.id) and not private.block_exists((select auth.uid()),p.id)
  order by private.organization_role_rank(m.role) desc,coalesce(p.display_name,p.handle::text),p.id limit 500
$$;

create or replace function private.organization_channel_permission(target_channel uuid,permission_name text,actor uuid default auth.uid()) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare channel_row public.organization_channels; member_row public.organization_memberships; override_permission text:=permission_name; base_permission text:=permission_name; member_value boolean; role_denied boolean; role_allowed boolean; base_allowed boolean;
begin
  if not private.active_member(actor) then return false; end if;
  select c.* into channel_row from public.organization_channels c join public.organizations o on o.id=c.organization_id
    where c.id=target_channel and c.status<>'removed' and o.status='active';
  if channel_row.id is null then return false; end if;
  select * into member_row from public.organization_memberships where organization_id=channel_row.organization_id and profile_id=actor;
  if member_row.status<>'active' then return false; end if;
  if permission_name='view_channel' then base_permission:='view_channels'; end if;
  if permission_name='send_messages' and channel_row.channel_type='announcement' then override_permission:='create_announcements'; base_permission:='create_announcements'; end if;
  if channel_row.status='read_only' or (select is_read_only from public.organizations where id=channel_row.organization_id) then
    if override_permission in ('send_messages','create_announcements') then return false; end if;
  end if;
  if member_row.role='owner' then return true; end if;

  execute format('select %I from public.organization_channel_member_overrides where channel_id=$1 and profile_id=$2',override_permission)
    into member_value using target_channel,actor;
  if member_value is not null then return member_value; end if;

  execute format('select coalesce(bool_or(o.%1$I=false),false),coalesce(bool_or(o.%1$I=true),false) from public.organization_channel_role_overrides o join public.organization_role_assignments a on a.role_id=o.role_id and a.organization_id=$2 where o.channel_id=$1 and a.profile_id=$3',override_permission)
    into role_denied,role_allowed using target_channel,channel_row.organization_id,actor;
  if role_denied then return false; end if;
  if role_allowed then return true; end if;
  if channel_row.visibility='restricted' and override_permission='view_channel' then return false; end if;
  select exists(
    select 1 from public.organization_role_assignments a join public.organization_roles r on r.id=a.role_id
    where a.organization_id=channel_row.organization_id and a.profile_id=actor and base_permission=any(r.permissions)
  ) into base_allowed;
  return base_allowed;
end $$;

create or replace function private.organization_category_visible(target_category uuid,actor uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organization_channels c where c.category_id=target_category and private.organization_channel_permission(c.id,'view_channel',actor))
$$;

create or replace function public.organization_channel_capabilities(target_organization uuid)
returns table(channel_id uuid,can_view boolean,can_send boolean,can_manage_messages boolean,can_create_announcements boolean)
language sql stable security definer set search_path='' as $$
  select c.id,true,private.organization_channel_permission(c.id,'send_messages'),private.organization_channel_permission(c.id,'manage_messages'),private.organization_channel_permission(c.id,'create_announcements')
  from public.organization_channels c
  where c.organization_id=target_organization and private.organization_channel_permission(c.id,'view_channel')
$$;

create or replace function private.can_read_organization(target_organization uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.active_member((select auth.uid())) and exists(
    select 1 from public.organizations o where o.id=target_organization and o.status='active'
      and (private.content_is_visible(o.campus_id,o.visibility) or exists(
        select 1 from public.organization_memberships m where m.organization_id=o.id and m.profile_id=(select auth.uid()) and m.status in ('invited','pending','active')
      ))
  )
$$;

create or replace function public.create_organization_channel(
  target_organization uuid,target_category uuid,submitted_name text,submitted_description text,
  submitted_type text,submitted_visibility text,submitted_slow_mode integer,request_key uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); created_id uuid;
begin
  if not private.organization_has_permission(target_organization,'manage_channels',caller) then raise exception 'channel management permission required' using errcode='42501'; end if;
  if target_category is not null and not exists(select 1 from public.organization_categories where id=target_category and organization_id=target_organization) then raise exception 'category unavailable' using errcode='P0002'; end if;
  insert into public.organization_channels(organization_id,category_id,name,description,channel_type,visibility,slow_mode_seconds,created_by)
  values(target_organization,target_category,lower(trim(submitted_name)),trim(submitted_description),submitted_type,submitted_visibility,submitted_slow_mode,caller)
  returning id into created_id;
  insert into public.organization_audit_events(organization_id,actor_profile_id,action,target_type,target_id,metadata)
  values(target_organization,caller,'organization.channel.created','channel',created_id::text,jsonb_build_object('requestKey',request_key));
  return created_id;
end $$;

create or replace function public.create_organization_category(
  target_organization uuid,submitted_name text,submitted_position integer,request_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); created_id uuid;
begin
  if not private.organization_has_permission(target_organization,'manage_channels',caller) then raise exception 'channel management permission required' using errcode='42501'; end if;
  insert into public.organization_categories(organization_id,name,sort_position,created_by)
  values(target_organization,upper(trim(submitted_name)),submitted_position::smallint,caller) returning id into created_id;
  insert into public.organization_audit_events(organization_id,actor_profile_id,action,target_type,target_id,metadata)
  values(target_organization,caller,'organization.category.created','category',created_id::text,jsonb_build_object('requestKey',request_key));
  return created_id;
end $$;

create or replace function public.organization_membership_queue(target_organization uuid)
returns table(id uuid,profile_id uuid,handle text,display_name text,avatar_media_id uuid,role public.organization_role,status public.organization_membership_status,joined_at timestamptz)
language sql stable security definer set search_path='' as $$
  select m.id,p.id,p.handle::text,p.display_name,p.avatar_media_id,m.role,m.status,m.joined_at
  from public.organization_memberships m join public.profiles p on p.id=m.profile_id
  where m.organization_id=target_organization
    and private.organization_has_permission(target_organization,'approve_membership_requests')
    and private.active_member((select auth.uid()))
  order by case m.status when 'pending' then 0 when 'invited' then 1 when 'active' then 2 when 'banned' then 3 else 4 end,
    coalesce(p.display_name,p.handle::text),p.id
  limit 1000
$$;

create or replace function public.set_organization_channel_role_override(
  target_channel uuid,target_role uuid,allow_view boolean,allow_send boolean,allow_manage boolean,allow_announcements boolean
) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); org_id uuid; actor_rank smallint; role_rank smallint;
begin
  select organization_id into org_id from public.organization_channels where id=target_channel;
  if org_id is null or not private.organization_has_permission(org_id,'manage_channels',caller) then raise exception 'channel management permission required' using errcode='42501'; end if;
  if not exists(select 1 from public.organization_roles where id=target_role and organization_id=org_id and (builtin_key is null or builtin_key<>'owner')) then raise exception 'role unavailable' using errcode='P0002'; end if;
  select coalesce(max(r.authority_rank),0) into actor_rank from public.organization_role_assignments a join public.organization_roles r on r.id=a.role_id where a.organization_id=org_id and a.profile_id=caller;
  select authority_rank into role_rank from public.organization_roles where id=target_role;
  if role_rank>=actor_rank then raise exception 'role override would exceed actor authority' using errcode='42501'; end if;
  if allow_view is null and allow_send is null and allow_manage is null and allow_announcements is null then
    delete from public.organization_channel_role_overrides where channel_id=target_channel and role_id=target_role;
  else
    insert into public.organization_channel_role_overrides(channel_id,role_id,view_channel,send_messages,manage_messages,create_announcements,updated_by)
    values(target_channel,target_role,allow_view,allow_send,allow_manage,allow_announcements,caller)
    on conflict(channel_id,role_id) do update set view_channel=excluded.view_channel,send_messages=excluded.send_messages,manage_messages=excluded.manage_messages,create_announcements=excluded.create_announcements,updated_by=caller,updated_at=now();
  end if;
  update public.organization_channels set updated_at=now() where id=target_channel;
  insert into public.organization_audit_events(organization_id,actor_profile_id,action,target_type,target_id,metadata)
  values(org_id,caller,'organization.channel.permission_changed','channel',target_channel::text,jsonb_build_object('roleId',target_role,'view',allow_view,'send',allow_send,'manage',allow_manage,'announcements',allow_announcements));
end $$;

create or replace function public.send_organization_channel_message(target_channel uuid,parent_message uuid,submitted_body text,request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); channel_row public.organization_channels; message_id uuid; last_created timestamptz;
begin
  if not private.organization_channel_permission(target_channel,'view_channel',caller) or not private.organization_channel_permission(target_channel,'send_messages',caller) then raise exception 'message permission required' using errcode='42501'; end if;
  select * into channel_row from public.organization_channels where id=target_channel;
  if parent_message is not null and not exists(select 1 from public.organization_channel_messages where id=parent_message and channel_id=target_channel and deleted_at is null) then raise exception 'parent message unavailable' using errcode='P0002'; end if;
  select max(created_at) into last_created from public.organization_channel_messages where channel_id=target_channel and author_profile_id=caller;
  if channel_row.slow_mode_seconds>0 and last_created is not null and last_created + make_interval(secs=>channel_row.slow_mode_seconds)>now() then raise exception 'channel slow mode is active' using errcode='55000'; end if;
  insert into public.organization_channel_messages(organization_id,channel_id,author_profile_id,parent_message_id,body,idempotency_key)
  values(channel_row.organization_id,target_channel,caller,parent_message,trim(submitted_body),request_key)
  on conflict(author_profile_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into message_id;
  return message_id;
end $$;

create or replace function public.manage_organization_channel_message(target_message uuid,chosen_action text,submitted_body text,action_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); selected public.organization_channel_messages; can_manage boolean;
begin
  select * into selected from public.organization_channel_messages where id=target_message for update;
  if selected.id is null or not private.organization_channel_permission(selected.channel_id,'view_channel',caller) then raise exception 'message unavailable' using errcode='P0002'; end if;
  can_manage:=private.organization_channel_permission(selected.channel_id,'manage_messages',caller);
  if chosen_action='edit' then
    if selected.author_profile_id<>caller or selected.deleted_at is not null then raise exception 'message edit unavailable' using errcode='42501'; end if;
    update public.organization_channel_messages set body=trim(submitted_body),edited_at=now() where id=target_message;
  elsif chosen_action='delete' then
    if selected.author_profile_id<>caller and not can_manage then raise exception 'message delete unavailable' using errcode='42501'; end if;
    if can_manage and selected.author_profile_id<>caller and char_length(trim(action_reason))<3 then raise exception 'moderation reason required' using errcode='23514'; end if;
    update public.organization_channel_messages set body=null,deleted_at=now(),deleted_by=caller,moderation_reason=nullif(trim(action_reason),'') where id=target_message;
    if can_manage and selected.author_profile_id<>caller then
      insert into public.organization_audit_events(organization_id,actor_profile_id,action,target_type,target_id,reason)
      values(selected.organization_id,caller,'organization.message.moderated','channel_message',target_message::text,trim(action_reason));
    end if;
  else raise exception 'unsupported message action' using errcode='23514'; end if;
end $$;

create or replace function public.mark_organization_channel_read(target_channel uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.organization_channel_permission(target_channel,'view_channel') then raise exception 'channel unavailable' using errcode='P0002'; end if;
  insert into public.organization_channel_reads(channel_id,profile_id,last_read_at)
  values(target_channel,(select auth.uid()),now())
  on conflict(channel_id,profile_id) do update set last_read_at=excluded.last_read_at;
end $$;

create or replace function public.assign_organization_role(target_organization uuid,target_role uuid,target_profile uuid,chosen_action text,action_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); actor_rank smallint; role_rank smallint; target_max smallint; selected_role public.organization_roles;
begin
  if not private.organization_has_permission(target_organization,'assign_roles',caller) then raise exception 'role assignment permission required' using errcode='42501'; end if;
  select max(r.authority_rank) into actor_rank from public.organization_role_assignments a join public.organization_roles r on r.id=a.role_id where a.organization_id=target_organization and a.profile_id=caller;
  select * into selected_role from public.organization_roles where id=target_role and organization_id=target_organization;
  role_rank:=selected_role.authority_rank;
  select coalesce(max(r.authority_rank),0) into target_max from public.organization_role_assignments a join public.organization_roles r on r.id=a.role_id where a.organization_id=target_organization and a.profile_id=target_profile;
  if caller=target_profile or selected_role.id is null or selected_role.builtin_key='owner' or not selected_role.is_assignable or role_rank>=actor_rank or target_max>=actor_rank then raise exception 'role assignment would escalate authority' using errcode='42501'; end if;
  if not exists(select 1 from public.organization_memberships where organization_id=target_organization and profile_id=target_profile and status='active') then raise exception 'active member required' using errcode='P0002'; end if;
  if chosen_action='assign' then insert into public.organization_role_assignments(organization_id,role_id,profile_id,assigned_by) values(target_organization,target_role,target_profile,caller) on conflict do nothing;
  elsif chosen_action='remove' then delete from public.organization_role_assignments where organization_id=target_organization and role_id=target_role and profile_id=target_profile;
  else raise exception 'unsupported role action' using errcode='23514'; end if;
  insert into public.organization_audit_events(organization_id,actor_profile_id,action,target_type,target_id,reason,metadata)
  values(target_organization,caller,'organization.role.'||chosen_action,'member',target_profile::text,trim(action_reason),jsonb_build_object('roleId',target_role));
end $$;

create or replace function public.organization_viewer_capabilities(target_organization uuid)
returns table(can_manage_roles boolean,can_assign_roles boolean,can_manage_channels boolean,can_view_audit boolean)
language sql stable security definer set search_path='' as $$
  select private.organization_has_permission(target_organization,'manage_roles'),
    private.organization_has_permission(target_organization,'assign_roles'),
    private.organization_has_permission(target_organization,'manage_channels'),
    private.organization_has_permission(target_organization,'view_audit_log')
$$;

create or replace function public.manage_organization_role(
  target_organization uuid,target_role uuid,chosen_action text,submitted_name text,submitted_color text,
  submitted_position integer,submitted_rank integer,submitted_permissions text[]
) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); actor_rank smallint; selected public.organization_roles; result_id uuid; normalized_permissions text[];
begin
  if not private.organization_has_permission(target_organization,'manage_roles',caller) then raise exception 'role management permission required' using errcode='42501'; end if;
  select coalesce(max(r.authority_rank),0) into actor_rank from public.organization_role_assignments a join public.organization_roles r on r.id=a.role_id where a.organization_id=target_organization and a.profile_id=caller;
  if chosen_action in ('create','update') then
    normalized_permissions:=array(select distinct permission from unnest(coalesce(submitted_permissions,'{}'::text[])) permission order by permission);
    if not normalized_permissions <@ array['view_organization','view_channels','send_messages','manage_messages','create_announcements','manage_channels','manage_roles','assign_roles','invite_members','approve_membership_requests','remove_members','ban_members','manage_organization_profile','create_organization_events','create_organization_posts','view_audit_log']::text[] then raise exception 'unsupported organization permission' using errcode='23514'; end if;
    if exists(select 1 from unnest(normalized_permissions) permission where not private.organization_has_permission(target_organization,permission,caller)) then raise exception 'role permissions exceed actor authority' using errcode='42501'; end if;
    if submitted_rank is null or submitted_rank<1 or submitted_rank>=actor_rank then raise exception 'role authority exceeds actor authority' using errcode='42501'; end if;
    if submitted_position is null or submitted_position<0 or submitted_position>32767 then raise exception 'invalid role position' using errcode='23514'; end if;
    if submitted_name is null or char_length(trim(submitted_name)) not between 1 and 40 or submitted_color is null or submitted_color!~'^#[0-9A-Fa-f]{6}$' then raise exception 'invalid role presentation' using errcode='23514'; end if;
  end if;
  if chosen_action='create' then
    insert into public.organization_roles(organization_id,name,color,sort_position,authority_rank,permissions,is_assignable,created_by)
    values(target_organization,trim(submitted_name),upper(submitted_color),submitted_position::smallint,submitted_rank::smallint,normalized_permissions,true,caller) returning id into result_id;
  else
    select * into selected from public.organization_roles where id=target_role and organization_id=target_organization for update;
    if selected.id is null then raise exception 'role unavailable' using errcode='P0002'; end if;
    if selected.builtin_key is not null then raise exception 'built-in roles cannot be edited' using errcode='42501'; end if;
    if selected.authority_rank>=actor_rank then raise exception 'role authority exceeds actor authority' using errcode='42501'; end if;
    result_id:=selected.id;
    if chosen_action='update' then
      update public.organization_roles set name=trim(submitted_name),color=upper(submitted_color),sort_position=submitted_position::smallint,authority_rank=submitted_rank::smallint,permissions=normalized_permissions where id=selected.id;
    elsif chosen_action='delete' then
      if exists(select 1 from public.organization_role_assignments where role_id=selected.id)
        or exists(select 1 from public.organization_channel_role_overrides where role_id=selected.id) then raise exception 'role still has assignments or channel dependencies' using errcode='23505'; end if;
      delete from public.organization_roles where id=selected.id;
    else raise exception 'unsupported role action' using errcode='23514'; end if;
  end if;
  insert into public.organization_audit_events(organization_id,actor_profile_id,action,target_type,target_id,metadata)
  values(target_organization,caller,'organization.role.'||chosen_action,'role',result_id::text,jsonb_build_object('name',trim(submitted_name),'color',upper(submitted_color),'position',submitted_position,'authorityRank',submitted_rank,'permissions',normalized_permissions));
  return result_id;
end $$;

create or replace function public.set_organization_channel_member_override(
  target_channel uuid,target_profile uuid,allow_view boolean,allow_send boolean,allow_manage boolean,allow_announcements boolean
) returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); org_id uuid; actor_rank smallint; target_rank smallint;
begin
  select organization_id into org_id from public.organization_channels where id=target_channel and status<>'removed';
  if org_id is null or not private.organization_has_permission(org_id,'manage_channels',caller) then raise exception 'channel management permission required' using errcode='42501'; end if;
  select coalesce(max(r.authority_rank),0) into actor_rank from public.organization_role_assignments a join public.organization_roles r on r.id=a.role_id where a.organization_id=org_id and a.profile_id=caller;
  select coalesce(max(r.authority_rank),0) into target_rank from public.organization_role_assignments a join public.organization_roles r on r.id=a.role_id where a.organization_id=org_id and a.profile_id=target_profile;
  if target_profile=caller or target_rank>=actor_rank or not exists(select 1 from public.organization_memberships where organization_id=org_id and profile_id=target_profile and status='active') then raise exception 'member override would exceed actor authority' using errcode='42501'; end if;
  if allow_view is null and allow_send is null and allow_manage is null and allow_announcements is null then
    delete from public.organization_channel_member_overrides where channel_id=target_channel and profile_id=target_profile;
  else
    insert into public.organization_channel_member_overrides(channel_id,profile_id,view_channel,send_messages,manage_messages,create_announcements,updated_by)
    values(target_channel,target_profile,allow_view,allow_send,allow_manage,allow_announcements,caller)
    on conflict(channel_id,profile_id) do update set view_channel=excluded.view_channel,send_messages=excluded.send_messages,manage_messages=excluded.manage_messages,create_announcements=excluded.create_announcements,updated_by=caller,updated_at=now();
  end if;
  update public.organization_channels set updated_at=now() where id=target_channel;
  insert into public.organization_audit_events(organization_id,actor_profile_id,action,target_type,target_id,metadata)
  values(org_id,caller,'organization.channel.member_permission_changed','channel',target_channel::text,jsonb_build_object('profileId',target_profile,'view',allow_view,'send',allow_send,'manage',allow_manage,'announcements',allow_announcements));
end $$;

create or replace function public.organization_audit_history(target_organization uuid,before_id bigint default null,result_limit integer default 50)
returns table(id bigint,actor_profile_id uuid,actor_handle text,actor_display_name text,action text,target_type text,target_id text,reason text,metadata jsonb,created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare org_campus uuid;
begin
  select campus_id into org_campus from public.organizations where public.organizations.id=target_organization;
  if org_campus is null or not (
    private.organization_has_permission(target_organization,'view_audit_log')
    or (public.has_mfa() and ((org_campus=public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[])) or private.has_platform_role(array['moderator','admin']::public.platform_role[])))
  ) then raise exception 'audit history permission required' using errcode='42501'; end if;
  return query select e.id,e.actor_profile_id,p.handle::text,p.display_name,e.action,e.target_type,e.target_id,e.reason,e.metadata,e.created_at
  from public.organization_audit_events e left join public.profiles p on p.id=e.actor_profile_id
  where e.organization_id=target_organization and (before_id is null or e.id<before_id)
  order by e.id desc limit least(greatest(result_limit,1),100);
end $$;

create or replace function public.set_organization_membership(target_organization uuid,target_profile uuid,chosen_action text,chosen_role public.organization_role,request_key uuid)
returns table(organization_id uuid,profile_id uuid,role public.organization_role,status public.organization_membership_status)
language plpgsql security invoker set search_path='' as $$
begin
  if chosen_action='transfer_ownership' then raise exception 'use confirmed ownership transfer' using errcode='42501'; end if;
  return query select * from private.set_organization_membership(target_organization,target_profile,chosen_action,chosen_role,request_key);
end $$;

create or replace function public.transfer_organization_ownership(target_organization uuid,target_successor uuid,submitted_confirmation text,request_key uuid)
returns table(organization_id uuid,profile_id uuid,role public.organization_role,status public.organization_membership_status)
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); org public.organizations; owner_membership public.organization_memberships; successor_membership public.organization_memberships;
begin
  if exists(select 1 from public.organization_audit_events e where e.organization_id=target_organization and e.actor_profile_id=caller and e.action='organization.ownership.transferred' and e.metadata->>'requestKey'=request_key::text) then
    return query select m.organization_id,m.profile_id,m.role,m.status from public.organization_memberships m where m.organization_id=target_organization and m.profile_id=target_successor;
    return;
  end if;
  select o.* into org from public.organizations o where o.id=target_organization and o.status='active' for update;
  if org.id is null or submitted_confirmation is distinct from org.name then raise exception 'organization confirmation mismatch' using errcode='23514'; end if;
  select m.* into owner_membership from public.organization_memberships m where m.organization_id=org.id and m.profile_id=caller for update;
  select m.* into successor_membership from public.organization_memberships m where m.organization_id=org.id and m.profile_id=target_successor for update;
  if owner_membership.status<>'active' or owner_membership.role<>'owner' or target_successor=caller or successor_membership.status<>'active' or successor_membership.role='owner' then raise exception 'ownership transfer not permitted' using errcode='42501'; end if;
  if (select count(*) from public.organization_memberships m where m.organization_id=org.id and m.status='active' and m.role='owner')<>1 then raise exception 'organization ownership invariant violated' using errcode='23514'; end if;
  perform * from private.set_organization_membership(org.id,target_successor,'transfer_ownership',null,request_key);
  if (select count(*) from public.organization_memberships m where m.organization_id=org.id and m.status='active' and m.role='owner')<>1 then raise exception 'organization must retain exactly one owner' using errcode='23514'; end if;
  insert into public.organization_audit_events(organization_id,actor_profile_id,action,target_type,target_id,metadata)
  values(org.id,caller,'organization.ownership.transferred','member',target_successor::text,jsonb_build_object('previousOwnerId',caller,'successorId',target_successor,'requestKey',request_key));
  return query select m.organization_id,m.profile_id,m.role,m.status from public.organization_memberships m where m.organization_id=org.id and m.profile_id=target_successor;
end $$;

create or replace function public.create_organization_event(
  target_organization uuid,submitted_title text,submitted_description text,submitted_location text,
  submitted_starts_at timestamptz,submitted_ends_at timestamptz,submitted_capacity integer,
  submitted_visibility public.content_visibility,request_key uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); org public.organizations; event_id uuid;
begin
  if not private.organization_has_permission(target_organization,'create_organization_events',caller) then raise exception 'organization event permission required' using errcode='42501'; end if;
  select * into org from public.organizations where id=target_organization and status='active';
  if submitted_visibility='network' and org.visibility<>'network' then raise exception 'event visibility exceeds organization visibility' using errcode='42501'; end if;
  insert into public.events(campus_id,organizer_id,organization_id,title,description,location,starts_at,ends_at,capacity,visibility,idempotency_key)
  values(org.campus_id,caller,org.id,trim(submitted_title),trim(submitted_description),trim(submitted_location),submitted_starts_at,submitted_ends_at,submitted_capacity,submitted_visibility,request_key)
  on conflict(organizer_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into event_id;
  insert into public.organization_audit_events(organization_id,actor_profile_id,action,target_type,target_id)
  values(org.id,caller,'organization.event.created','event',event_id::text);
  return event_id;
end $$;

create or replace function private.audit_organization_membership_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.organization_audit_events(organization_id,actor_profile_id,action,target_type,target_id,metadata)
  values(new.organization_id,coalesce(new.invited_by,(select auth.uid())),'organization.membership.changed','member',new.profile_id::text,
    jsonb_build_object('oldStatus',case when tg_op='UPDATE' then old.status::text end,'newStatus',new.status::text,'oldRole',case when tg_op='UPDATE' then old.role::text end,'newRole',new.role::text));
  return new;
end $$;
create trigger organization_memberships_audit after insert or update of status,role on public.organization_memberships
for each row execute function private.audit_organization_membership_change();

-- Defense-in-depth RLS. Restricted channel names/categories and message counts
-- are undiscoverable unless the same database permission resolver allows view.
alter table public.organization_roles enable row level security;
alter table public.organization_role_assignments enable row level security;
alter table public.organization_categories enable row level security;
alter table public.organization_channels enable row level security;
alter table public.organization_channel_role_overrides enable row level security;
alter table public.organization_channel_member_overrides enable row level security;
alter table public.organization_channel_messages enable row level security;
alter table public.organization_channel_reads enable row level security;
alter table public.organization_audit_events enable row level security;
alter table public.organization_notification_preferences enable row level security;

create policy organization_roles_member_read on public.organization_roles for select to authenticated using (private.organization_has_permission(organization_id,'view_channels'));
create policy organization_role_assignments_member_read on public.organization_role_assignments for select to authenticated using (private.organization_has_permission(organization_id,'view_channels'));
create policy organization_categories_channel_read on public.organization_categories for select to authenticated using (private.organization_category_visible(id));
create policy organization_channels_permission_read on public.organization_channels for select to authenticated using (private.organization_channel_permission(id,'view_channel'));
create policy organization_channel_role_overrides_manager_read on public.organization_channel_role_overrides for select to authenticated using (private.organization_has_permission((select organization_id from public.organization_channels where id=channel_id),'manage_channels'));
create policy organization_channel_member_overrides_manager_read on public.organization_channel_member_overrides for select to authenticated using (profile_id=(select auth.uid()) or private.organization_has_permission((select organization_id from public.organization_channels where id=channel_id),'manage_channels'));
create policy organization_messages_permission_read on public.organization_channel_messages for select to authenticated using (private.organization_channel_permission(channel_id,'view_channel') and (author_profile_id is null or not private.block_exists((select auth.uid()),author_profile_id)));
create policy organization_channel_reads_self_read on public.organization_channel_reads for select to authenticated using (profile_id=(select auth.uid()) and private.organization_channel_permission(channel_id,'view_channel'));
create policy organization_audit_permission_read on public.organization_audit_events for select to authenticated using (private.organization_has_permission(organization_id,'view_audit_log'));
create policy organization_notification_preferences_self_read on public.organization_notification_preferences for select to authenticated using (profile_id=(select auth.uid()));
create policy organization_notification_preferences_self_update on public.organization_notification_preferences for update to authenticated using (profile_id=(select auth.uid())) with check (profile_id=(select auth.uid()) and private.organization_has_permission(organization_id,'view_organization'));

revoke all on public.organization_roles,public.organization_role_assignments,public.organization_categories,public.organization_channels,public.organization_channel_role_overrides,public.organization_channel_member_overrides,public.organization_channel_messages,public.organization_channel_reads,public.organization_audit_events,public.organization_notification_preferences from anon,authenticated;
grant select on public.organization_roles,public.organization_role_assignments,public.organization_categories,public.organization_channels,public.organization_channel_role_overrides,public.organization_channel_member_overrides,public.organization_channel_messages,public.organization_channel_reads,public.organization_audit_events,public.organization_notification_preferences to authenticated;
grant update (announcements,mentions,membership_changes,muted_until) on public.organization_notification_preferences to authenticated;
grant all on public.organization_roles,public.organization_role_assignments,public.organization_categories,public.organization_channels,public.organization_channel_role_overrides,public.organization_channel_member_overrides,public.organization_channel_messages,public.organization_channel_reads,public.organization_audit_events,public.organization_notification_preferences to service_role;

do $$ declare table_name text; begin
  foreach table_name in array array['organization_channel_messages','organization_channels','organization_categories','organization_roles','organization_role_assignments','organization_memberships'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=table_name) then
      execute format('alter publication supabase_realtime add table public.%I',table_name);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Unified moderation cases, evidence boundaries, appeals, and reversals
-- ---------------------------------------------------------------------------

create or replace function public.manage_social_post(target_post uuid,chosen_action text,submitted_body text default '')
returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); selected public.social_posts;
begin
  select * into selected from public.social_posts where id=target_post and author_profile_id=caller and status='active' for update;
  if selected.id is null then raise exception 'post unavailable' using errcode='P0002'; end if;
  if chosen_action='edit' then
    if char_length(trim(submitted_body))<1 then raise exception 'post body required' using errcode='23514'; end if;
    update public.social_posts set body=trim(submitted_body),edited_at=now() where id=target_post;
  elsif chosen_action='delete' then
    update public.social_posts set status='deleted',deleted_at=now(),purge_after=now()+interval '30 days' where id=target_post;
  else raise exception 'unsupported post action' using errcode='23514'; end if;
end $$;

create or replace function public.manage_social_comment(target_comment uuid,chosen_action text,submitted_body text default '')
returns void language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); selected public.social_comments; total integer;
begin
  select * into selected from public.social_comments where id=target_comment and author_profile_id=caller and deleted_at is null and removed_at is null for update;
  if selected.id is null then raise exception 'comment unavailable' using errcode='P0002'; end if;
  if chosen_action='edit' then
    if char_length(trim(submitted_body))<1 then raise exception 'comment body required' using errcode='23514'; end if;
    update public.social_comments set body=trim(submitted_body),edited_at=now() where id=target_comment;
  elsif chosen_action='delete' then
    update public.social_comments set body=null,deleted_at=now(),purge_after=now()+interval '30 days' where id=target_comment;
    select count(*)::integer into total from public.social_comments where post_id=selected.post_id and deleted_at is null and removed_at is null;
    update public.social_posts set comment_count=total where id=selected.post_id;
  else raise exception 'unsupported comment action' using errcode='23514'; end if;
end $$;

create type public.moderation_case_status as enum ('new','assigned','escalated','awaiting_user_response','resolved','dismissed','appealed');
create type public.moderation_severity as enum ('low','medium','high','critical');

create table public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null unique references public.reports(id) on delete restrict,
  campus_id uuid not null references public.campuses(id),
  subject_campus_id uuid not null references public.campuses(id),
  platform_visible boolean not null default false,
  entity_type text not null,
  entity_id uuid not null,
  severity public.moderation_severity not null default 'medium',
  status public.moderation_case_status not null default 'new',
  assigned_to uuid references public.profiles(id),
  repeat_offender boolean not null default false,
  organization_id uuid references public.organizations(id) on delete set null,
  community_id uuid references public.discussion_communities(id) on delete set null,
  user_visible_resolution text check (user_visible_resolution is null or char_length(user_visible_resolution) between 3 and 1000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.moderation_case_events (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  event_type text not null,
  note text check (note is null or char_length(note) between 3 and 4000),
  internal boolean not null default true,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  appellant_id uuid not null references public.profiles(id) on delete cascade,
  statement text not null check (char_length(statement) between 20 and 4000),
  status text not null default 'open' check (status in ('open','reviewing','awaiting_user_response','granted','denied','withdrawn')),
  assigned_to uuid references public.profiles(id),
  resolution text check (resolution is null or char_length(resolution) between 3 and 2000),
  idempotency_key uuid not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(appellant_id,idempotency_key)
);

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions
  add column case_id uuid references public.moderation_cases(id) on delete set null,
  add column target_type text,
  add column target_id uuid,
  add column reversible boolean not null default false,
  add column reversed_at timestamptz,
  add column reversed_by uuid references public.profiles(id),
  add column metadata jsonb not null default '{}',
  add constraint moderation_actions_action_check check (action in (
    'dismiss','warn','hide_content','remove_content','restore_content','restrict_content','lock_content',
    'temporary_account_restriction','suspend','restore','ban_account','restrict_organization','suspend_organization',
    'remove_organization','restrict_channel','delete_channel_message','remove_organization_role','remove_organization_member',
    'restrict_community','remove_listing','cancel_event','escalate','request_information','reverse'
  ));

create index moderation_cases_queue_idx on public.moderation_cases(status,severity desc,created_at,id);
create index moderation_cases_campus_idx on public.moderation_cases(subject_campus_id,status,created_at);
create index moderation_case_events_timeline_idx on public.moderation_case_events(case_id,created_at,id);
create index moderation_appeals_queue_idx on public.moderation_appeals(status,created_at,id);
create trigger moderation_cases_touch before update on public.moderation_cases for each row execute function public.touch_updated_at();
create trigger moderation_appeals_touch before update on public.moderation_appeals for each row execute function public.touch_updated_at();

create or replace function private.create_moderation_case_from_report() returns trigger
language plpgsql security definer set search_path='' as $$
declare org_id uuid; comm_id uuid;
begin
  if new.target_type in ('organization','organization_channel','organization_message','organization_role','organization_membership') then
    if new.target_type='organization' then org_id:=new.target_id;
    elsif new.target_type='organization_channel' then select organization_id into org_id from public.organization_channels where id=new.target_id;
    elsif new.target_type='organization_message' then select organization_id into org_id from public.organization_channel_messages where id=new.target_id;
    elsif new.target_type='organization_role' then select organization_id into org_id from public.organization_roles where id=new.target_id;
    elsif new.target_type='organization_membership' then select organization_id into org_id from public.organization_memberships where id=new.target_id;
    end if;
  elsif new.target_type in ('community','discussion_post','discussion_comment') then
    if new.target_type='community' then comm_id:=new.target_id;
    elsif new.target_type='discussion_post' then select community_id into comm_id from public.discussion_posts where id=new.target_id;
    else select community_id into comm_id from public.discussion_comments where id=new.target_id; end if;
  end if;
  insert into public.moderation_cases(report_id,campus_id,subject_campus_id,platform_visible,entity_type,entity_id,severity,organization_id,community_id)
  values(new.id,new.campus_id,new.subject_campus_id,new.platform_visible,new.target_type,new.target_id,
    case when new.reason in ('unsafe','harassment','fraud') then 'high'::public.moderation_severity else 'medium'::public.moderation_severity end,org_id,comm_id)
  on conflict(report_id) do nothing;
  return new;
end $$;
create trigger reports_create_moderation_case after insert on public.reports for each row execute function private.create_moderation_case_from_report();

insert into public.moderation_cases(report_id,campus_id,subject_campus_id,platform_visible,entity_type,entity_id,severity,status,assigned_to,resolved_at)
select r.id,r.campus_id,r.subject_campus_id,r.platform_visible,r.target_type,r.target_id,
  case when r.reason in ('unsafe','harassment','fraud') then 'high'::public.moderation_severity else 'medium'::public.moderation_severity end,
  case r.status when 'resolved' then 'resolved'::public.moderation_case_status when 'dismissed' then 'dismissed'::public.moderation_case_status when 'reviewing' then 'assigned'::public.moderation_case_status else 'new'::public.moderation_case_status end,
  r.assigned_to,r.resolved_at from public.reports r on conflict(report_id) do nothing;

create or replace function private.can_access_moderation_case(target_case uuid,actor uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
  select public.has_mfa() and exists(
    select 1 from public.moderation_cases c where c.id=target_case and (
      (c.subject_campus_id=public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]))
      or (c.platform_visible and private.has_platform_role(array['moderator','admin']::public.platform_role[]))
    )
  )
$$;

create or replace function public.moderation_case_queue(
  chosen_status text default null,chosen_entity text default null,chosen_severity text default null,
  chosen_assignee uuid default null,chosen_organization uuid default null,result_limit integer default 100
) returns table(
  id uuid,report_id uuid,entity_type text,entity_id uuid,severity public.moderation_severity,status public.moderation_case_status,
  assigned_to uuid,reason text,details text,created_at timestamptz,subject_campus_id uuid,organization_id uuid,community_id uuid
)
language plpgsql security definer set search_path='' as $$
begin
  if not public.has_mfa() or not (public.has_role(array['moderator','admin']::public.app_role[]) or private.has_platform_role(array['moderator','admin']::public.platform_role[])) then raise exception 'MFA-protected moderator access required' using errcode='42501'; end if;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
  values(public.current_campus_id(),(select auth.uid()),'security.sensitive_access','moderation_cases',coalesce(public.current_campus_id()::text,'platform'),jsonb_build_object('filters',jsonb_build_object('status',chosen_status,'entity',chosen_entity,'severity',chosen_severity)));
  return query select c.id,c.report_id,c.entity_type,c.entity_id,c.severity,c.status,c.assigned_to,r.reason,r.details,c.created_at,c.subject_campus_id,c.organization_id,c.community_id
  from public.moderation_cases c join public.reports r on r.id=c.report_id
  where private.can_access_moderation_case(c.id)
    and (chosen_status is null or c.status::text=chosen_status)
    and (chosen_entity is null or c.entity_type=chosen_entity)
    and (chosen_severity is null or c.severity::text=chosen_severity)
    and (chosen_assignee is null or c.assigned_to=chosen_assignee)
    and (chosen_organization is null or c.organization_id=chosen_organization)
  order by (c.severity='critical') desc,(c.severity='high') desc,c.created_at limit least(greatest(result_limit,1),200);
end $$;

create or replace function private.moderation_subject(target_case uuid) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare c public.moderation_cases; result uuid;
begin
  select * into c from public.moderation_cases where id=target_case;
  if c.entity_type='profile' then result:=c.entity_id;
  elsif c.entity_type='listing' then select seller_id into result from public.listings where id=c.entity_id;
  elsif c.entity_type='event' then select organizer_id into result from public.events where id=c.entity_id;
  elsif c.entity_type='social_post' then select author_profile_id into result from public.social_posts where id=c.entity_id;
  elsif c.entity_type='social_comment' then select author_profile_id into result from public.social_comments where id=c.entity_id;
  elsif c.entity_type='organization_message' then select author_profile_id into result from public.organization_channel_messages where id=c.entity_id;
  elsif c.entity_type='organization_membership' then select profile_id into result from public.organization_memberships where id=c.entity_id;
  elsif c.entity_type='organization' then select created_by into result from public.organizations where id=c.entity_id;
  end if;
  return result;
end $$;

create or replace function public.moderate_case(target_case uuid,chosen_action text,action_reason text,user_message text default null,restriction_until timestamptz default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); selected public.moderation_cases; report_row public.reports; prior_action public.moderation_actions; action_id uuid; subject uuid; prior jsonb:='{}'::jsonb; next_status public.moderation_case_status:='resolved'::public.moderation_case_status; reversible boolean:=false;
begin
  if char_length(trim(action_reason))<3 then raise exception 'action reason required' using errcode='23514'; end if;
  select * into selected from public.moderation_cases where id=target_case and private.can_access_moderation_case(id) for update;
  if selected.id is null then raise exception 'case unavailable' using errcode='P0002'; end if;
  select * into report_row from public.reports where id=selected.report_id;
  subject:=private.moderation_subject(selected.id);
  if chosen_action='dismiss' then next_status:='dismissed';
  elsif chosen_action='warn' then null;
  elsif chosen_action in ('restore','restore_content') then
    select ma.* into prior_action from public.moderation_actions ma where ma.case_id=selected.id and ma.reversible and ma.reversed_at is null order by ma.created_at desc limit 1 for update;
    if prior_action.id is null then raise exception 'no reversible action is available' using errcode='P0002'; end if;
    if prior_action.target_type='listing' then
      update public.listings set status=(prior_action.metadata#>>'{prior,status}')::public.listing_status where id=prior_action.target_id;
    elsif prior_action.target_type='social_post' then
      update public.social_posts set status=(prior_action.metadata#>>'{prior,status}')::public.social_post_status,removed_at=null,removed_by=null,removal_reason=null where id=prior_action.target_id;
    elsif prior_action.target_type='social_comment' then
      update public.social_comments set body=prior_action.metadata#>>'{prior,body}',removed_at=null,removed_by=null,removal_reason=null where id=prior_action.target_id;
    elsif prior_action.target_type='event' then
      update public.events set cancelled_at=(prior_action.metadata#>>'{prior,cancelledAt}')::timestamptz where id=prior_action.target_id;
    elsif prior_action.target_type='profile' then
      update public.profiles set status=(prior_action.metadata#>>'{prior,status}')::public.profile_status,restricted_until=(prior_action.metadata#>>'{prior,restrictedUntil}')::timestamptz,restriction_reason=null where id=prior_action.target_id;
    elsif prior_action.target_type='organization' then
      update public.organizations set status=(prior_action.metadata#>>'{prior,status}')::public.organization_status,is_read_only=coalesce((prior_action.metadata#>>'{prior,readOnly}')::boolean,false),restriction_reason=null,suspended_at=(prior_action.metadata#>>'{prior,suspendedAt}')::timestamptz where id=prior_action.target_id;
    elsif prior_action.target_type='organization_channel' then
      update public.organization_channels set status=prior_action.metadata#>>'{prior,status}' where id=prior_action.target_id;
    else raise exception 'action cannot be reversed safely' using errcode='23514'; end if;
    update public.moderation_actions set reversed_at=now(),reversed_by=caller where id=prior_action.id;
    prior:=jsonb_build_object('reversedActionId',prior_action.id);
  elsif chosen_action in ('hide_content','remove_content','remove_listing') and selected.entity_type='listing' then
    select jsonb_build_object('status',status::text) into prior from public.listings where id=selected.entity_id;
    update public.listings set status='withdrawn' where id=selected.entity_id; reversible:=true;
  elsif chosen_action in ('hide_content','remove_content') and selected.entity_type='social_post' then
    select jsonb_build_object('status',status::text) into prior from public.social_posts where id=selected.entity_id;
    update public.social_posts set status='removed',removed_at=now(),removed_by=caller,removal_reason=trim(action_reason) where id=selected.entity_id; reversible:=true;
  elsif chosen_action in ('hide_content','remove_content') and selected.entity_type='social_comment' then
    select jsonb_build_object('body',body) into prior from public.social_comments where id=selected.entity_id;
    update public.social_comments set body=null,removed_at=now(),removed_by=caller,removal_reason=trim(action_reason) where id=selected.entity_id; reversible:=true;
  elsif chosen_action='cancel_event' and selected.entity_type='event' then
    select jsonb_build_object('cancelledAt',cancelled_at) into prior from public.events where id=selected.entity_id;
    update public.events set cancelled_at=coalesce(cancelled_at,now()) where id=selected.entity_id; reversible:=true;
  elsif chosen_action in ('suspend','temporary_account_restriction','ban_account') and selected.entity_type='profile' then
    if selected.entity_id=caller then raise exception 'cannot moderate own account' using errcode='42501'; end if;
    select jsonb_build_object('status',status::text,'restrictedUntil',restricted_until) into prior from public.profiles where id=selected.entity_id;
    update public.profiles set status=case when chosen_action='temporary_account_restriction' then status else 'suspended'::public.profile_status end,restricted_until=restriction_until,restriction_reason=trim(action_reason) where id=selected.entity_id; reversible:=true;
  elsif chosen_action in ('restrict_organization','suspend_organization','remove_organization') and selected.entity_type='organization' then
    select jsonb_build_object('status',status::text,'readOnly',is_read_only,'suspendedAt',suspended_at) into prior from public.organizations where id=selected.entity_id;
    update public.organizations set is_read_only=(chosen_action='restrict_organization'),status=case when chosen_action='restrict_organization' then status when chosen_action='remove_organization' then 'deleted'::public.organization_status else 'suspended'::public.organization_status end,restriction_reason=trim(action_reason),suspended_at=case when chosen_action='restrict_organization' then suspended_at else now() end,deleted_at=case when chosen_action='remove_organization' then now() else deleted_at end where id=selected.entity_id; reversible:=chosen_action<>'remove_organization';
  elsif chosen_action='restrict_channel' and selected.entity_type='organization_channel' then
    select jsonb_build_object('status',status) into prior from public.organization_channels where id=selected.entity_id;
    update public.organization_channels set status='read_only' where id=selected.entity_id; reversible:=true;
  elsif chosen_action='delete_channel_message' and selected.entity_type='organization_message' then
    update public.organization_channel_messages set body=null,deleted_at=now(),deleted_by=caller,moderation_reason=trim(action_reason) where id=selected.entity_id; reversible:=false;
  elsif chosen_action='remove_organization_member' and selected.entity_type='organization_membership' then
    update public.organization_memberships set status='removed',joined_at=null where id=selected.entity_id and organization_id=selected.organization_id and role<>'owner';
  elsif chosen_action='restrict_community' and selected.community_id is not null then
    update public.discussion_communities set status='archived' where id=selected.community_id;
  elsif chosen_action='escalate' then next_status:='escalated';
  elsif chosen_action='request_information' then next_status:='awaiting_user_response';
  else raise exception 'action is not supported for this entity' using errcode='23514'; end if;

  insert into public.moderation_actions(campus_id,report_id,case_id,moderator_id,subject_profile_id,target_type,target_id,action,reason,reversible,metadata)
  values(selected.subject_campus_id,selected.report_id,selected.id,caller,subject,selected.entity_type,selected.entity_id,chosen_action,trim(action_reason),reversible,jsonb_build_object('prior',prior)) returning id into action_id;
  update public.moderation_cases set status=next_status,assigned_to=caller,user_visible_resolution=nullif(trim(user_message),''),resolved_at=case when next_status in ('resolved','dismissed') then now() else null end where id=selected.id;
  update public.reports set status=case when next_status='dismissed' then 'dismissed'::public.report_status when next_status='resolved' then 'resolved'::public.report_status else 'reviewing'::public.report_status end,assigned_to=caller,resolved_at=case when next_status in ('resolved','dismissed') then now() else null end where id=selected.report_id;
  insert into public.moderation_case_events(case_id,actor_id,event_type,note,metadata) values(selected.id,caller,'moderation.'||chosen_action,trim(action_reason),jsonb_build_object('actionId',action_id));
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata) values(selected.subject_campus_id,caller,'moderation.'||chosen_action,selected.entity_type,selected.entity_id::text,jsonb_build_object('caseId',selected.id,'actionId',action_id));
  insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
  values(report_row.campus_id,'moderation.report_resolved',selected.report_id,jsonb_build_object('recipientId',report_row.reporter_id,'actorId',caller,'reportId',selected.report_id,'caseId',selected.id),'moderation-case-action:'||action_id) on conflict do nothing;
  if subject is not null and subject is distinct from report_row.reporter_id and chosen_action not in ('dismiss','escalate','request_information') then
    insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
    select p.campus_id,'moderation.entity_actioned',selected.id,jsonb_build_object('recipientId',subject,'actorId',caller,'caseId',selected.id,'action',chosen_action),'moderation-entity-actioned:'||action_id
    from public.profiles p where p.id=subject on conflict do nothing;
  end if;
  return action_id;
end $$;

create or replace function public.appealable_moderation_cases()
returns table(id uuid,entity_type text,status public.moderation_case_status,user_visible_resolution text,resolved_at timestamptz,appeal_id uuid,appeal_status text)
language sql stable security definer set search_path='' as $$
  select c.id,c.entity_type,c.status,c.user_visible_resolution,c.resolved_at,a.id,a.status
  from public.moderation_cases c
  left join lateral (select ma.id,ma.status from public.moderation_appeals ma where ma.case_id=c.id and ma.appellant_id=(select auth.uid()) order by ma.created_at desc limit 1) a on true
  where private.moderation_subject(c.id)=(select auth.uid()) and c.status in ('resolved','dismissed','appealed')
  order by coalesce(c.resolved_at,c.updated_at) desc limit 50
$$;

create or replace function public.submit_moderation_appeal(target_case uuid,submitted_statement text,request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); selected public.moderation_cases; appeal_id uuid;
begin
  select * into selected from public.moderation_cases where id=target_case and status in ('resolved','dismissed');
  if selected.id is null or private.moderation_subject(selected.id) is distinct from caller then raise exception 'case is not appealable' using errcode='42501'; end if;
  insert into public.moderation_appeals(case_id,appellant_id,statement,idempotency_key) values(selected.id,caller,trim(submitted_statement),request_key)
  on conflict(appellant_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into appeal_id;
  update public.moderation_cases set status='appealed',resolved_at=null where id=selected.id;
  insert into public.moderation_case_events(case_id,actor_id,event_type,note,internal) values(selected.id,caller,'moderation.appeal.submitted','Appeal submitted by the affected member.',false);
  return appeal_id;
end $$;

create or replace function public.resolve_moderation_appeal(
  target_appeal uuid,chosen_action text,target_reviewer uuid,internal_reason text,user_resolution text,reverse_action boolean default false
) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); selected public.moderation_appeals; selected_case public.moderation_cases; reviewer uuid:=coalesce(target_reviewer,caller); reversal_id uuid;
begin
  if char_length(trim(internal_reason))<3 then raise exception 'internal appeal reasoning required' using errcode='23514'; end if;
  select * into selected from public.moderation_appeals where id=target_appeal for update;
  if selected.id is null then raise exception 'appeal unavailable' using errcode='P0002'; end if;
  select * into selected_case from public.moderation_cases where id=selected.case_id and private.can_access_moderation_case(id) for update;
  if selected_case.id is null then raise exception 'appeal unavailable' using errcode='P0002'; end if;
  if selected.status in ('granted','denied','withdrawn') then raise exception 'appeal is already closed' using errcode='23505'; end if;
  if chosen_action='assign' then
    if not (
      exists(select 1 from public.role_assignments ra where ra.profile_id=reviewer and ra.campus_id=selected_case.subject_campus_id and ra.role in ('moderator','admin'))
      or (selected_case.platform_visible and exists(select 1 from public.platform_role_assignments pra where pra.profile_id=reviewer and pra.role in ('moderator','admin')))
    ) then raise exception 'reviewer is outside the case authority boundary' using errcode='42501'; end if;
    update public.moderation_appeals set status='reviewing',assigned_to=reviewer where id=selected.id;
    update public.moderation_cases set status='appealed',assigned_to=reviewer where id=selected.case_id;
  elsif chosen_action='request_information' then
    if char_length(trim(user_resolution))<3 then raise exception 'user-visible request required' using errcode='23514'; end if;
    update public.moderation_appeals set status='awaiting_user_response',assigned_to=caller,resolution=trim(user_resolution) where id=selected.id;
    update public.moderation_cases set status='awaiting_user_response',assigned_to=caller,user_visible_resolution=trim(user_resolution),resolved_at=null where id=selected.case_id;
  elsif chosen_action in ('approve','reject') then
    if char_length(trim(user_resolution))<3 then raise exception 'user-visible resolution required' using errcode='23514'; end if;
    if chosen_action='reject' and reverse_action then raise exception 'upheld appeals cannot reverse actions' using errcode='23514'; end if;
    if chosen_action='approve' and reverse_action then
      reversal_id:=public.moderate_case(selected.case_id,'restore_content',internal_reason,user_resolution,null);
    else
      update public.moderation_cases set status='resolved',assigned_to=caller,user_visible_resolution=trim(user_resolution),resolved_at=now() where id=selected.case_id;
      update public.reports set status='resolved',assigned_to=caller,resolved_at=now() where id=selected_case.report_id;
    end if;
    update public.moderation_appeals set status=case when chosen_action='approve' then 'granted' else 'denied' end,assigned_to=caller,resolution=trim(user_resolution),resolved_at=now() where id=selected.id;
  else raise exception 'unsupported appeal action' using errcode='23514'; end if;

  insert into public.moderation_case_events(case_id,actor_id,event_type,note,metadata)
  values(selected.case_id,caller,'moderation.appeal.'||chosen_action,trim(internal_reason),jsonb_build_object('appealId',selected.id,'reviewerId',reviewer,'reverseAction',reverse_action,'reversalActionId',reversal_id));
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
  values(selected_case.subject_campus_id,caller,'moderation.appeal.'||chosen_action,'moderation_appeal',selected.id::text,jsonb_build_object('caseId',selected.case_id,'reviewerId',reviewer,'reverseAction',reverse_action));
  if chosen_action<>'assign' then
    insert into public.outbox_events(campus_id,event_type,aggregate_id,payload,idempotency_key)
    values(selected_case.subject_campus_id,'moderation.appeal_updated',selected.id,jsonb_build_object('recipientId',selected.appellant_id,'actorId',caller,'caseId',selected.case_id,'appealId',selected.id,'action',chosen_action,'resolution',nullif(trim(user_resolution),'')),'moderation-appeal:'||selected.id||':'||chosen_action||':'||extract(epoch from now())::bigint) on conflict do nothing;
  end if;
  return selected.id;
end $$;

alter table public.moderation_cases enable row level security;
alter table public.moderation_case_events enable row level security;
alter table public.moderation_appeals enable row level security;
create policy moderation_cases_scoped_staff_read on public.moderation_cases for select to authenticated using (private.can_access_moderation_case(id));
create policy moderation_case_events_scoped_staff_read on public.moderation_case_events for select to authenticated using (private.can_access_moderation_case(case_id));
create policy moderation_appeals_appellant_or_staff_read on public.moderation_appeals for select to authenticated using (appellant_id=(select auth.uid()) or private.can_access_moderation_case(case_id));
revoke all on public.moderation_cases,public.moderation_case_events,public.moderation_appeals from anon,authenticated;
grant select on public.moderation_cases,public.moderation_case_events,public.moderation_appeals to authenticated;
grant all on public.moderation_cases,public.moderation_case_events,public.moderation_appeals to service_role;

alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check check (target_type in (
  'listing','event','profile','message','conversation_request','community','discussion_post','discussion_comment',
  'organization','organization_channel','organization_message','organization_role','organization_membership',
  'social_post','social_comment','institution','account_security'
));

create or replace function public.report_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.target_type='listing' then
    select jsonb_build_object('listingId',l.id,'sellerId',l.seller_id,'title',l.title,'description',l.description,'status',l.status,'createdAt',l.created_at) into new.content_snapshot
    from public.listings l where l.id=new.target_id and l.deleted_at is null and private.content_is_visible(l.campus_id,l.visibility);
  elsif new.target_type='event' then
    select jsonb_build_object('eventId',e.id,'organizerId',e.organizer_id,'organizationId',e.organization_id,'title',e.title,'description',e.description,'location',e.location,'startsAt',e.starts_at,'cancelledAt',e.cancelled_at) into new.content_snapshot
    from public.events e where e.id=new.target_id and e.deleted_at is null and private.content_is_visible(e.campus_id,e.visibility);
  elsif new.target_type='message' then
    select jsonb_build_object('messageId',m.id,'senderId',m.sender_id,'body',m.body,'createdAt',m.created_at) into new.message_snapshot
    from public.messages m where m.id=new.target_id and public.is_conversation_participant(m.conversation_id);
  elsif new.target_type='conversation_request' then
    select jsonb_build_object('requestId',r.id,'senderId',r.requester_id,'recipientId',r.recipient_id,'openingMessage',r.opening_message,'createdAt',r.created_at) into new.message_snapshot
    from public.conversation_requests r where r.id=new.target_id and r.recipient_id=(select auth.uid());
  elsif new.target_type='organization_message' then
    select jsonb_build_object('messageId',m.id,'channelId',m.channel_id,'authorId',m.author_profile_id,'body',m.body,'createdAt',m.created_at) into new.message_snapshot
    from public.organization_channel_messages m where m.id=new.target_id and private.organization_channel_permission(m.channel_id,'view_channel');
  elsif new.target_type='community' then
    select jsonb_build_object('communityId',c.id,'slug',c.slug,'displayName',c.display_name,'description',c.description) into new.content_snapshot
    from public.discussion_communities c where c.id=new.target_id and c.campus_id=public.current_campus_id();
  elsif new.target_type='discussion_post' then
    select jsonb_build_object('postId',p.id,'communityId',p.community_id,'authorId',p.author_id,'title',p.title,'body',p.body,'linkUrl',p.link_url,'createdAt',p.created_at) into new.content_snapshot
    from public.discussion_posts p where p.id=new.target_id and p.campus_id=public.current_campus_id();
  elsif new.target_type='discussion_comment' then
    select jsonb_build_object('commentId',c.id,'communityId',c.community_id,'postId',c.post_id,'authorId',c.author_id,'body',c.body,'createdAt',c.created_at) into new.content_snapshot
    from public.discussion_comments c where c.id=new.target_id and c.campus_id=public.current_campus_id();
  elsif new.target_type='organization' then
    select jsonb_build_object('organizationId',o.id,'name',o.name,'description',o.description,'createdAt',o.created_at) into new.content_snapshot
    from public.organizations o where o.id=new.target_id and private.can_read_organization(o.id);
  elsif new.target_type='organization_channel' then
    select jsonb_build_object('channelId',c.id,'organizationId',c.organization_id,'name',c.name,'description',c.description,'channelType',c.channel_type) into new.content_snapshot
    from public.organization_channels c where c.id=new.target_id and private.organization_channel_permission(c.id,'view_channel');
  elsif new.target_type='organization_role' then
    select jsonb_build_object('roleId',r.id,'organizationId',r.organization_id,'name',r.name,'permissions',r.permissions) into new.content_snapshot
    from public.organization_roles r where r.id=new.target_id and private.organization_has_permission(r.organization_id,'view_organization');
  elsif new.target_type='organization_membership' then
    select jsonb_build_object('membershipId',m.id,'organizationId',m.organization_id,'profileId',m.profile_id,'role',m.role,'status',m.status) into new.content_snapshot
    from public.organization_memberships m where m.id=new.target_id and private.organization_has_permission(m.organization_id,'view_organization');
  elsif new.target_type='social_post' then
    select jsonb_build_object('postId',p.id,'authorId',p.author_profile_id,'organizationId',p.organization_id,'body',p.body,'createdAt',p.created_at) into new.content_snapshot
    from public.social_posts p where p.id=new.target_id and private.can_read_social_post(p.id);
  elsif new.target_type='social_comment' then
    select jsonb_build_object('commentId',c.id,'postId',c.post_id,'authorId',c.author_profile_id,'body',c.body,'createdAt',c.created_at) into new.content_snapshot
    from public.social_comments c where c.id=new.target_id and private.can_read_social_post(c.post_id);
  elsif new.target_type='profile' then
    select jsonb_build_object('profileId',p.id,'handle',p.handle,'displayName',p.display_name,'campusId',p.campus_id) into new.content_snapshot
    from public.profiles p where p.id=new.target_id and private.active_member(p.id) and not private.block_exists((select auth.uid()),p.id);
  elsif new.target_type='account_security' and new.target_id=(select auth.uid()) then
    new.content_snapshot:=jsonb_build_object('profileId',new.target_id,'submittedByAccountOwner',true);
  elsif new.target_type='institution' then
    select jsonb_build_object('campusId',c.id,'name',c.name,'status',c.status) into new.content_snapshot from public.campuses c where c.id=new.target_id;
  end if;
  if new.target_type in ('message','conversation_request','organization_message') and new.message_snapshot is null then raise exception 'message is not reportable' using errcode='42501'; end if;
  if new.target_type not in ('message','conversation_request','organization_message') and new.content_snapshot is null then raise exception 'content is not reportable' using errcode='42501'; end if;
  return new;
end $$;

create or replace function public.submit_report(submitted_type text,submitted_id uuid,submitted_reason text,submitted_details text,submitted_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); caller_campus uuid:=public.current_campus_id(); target_campus uuid; report_id uuid; global_scope boolean:=false;
begin
  if caller_campus is null then raise exception 'active membership required' using errcode='42501'; end if;
  if submitted_type='listing' then select campus_id,(visibility='network') into target_campus,global_scope from public.listings where id=submitted_id and deleted_at is null and private.content_is_visible(campus_id,visibility);
  elsif submitted_type='event' then select campus_id,(visibility='network') into target_campus,global_scope from public.events where id=submitted_id and deleted_at is null and private.content_is_visible(campus_id,visibility);
  elsif submitted_type='profile' then select campus_id,(campus_id<>caller_campus) into target_campus,global_scope from public.profiles where id=submitted_id and private.active_member(id) and not private.block_exists(caller,id);
  elsif submitted_type='message' then select m.campus_id,true into target_campus,global_scope from public.messages m where m.id=submitted_id and public.is_conversation_participant(m.conversation_id);
  elsif submitted_type='conversation_request' then select requester_campus_id,true into target_campus,global_scope from public.conversation_requests where id=submitted_id and recipient_id=caller;
  elsif submitted_type in ('community','discussion_post','discussion_comment') then target_campus:=caller_campus;
  elsif submitted_type='organization' then select campus_id,(visibility='network') into target_campus,global_scope from public.organizations where id=submitted_id and private.can_read_organization(id);
  elsif submitted_type='organization_channel' then select o.campus_id,(o.visibility='network') into target_campus,global_scope from public.organization_channels c join public.organizations o on o.id=c.organization_id where c.id=submitted_id and private.organization_channel_permission(c.id,'view_channel');
  elsif submitted_type='organization_message' then select o.campus_id,(o.visibility='network') into target_campus,global_scope from public.organization_channel_messages m join public.organizations o on o.id=m.organization_id where m.id=submitted_id and private.organization_channel_permission(m.channel_id,'view_channel');
  elsif submitted_type='organization_role' then select o.campus_id,(o.visibility='network') into target_campus,global_scope from public.organization_roles r join public.organizations o on o.id=r.organization_id where r.id=submitted_id and private.organization_has_permission(r.organization_id,'view_organization');
  elsif submitted_type='organization_membership' then select o.campus_id,(o.visibility='network') into target_campus,global_scope from public.organization_memberships m join public.organizations o on o.id=m.organization_id where m.id=submitted_id and private.organization_has_permission(m.organization_id,'view_organization');
  elsif submitted_type='social_post' then select campus_id,(visibility='network') into target_campus,global_scope from public.social_posts where id=submitted_id and private.can_read_social_post(id);
  elsif submitted_type='social_comment' then select c.campus_id,(p.visibility='network') into target_campus,global_scope from public.social_comments c join public.social_posts p on p.id=c.post_id where c.id=submitted_id and private.can_read_social_post(p.id);
  elsif submitted_type='institution' then select id,false into target_campus,global_scope from public.campuses where id=submitted_id;
  elsif submitted_type='account_security' and submitted_id=caller then target_campus:=caller_campus; global_scope:=true;
  else raise exception 'unsupported target' using errcode='23514'; end if;
  if target_campus is null then raise exception 'target unavailable' using errcode='P0002'; end if;
  insert into public.reports(campus_id,subject_campus_id,platform_visible,reporter_id,target_type,target_id,reason,details,idempotency_key)
  values(target_campus,target_campus,global_scope,caller,submitted_type,submitted_id,submitted_reason,submitted_details,submitted_key)
  on conflict(reporter_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key returning id into report_id;
  return report_id;
end $$;

-- ---------------------------------------------------------------------------
-- Locked grants. SECURITY DEFINER implementations validate auth.uid(), scope,
-- status and authority before touching rows; no implementation is anonymous.
-- ---------------------------------------------------------------------------

revoke execute on function private.profile_field_visible(uuid,uuid,public.profile_visibility),private.profile_friend_count(uuid),private.profile_mutual_friend_count(uuid),private.seed_organization_workspace(uuid,uuid),private.organizations_seed_workspace(),private.sync_organization_builtin_role(),private.organization_has_permission(uuid,text,uuid),private.organization_channel_permission(uuid,text,uuid),private.organization_category_visible(uuid,uuid),private.audit_organization_membership_change(),private.create_moderation_case_from_report(),private.can_access_moderation_case(uuid,uuid),private.moderation_subject(uuid) from public,anon,authenticated;
grant execute on function private.profile_field_visible(uuid,uuid,public.profile_visibility),private.profile_friend_count(uuid),private.profile_mutual_friend_count(uuid),private.organization_has_permission(uuid,text,uuid),private.organization_channel_permission(uuid,text,uuid),private.organization_category_visible(uuid,uuid),private.can_access_moderation_case(uuid,uuid),private.moderation_subject(uuid) to authenticated,service_role;
revoke execute on function private.search_member_directory(text,text,integer),public.search_member_directory(text,text,integer) from public,anon;
grant execute on function private.search_member_directory(text,text,integer),public.search_member_directory(text,text,integer) to authenticated,service_role;
revoke execute on function public.safe_profile_by_username(text) from public,anon;
grant execute on function public.safe_profile_by_username(text) to authenticated;
revoke execute on function public.profile_organization_memberships(uuid),public.organization_member_directory(uuid),public.organization_membership_queue(uuid),public.organization_channel_capabilities(uuid),public.create_organization_category(uuid,text,integer,uuid),public.create_organization_channel(uuid,uuid,text,text,text,text,integer,uuid),public.set_organization_channel_role_override(uuid,uuid,boolean,boolean,boolean,boolean),public.send_organization_channel_message(uuid,uuid,text,uuid),public.manage_organization_channel_message(uuid,text,text,text),public.mark_organization_channel_read(uuid),public.assign_organization_role(uuid,uuid,uuid,text,text),public.create_organization_event(uuid,text,text,text,timestamptz,timestamptz,integer,public.content_visibility,uuid),public.manage_social_post(uuid,text,text),public.manage_social_comment(uuid,text,text),public.moderation_case_queue(text,text,text,uuid,uuid,integer),public.moderate_case(uuid,text,text,text,timestamptz),public.appealable_moderation_cases(),public.submit_moderation_appeal(uuid,text,uuid) from public,anon;
grant execute on function public.profile_organization_memberships(uuid),public.organization_member_directory(uuid),public.organization_membership_queue(uuid),public.organization_channel_capabilities(uuid),public.create_organization_category(uuid,text,integer,uuid),public.create_organization_channel(uuid,uuid,text,text,text,text,integer,uuid),public.set_organization_channel_role_override(uuid,uuid,boolean,boolean,boolean,boolean),public.send_organization_channel_message(uuid,uuid,text,uuid),public.manage_organization_channel_message(uuid,text,text,text),public.mark_organization_channel_read(uuid),public.assign_organization_role(uuid,uuid,uuid,text,text),public.create_organization_event(uuid,text,text,text,timestamptz,timestamptz,integer,public.content_visibility,uuid),public.manage_social_post(uuid,text,text),public.manage_social_comment(uuid,text,text),public.moderation_case_queue(text,text,text,uuid,uuid,integer),public.moderate_case(uuid,text,text,text,timestamptz),public.appealable_moderation_cases(),public.submit_moderation_appeal(uuid,text,uuid) to authenticated;
revoke execute on function public.organization_viewer_capabilities(uuid),public.manage_organization_role(uuid,uuid,text,text,text,integer,integer,text[]),public.set_organization_channel_member_override(uuid,uuid,boolean,boolean,boolean,boolean),public.organization_audit_history(uuid,bigint,integer),public.transfer_organization_ownership(uuid,uuid,text,uuid),public.resolve_moderation_appeal(uuid,text,uuid,text,text,boolean) from public,anon;
grant execute on function public.organization_viewer_capabilities(uuid),public.manage_organization_role(uuid,uuid,text,text,text,integer,integer,text[]),public.set_organization_channel_member_override(uuid,uuid,boolean,boolean,boolean,boolean),public.organization_audit_history(uuid,bigint,integer),public.transfer_organization_ownership(uuid,uuid,text,uuid),public.resolve_moderation_appeal(uuid,text,uuid,text,text,boolean) to authenticated;
grant usage on type public.moderation_case_status,public.moderation_severity to authenticated,service_role;

-- Operator and registration server paths use the service-role client. Keep
-- these grants narrow: campus lookup plus staff-invitation lifecycle only.
grant select on public.campuses to service_role;
grant select,insert,update,delete on public.staff_invitations to service_role;
