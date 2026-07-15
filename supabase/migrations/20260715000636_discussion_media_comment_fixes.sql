-- Repair Discussions media grants, make post content combinations explicit,
-- support atomic image replacement, and publish comment changes for Realtime.

alter table public.media_uploads
  drop constraint if exists media_upload_target;

-- The private upload PUT route reads the caller's pending grant through the
-- authenticated client. RLS still limits this grant to same-campus ready rows
-- or rows owned by the current uploader.
grant select on table public.media_uploads to authenticated;

alter table public.discussion_posts
  drop constraint if exists discussion_posts_check;
alter table public.discussion_posts
  drop constraint if exists discussion_posts_content_check;
alter table public.discussion_posts
  add constraint discussion_posts_content_check check (
    deleted_at is not null
    or removed_at is not null
    or (
      title is not null
      and char_length(trim(title)) between 3 and 300
      and (
        (
          post_type = 'text'
          and body is not null
          and char_length(trim(body)) > 0
          and link_url is null
          and media_id is null
        )
        or (
          post_type = 'link'
          and link_url is not null
          and link_url ~ '^https://[^[:space:]]+$'
          and media_id is null
        )
        or (
          post_type = 'image'
          and media_id is not null
          and link_url is null
        )
      )
    )
  );

drop function if exists public.update_discussion_post(uuid, text, text, text);
drop function if exists private.update_discussion_post(uuid, text, text, text);

create function private.update_discussion_post(
  target_post uuid,
  submitted_title text,
  submitted_body text,
  submitted_link text,
  submitted_media uuid
) returns public.discussion_posts
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  selected public.discussion_posts;
  community public.discussion_communities;
  replacement public.media_uploads;
  previous_media uuid;
begin
  select * into selected
  from public.discussion_posts
  where id = target_post and campus_id = public.current_campus_id()
  for update;

  if selected.id is null then
    raise exception 'post unavailable' using errcode = 'P0002';
  end if;

  select * into community
  from public.discussion_communities
  where id = selected.community_id;

  if selected.author_id is distinct from caller
    or selected.deleted_at is not null
    or selected.removed_at is not null
    or community.status <> 'active' then
    raise exception 'post cannot be edited' using errcode = '42501';
  end if;

  if char_length(trim(coalesce(submitted_title, ''))) < 3 then
    raise exception 'post title is required' using errcode = '23514';
  end if;

  if selected.post_type = 'text' then
    if char_length(trim(coalesce(submitted_body, ''))) = 0 then
      raise exception 'text posts require a body' using errcode = '23514';
    end if;
    if submitted_link is not null or submitted_media is not null then
      raise exception 'text posts cannot include link or image targets' using errcode = '23514';
    end if;
  elsif selected.post_type = 'link' then
    if coalesce(submitted_link, '') !~ '^https://[^[:space:]]+$' then
      raise exception 'link posts require an HTTPS URL' using errcode = '23514';
    end if;
    if submitted_media is not null then
      raise exception 'link posts cannot include image targets' using errcode = '23514';
    end if;
  else
    if submitted_media is null then
      raise exception 'image posts require uploaded media' using errcode = '23514';
    end if;
    if submitted_link is not null then
      raise exception 'image posts cannot include link targets' using errcode = '23514';
    end if;
    if submitted_media is distinct from selected.media_id then
      select * into replacement
      from public.media_uploads
      where id = submitted_media
        and campus_id = selected.campus_id
        and uploader_id = caller
        and purpose = 'discussion_post'
        and status = 'ready'
        and attached_at is null
        and discussion_post_id is null
      for update;
      if replacement.id is null then
        raise exception 'owned ready discussion media required' using errcode = '42501';
      end if;
    end if;
  end if;

  previous_media := selected.media_id;
  update public.discussion_posts set
    title = trim(submitted_title),
    body = nullif(trim(coalesce(submitted_body, '')), ''),
    link_url = case when post_type = 'link' then trim(submitted_link) else null end,
    media_id = case when post_type = 'image' then submitted_media else null end,
    edited_at = now()
  where id = target_post
  returning * into selected;

  if selected.post_type = 'image' and submitted_media is distinct from previous_media then
    update public.media_uploads set
      discussion_post_id = selected.id,
      attached_at = now()
    where id = submitted_media;

    if previous_media is not null then
      update public.media_uploads set
        status = 'deleted',
        deleted_at = now(),
        purge_after = now() + interval '30 days'
      where id = previous_media
        and discussion_post_id = selected.id;
    end if;
  end if;

  return selected;
end $$;

create function public.update_discussion_post(
  target_post uuid,
  submitted_title text,
  submitted_body text,
  submitted_link text,
  submitted_media uuid
) returns public.discussion_posts
language sql security invoker set search_path = '' as $$
  select private.update_discussion_post(
    target_post,
    submitted_title,
    submitted_body,
    submitted_link,
    submitted_media
  )
$$;

revoke execute on function private.update_discussion_post(uuid, text, text, text, uuid)
  from public, anon;
grant execute on function private.update_discussion_post(uuid, text, text, text, uuid)
  to authenticated, service_role;
revoke execute on function public.update_discussion_post(uuid, text, text, text, uuid)
  from public, anon;
grant execute on function public.update_discussion_post(uuid, text, text, text, uuid)
  to authenticated, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'discussion_comments'
  ) then
    alter publication supabase_realtime add table public.discussion_comments;
  end if;
end $$;

notify pgrst, 'reload schema';
