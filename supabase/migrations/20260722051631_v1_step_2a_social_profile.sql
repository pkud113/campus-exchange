-- V1 Step 2A completes the existing social ownership surface without adding
-- new tables or bypassing the visibility predicate/RLS policies established in
-- 20260718191711_v1_social_foundations.sql.

create or replace function public.social_feed_filtered(
  before_created timestamptz default null,
  before_id uuid default null,
  result_limit integer default 20,
  selected_scope text default 'for_you',
  target_author uuid default null
)
returns setof public.social_posts
language sql
stable
security invoker
set search_path = ''
as $$
  select p
  from public.social_posts p
  where p.status = 'active'
    and (before_created is null or (p.created_at, p.id) < (before_created, before_id))
    and (
      target_author is null
      or (p.author_profile_id = target_author and p.organization_id is null)
    )
    and case selected_scope
      when 'for_you' then true
      when 'campus' then p.campus_id = public.current_campus_id()
      when 'friends' then private.are_friends((select auth.uid()), p.author_profile_id)
      when 'network' then p.visibility = 'network'
      else false
    end
  order by p.created_at desc, p.id desc
  limit least(greatest(result_limit, 1), 50)
$$;

create or replace function private.update_social_post(
  target_post uuid,
  submitted_body text,
  submitted_media uuid[],
  submitted_visibility public.social_visibility
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  selected public.social_posts;
  media_id uuid;
  media_position smallint := 0;
  current_media uuid[];
begin
  if not private.active_member(caller) then
    raise exception 'active membership required' using errcode = '42501';
  end if;

  select * into selected
  from public.social_posts
  where id = target_post and status = 'active'
  for update;

  if selected.id is null or selected.author_profile_id is distinct from caller then
    raise exception 'post unavailable' using errcode = 'P0002';
  end if;
  if selected.organization_id is not null and not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = selected.organization_id
      and m.profile_id = caller
      and m.status = 'active'
      and m.role in ('owner', 'administrator', 'officer')
  ) then
    raise exception 'organization posting permission required' using errcode = '42501';
  end if;
  if submitted_visibility = 'network' and not private.network_features_enabled() then
    raise exception 'network posts are unavailable' using errcode = '42501';
  end if;
  if selected.organization_id is not null and submitted_visibility = 'friends' then
    raise exception 'organization post visibility is unavailable' using errcode = '42501';
  end if;
  if selected.organization_id is not null and submitted_visibility = 'network' and not exists (
    select 1 from public.organizations o
    where o.id = selected.organization_id and o.status = 'active' and o.visibility = 'network'
  ) then
    raise exception 'organization post visibility is unavailable' using errcode = '42501';
  end if;
  if cardinality(coalesce(submitted_media, '{}'::uuid[])) > 4
    or cardinality(coalesce(submitted_media, '{}'::uuid[])) <> cardinality(array(select distinct unnest(coalesce(submitted_media, '{}'::uuid[])))) then
    raise exception 'invalid social media selection' using errcode = '23514';
  end if;

  select coalesce(array_agg(pm.media_id order by pm.position), '{}'::uuid[])
  into current_media
  from public.social_post_media pm
  where pm.post_id = target_post;

  foreach media_id in array coalesce(submitted_media, '{}'::uuid[]) loop
    if not exists (
      select 1 from public.media_uploads m
      where m.id = media_id
        and m.uploader_id = caller
        and m.campus_id = selected.campus_id
        and m.purpose = 'social_post'
        and m.status = 'ready'
        and (m.attached_at is null or media_id = any(current_media))
    ) then
      raise exception 'social media unavailable' using errcode = '42501';
    end if;
  end loop;

  delete from public.social_post_media where post_id = target_post;
  update public.media_uploads
  set attached_at = null
  where id = any(current_media) and not (id = any(coalesce(submitted_media, '{}'::uuid[])));

  foreach media_id in array coalesce(submitted_media, '{}'::uuid[]) loop
    insert into public.social_post_media(post_id, media_id, position)
    values(target_post, media_id, media_position);
    update public.media_uploads set attached_at = coalesce(attached_at, now()) where id = media_id;
    media_position := media_position + 1;
  end loop;

  update public.social_posts
  set body = btrim(submitted_body), visibility = submitted_visibility, edited_at = now()
  where id = target_post;
  return target_post;
end
$$;

create or replace function public.update_social_post(
  target_post uuid,
  submitted_body text,
  submitted_media uuid[],
  submitted_visibility public.social_visibility
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.update_social_post(target_post, submitted_body, submitted_media, submitted_visibility)
$$;

create or replace function private.delete_social_post(target_post uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  selected public.social_posts;
  deleted_id uuid;
begin
  if not private.active_member(caller) then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  select * into selected from public.social_posts where id = target_post and status = 'active' for update;
  if selected.id is null or selected.author_profile_id is distinct from caller then
    raise exception 'post unavailable' using errcode = 'P0002';
  end if;
  if selected.organization_id is not null and not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = selected.organization_id
      and m.profile_id = caller
      and m.status = 'active'
      and m.role in ('owner', 'administrator', 'officer')
  ) then
    raise exception 'organization posting permission required' using errcode = '42501';
  end if;
  update public.social_posts
  set status = 'deleted', deleted_at = now(), purge_after = now() + interval '30 days'
  where id = target_post
  returning id into deleted_id;
  if deleted_id is null then
    raise exception 'post unavailable' using errcode = 'P0002';
  end if;
  return deleted_id;
end
$$;

create or replace function public.delete_social_post(target_post uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.delete_social_post(target_post) $$;

create or replace function private.update_social_comment(target_comment uuid, submitted_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  selected public.social_comments;
begin
  if not private.active_member(caller) then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  select * into selected
  from public.social_comments
  where id = target_comment and deleted_at is null and removed_at is null
  for update;
  if selected.id is null or selected.author_profile_id is distinct from caller or not private.can_read_social_post(selected.post_id) then
    raise exception 'comment unavailable' using errcode = 'P0002';
  end if;
  update public.social_comments
  set body = btrim(submitted_body), edited_at = now()
  where id = target_comment;
  return target_comment;
end
$$;

create or replace function public.update_social_comment(target_comment uuid, submitted_body text)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.update_social_comment(target_comment, submitted_body) $$;

create or replace function private.delete_social_comment(target_comment uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  selected public.social_comments;
  total integer;
begin
  if not private.active_member(caller) then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  select * into selected
  from public.social_comments
  where id = target_comment and deleted_at is null and removed_at is null
  for update;
  if selected.id is null or selected.author_profile_id is distinct from caller then
    raise exception 'comment unavailable' using errcode = 'P0002';
  end if;
  update public.social_comments
  set body = null, deleted_at = now(), purge_after = now() + interval '30 days'
  where id = target_comment;
  select count(*)::integer into total
  from public.social_comments
  where post_id = selected.post_id and deleted_at is null and removed_at is null;
  update public.social_posts set comment_count = total where id = selected.post_id;
  return target_comment;
end
$$;

create or replace function public.delete_social_comment(target_comment uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.delete_social_comment(target_comment) $$;

revoke execute on function private.update_social_post(uuid, text, uuid[], public.social_visibility),
  private.delete_social_post(uuid), private.update_social_comment(uuid, text),
  private.delete_social_comment(uuid) from public, anon, authenticated;
grant execute on function private.update_social_post(uuid, text, uuid[], public.social_visibility),
  private.delete_social_post(uuid), private.update_social_comment(uuid, text),
  private.delete_social_comment(uuid) to authenticated, service_role;

revoke execute on function public.social_feed_filtered(timestamptz, uuid, integer, text, uuid),
  public.update_social_post(uuid, text, uuid[], public.social_visibility),
  public.delete_social_post(uuid), public.update_social_comment(uuid, text),
  public.delete_social_comment(uuid) from public, anon;
grant execute on function public.social_feed_filtered(timestamptz, uuid, integer, text, uuid),
  public.update_social_post(uuid, text, uuid[], public.social_visibility),
  public.delete_social_post(uuid), public.update_social_comment(uuid, text),
  public.delete_social_comment(uuid) to authenticated, service_role;
