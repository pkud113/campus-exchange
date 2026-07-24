-- Step 2C social boxes, organization reactions, institution-scoped discovery,
-- and normalized notification delivery preferences.

create table public.conversation_request_status_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.conversation_requests(id) on delete cascade,
  status public.conversation_request_status not null,
  changed_by uuid references public.profiles(id) on delete set null,
  reason text check (reason is null or char_length(reason) between 3 and 500),
  created_at timestamptz not null default now()
);
create index conversation_request_status_history_request_idx
  on public.conversation_request_status_history(request_id,created_at,id);

insert into public.conversation_request_status_history(request_id,status,changed_by,reason,created_at)
select id,status,requester_id,'initial request',created_at
from public.conversation_requests;

create or replace function private.record_conversation_request_status()
returns trigger
language plpgsql security definer
set search_path='' as $$
begin
  if new.status is distinct from old.status then
    insert into public.conversation_request_status_history(request_id,status,changed_by,reason)
    values(new.id,new.status,(select auth.uid()),coalesce(new.unavailable_reason,'status updated'));
  end if;
  return new;
end $$;

create trigger conversation_request_status_history_capture
after update of status on public.conversation_requests
for each row execute function private.record_conversation_request_status();

alter table public.conversation_request_status_history enable row level security;
create policy conversation_request_history_participant_read
on public.conversation_request_status_history
for select to authenticated
using (exists(
  select 1 from public.conversation_requests r
  where r.id=request_id and (select auth.uid()) in (r.requester_id,r.recipient_id)
));
revoke all on public.conversation_request_status_history from public,anon,authenticated;
grant select on public.conversation_request_status_history to authenticated;
grant all on public.conversation_request_status_history to service_role;

create table public.organization_channel_message_reactions (
  message_id uuid not null references public.organization_channel_messages(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null references public.organization_channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji=btrim(emoji) and char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key(message_id,profile_id,emoji)
);
create index organization_message_reactions_summary_idx
  on public.organization_channel_message_reactions(message_id,emoji);

alter table public.organization_channel_message_reactions enable row level security;
create policy organization_message_reactions_channel_read
on public.organization_channel_message_reactions
for select to authenticated
using (private.organization_channel_permission(channel_id,'view_channel'));
revoke all on public.organization_channel_message_reactions from public,anon,authenticated;
grant select on public.organization_channel_message_reactions to authenticated;
grant all on public.organization_channel_message_reactions to service_role;

do $$
begin
  if not exists(
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='organization_channel_message_reactions'
  ) then
    alter publication supabase_realtime add table public.organization_channel_message_reactions;
  end if;
end $$;

create table public.notification_category_preferences (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category public.notification_category not null,
  in_app boolean not null default true,
  email boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(profile_id,category),
  check (category not in ('moderation_activity','security_activity') or in_app)
);
create trigger notification_category_preferences_touch
before update on public.notification_category_preferences
for each row execute function public.touch_updated_at();

insert into public.notification_category_preferences(profile_id,category,in_app,email)
select p.id,c.category,true,
  case
    when c.category in ('message','message_request') then coalesce(n.email_messages,true)
    when c.category='discussion_activity' then coalesce(n.email_discussions,true)
    else false
  end
from public.profiles p
cross join unnest(enum_range(null::public.notification_category)) c(category)
left join public.notification_preferences n on n.profile_id=p.id
on conflict (profile_id,category) do nothing;

alter table public.notification_category_preferences enable row level security;
create policy notification_category_preferences_self_read
on public.notification_category_preferences
for select to authenticated
using (profile_id=(select auth.uid()));
create policy notification_category_preferences_self_insert
on public.notification_category_preferences
for insert to authenticated
with check (
  profile_id=(select auth.uid())
  and (category not in ('moderation_activity','security_activity') or in_app)
);
create policy notification_category_preferences_self_update
on public.notification_category_preferences
for update to authenticated
using (profile_id=(select auth.uid()))
with check (
  profile_id=(select auth.uid())
  and (category not in ('moderation_activity','security_activity') or in_app)
);
revoke all on public.notification_category_preferences from public,anon,authenticated;
grant select,insert,update on public.notification_category_preferences to authenticated;
grant all on public.notification_category_preferences to service_role;

create or replace function private.mutual_friend_preview(target_profile uuid)
returns jsonb
language sql stable security definer
set search_path='' as $$
  with viewer_friends as (
    select case when f.profile_low_id=(select auth.uid()) then f.profile_high_id else f.profile_low_id end id
    from public.friend_relationships f
    where f.status='accepted' and (select auth.uid()) in (f.profile_low_id,f.profile_high_id)
  ), target_friends as (
    select case when f.profile_low_id=target_profile then f.profile_high_id else f.profile_low_id end id
    from public.friend_relationships f
    where f.status='accepted' and target_profile in (f.profile_low_id,f.profile_high_id)
  ), visible as (
    select p.id,p.handle::text handle,p.display_name,p.avatar_media_id,c.id campus_id,
      c.name campus_name,c.short_name campus_short_name,c.slug::text campus_slug
    from viewer_friends v
    join target_friends t using(id)
    join public.profiles p on p.id=v.id
    join public.campuses c on c.id=p.campus_id
    join public.profiles target on target.id=target_profile
    where private.active_member(p.id)
      and not private.block_exists((select auth.uid()),p.id)
      and private.profile_field_visible(
        target.id,target.campus_id,target.friend_list_visibility
      )
      and private.profile_field_visible(p.id,p.campus_id,p.profile_visibility)
    order by coalesce(p.display_name,p.handle::text),p.id
    limit 3
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'username',handle,'displayName',display_name,'avatarMediaId',avatar_media_id,
    'campus',jsonb_build_object(
      'id',campus_id,'name',campus_name,'shortName',campus_short_name,'slug',campus_slug
    )
  )),'[]'::jsonb) from visible
$$;

create or replace function public.friend_box_v2(
  requested_box text default 'all',
  after_cursor uuid default null,
  result_limit integer default 20
)
returns jsonb
language plpgsql stable security definer
set search_path='' as $$
declare caller uuid:=(select auth.uid());
declare take integer:=greatest(1,least(coalesce(result_limit,20),50));
declare items jsonb;
declare counts jsonb;
declare next_cursor text;
begin
  if not private.active_member(caller) then
    raise exception 'active membership required' using errcode='42501';
  end if;
  if requested_box not in ('all','incoming','sent') then
    raise exception 'invalid friend box' using errcode='23514';
  end if;

  with cursor_row as (
    select updated_at,id from public.friend_relationships where id=after_cursor
  ), page as (
    select f.*,
      case when f.profile_low_id=caller then f.profile_high_id else f.profile_low_id end other_id
    from public.friend_relationships f
    where caller in (f.profile_low_id,f.profile_high_id)
      and (
        (requested_box='all' and f.status='accepted')
        or (requested_box='incoming' and f.status='pending' and f.requested_by<>caller)
        or (requested_box='sent' and f.status='pending' and f.requested_by=caller)
      )
      and (
        after_cursor is null
        or (f.updated_at,f.id)<(
          (select updated_at from cursor_row),(select id from cursor_row)
        )
      )
    order by f.updated_at desc,f.id desc
    limit take
  ), visible as (
    select page.*,p.handle::text handle,p.display_name,p.avatar_media_id,
      c.id campus_id,c.name campus_name,c.short_name campus_short_name,c.slug::text campus_slug
    from page
    join public.profiles p on p.id=page.other_id
    join public.campuses c on c.id=p.campus_id
    where private.active_member(p.id) and not private.block_exists(caller,p.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'relationshipId',id,
    'direction',case when status='accepted' then 'friend'
      when requested_by=caller then 'sent' else 'incoming' end,
    'status',status,
    'updatedAt',updated_at,
    'profile',jsonb_build_object(
      'id',other_id,'username',handle,'displayName',display_name,'avatarMediaId',avatar_media_id,
      'campus',jsonb_build_object(
        'id',campus_id,'name',campus_name,'shortName',campus_short_name,'slug',campus_slug
      ),
      'mutualFriendCount',private.profile_mutual_friend_count(other_id)
    ),
    'mutualPreview',private.mutual_friend_preview(other_id)
  ) order by updated_at desc,id desc),'[]'::jsonb)
  into items from visible;

  select jsonb_build_object(
    'all',count(*) filter(where status='accepted'),
    'incoming',count(*) filter(where status='pending' and requested_by<>caller),
    'sent',count(*) filter(where status='pending' and requested_by=caller)
  ) into counts
  from public.friend_relationships
  where caller in (profile_low_id,profile_high_id);

  if jsonb_array_length(items)=take then
    next_cursor:=items->(jsonb_array_length(items)-1)->>'relationshipId';
  end if;
  return jsonb_build_object('items',items,'counts',counts,'nextCursor',next_cursor);
end $$;

revoke all on function public.friend_box_v2(text,uuid,integer) from public,anon;
grant execute on function public.friend_box_v2(text,uuid,integer) to authenticated;

create or replace function public.conversation_request_box_v2(
  requested_box text default 'incoming',
  after_cursor uuid default null,
  result_limit integer default 20
)
returns jsonb
language plpgsql stable security definer
set search_path='' as $$
declare caller uuid:=(select auth.uid());
declare take integer:=greatest(1,least(coalesce(result_limit,20),50));
declare items jsonb;
declare counts jsonb;
declare next_cursor text;
begin
  if not private.active_member(caller) then
    raise exception 'active membership required' using errcode='42501';
  end if;
  if requested_box not in ('incoming','sent') then
    raise exception 'invalid request box' using errcode='23514';
  end if;
  with cursor_row as (
    select created_at,id from public.conversation_requests where id=after_cursor
  ), page as (
    select r.*,
      case when requested_box='incoming' then r.requester_id else r.recipient_id end other_id
    from public.conversation_requests r
    where (
      (requested_box='incoming' and r.recipient_id=caller)
      or (requested_box='sent' and r.requester_id=caller)
    )
      and r.opening_message is not null
      and r.created_at>now()-interval '180 days'
      and (
        after_cursor is null
        or (r.created_at,r.id)<(
          (select created_at from cursor_row),(select id from cursor_row)
        )
      )
    order by r.created_at desc,r.id desc
    limit take
  ), visible as (
    select page.*,p.handle::text handle,p.display_name,p.avatar_media_id,
      c.id other_campus_id,c.name campus_name,c.short_name campus_short_name,c.slug::text campus_slug
    from page
    join public.profiles p on p.id=page.other_id
    join public.campuses c on c.id=p.campus_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'conversationId',id,
    'direction',requested_box,
    'status',case when requested_box='sent' and status in ('declined','cancelled')
      then 'unavailable' else status::text end,
    'openingMessage',opening_message,
    'createdAt',created_at,
    'updatedAt',updated_at,
    'counterpart',jsonb_build_object(
      'id',other_id,'username',handle,'displayName',display_name,'avatarMediaId',avatar_media_id,
      'campus',jsonb_build_object(
        'id',other_campus_id,'name',campus_name,'shortName',campus_short_name,'slug',campus_slug
      )
    ),
    'context',case
      when context_type='listing' then jsonb_build_object(
        'kind','listing','id',listing_id,'href','/listings/'||listing_id::text
      )
      when context_type='event' then jsonb_build_object(
        'kind','event','id',event_id,'href','/events?event='||event_id::text
      )
      else null
    end,
    'history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'status',case when requested_box='sent' and h.status in ('declined','cancelled')
          then 'unavailable' else h.status::text end,
        'at',h.created_at
      ) order by h.created_at,h.id)
      from public.conversation_request_status_history h where h.request_id=visible.id
    ),'[]'::jsonb)
  ) order by created_at desc,id desc),'[]'::jsonb)
  into items from visible;

  select jsonb_build_object(
    'incoming',count(*) filter(where recipient_id=caller and status='pending'),
    'sent',count(*) filter(where requester_id=caller and status='pending'),
    'pending',count(*) filter(where caller in (requester_id,recipient_id) and status='pending')
  ) into counts
  from public.conversation_requests
  where caller in (requester_id,recipient_id);
  if jsonb_array_length(items)=take then
    next_cursor:=items->(jsonb_array_length(items)-1)->>'conversationId';
  end if;
  return jsonb_build_object('items',items,'counts',counts,'nextCursor',next_cursor);
end $$;

revoke all on function public.conversation_request_box_v2(text,uuid,integer)
  from public,anon;
grant execute on function public.conversation_request_box_v2(text,uuid,integer)
  to authenticated;

create or replace function public.organization_message_reaction_summary(target_message uuid)
returns jsonb
language sql stable security definer
set search_path='' as $$
  select case
    when not exists(
      select 1 from public.organization_channel_messages m
      where m.id=target_message
        and private.organization_channel_permission(m.channel_id,'view_channel')
    ) then '[]'::jsonb
    else coalesce((
      select jsonb_agg(jsonb_build_object(
        'emoji',r.emoji,
        'count',r.total,
        'reactedByViewer',r.viewer_reacted
      ) order by r.total desc,r.emoji)
      from (
        select emoji,count(*) total,bool_or(profile_id=(select auth.uid())) viewer_reacted
        from public.organization_channel_message_reactions
        where message_id=target_message group by emoji
      ) r
    ),'[]'::jsonb)
  end
$$;

create or replace function public.toggle_organization_message_reaction(
  target_message uuid,
  selected_emoji text
)
returns jsonb
language plpgsql security definer
set search_path='' as $$
declare caller uuid:=(select auth.uid());
declare selected public.organization_channel_messages;
declare normalized_emoji text:=btrim(selected_emoji);
declare added boolean;
begin
  if normalized_emoji not in ('👍','❤️','😂','🎉','👀','🙌','✅','❓') then
    raise exception 'unsupported reaction' using errcode='23514';
  end if;
  select * into selected from public.organization_channel_messages
    where id=target_message and deleted_at is null for share;
  if selected.id is null
    or not private.organization_channel_permission(selected.channel_id,'view_channel') then
    raise exception 'message unavailable' using errcode='P0002';
  end if;
  if exists(
    select 1 from public.organization_channel_message_reactions
    where message_id=selected.id and profile_id=caller and emoji=normalized_emoji
  ) then
    delete from public.organization_channel_message_reactions
    where message_id=selected.id and profile_id=caller and emoji=normalized_emoji;
    added:=false;
  else
    insert into public.organization_channel_message_reactions(
      message_id,organization_id,channel_id,profile_id,emoji
    ) values(selected.id,selected.organization_id,selected.channel_id,caller,normalized_emoji);
    added:=true;
    if selected.author_profile_id is not null and selected.author_profile_id<>caller then
      insert into public.outbox_events(
        campus_id,event_type,aggregate_id,payload,idempotency_key
      )
      select o.campus_id,'organization.channel_reaction',selected.id,
        jsonb_build_object(
          'recipientId',selected.author_profile_id,'actorId',caller,
          'organizationId',selected.organization_id,'channelId',selected.channel_id,
          'messageId',selected.id,'emoji',normalized_emoji
        ),
        'organization-message-reaction:'||selected.id||':'||caller||':'||encode(
          extensions.digest(normalized_emoji,'sha256'),'hex'
        )
      from public.organizations o where o.id=selected.organization_id
      on conflict(idempotency_key) do nothing;
    end if;
  end if;
  return jsonb_build_object(
    'added',added,
    'reactions',public.organization_message_reaction_summary(selected.id)
  );
end $$;

revoke all on function public.organization_message_reaction_summary(uuid),
  public.toggle_organization_message_reaction(uuid,text)
from public,anon;
grant execute on function public.organization_message_reaction_summary(uuid),
  public.toggle_organization_message_reaction(uuid,text)
to authenticated;

create or replace function public.notification_delivery_decision(
  target_profile uuid,
  target_category public.notification_category,
  target_organization uuid default null,
  decision_time timestamptz default now()
)
returns table(in_app boolean,email boolean,suppressed_reason text)
language plpgsql stable security definer
set search_path='' as $$
declare category_preference public.notification_category_preferences;
declare legacy_preference public.notification_preferences;
declare organization_preference public.organization_notification_preferences;
declare campus_timezone text;
declare local_hour integer;
declare selected_in_app boolean:=true;
declare selected_email boolean:=false;
begin
  select * into category_preference from public.notification_category_preferences
    where profile_id=target_profile and category=target_category;
  select * into legacy_preference from public.notification_preferences
    where profile_id=target_profile;
  if category_preference.profile_id is not null then
    selected_in_app:=category_preference.in_app;
    selected_email:=category_preference.email;
  elsif target_category in ('message','message_request') then
    selected_email:=coalesce(legacy_preference.email_messages,true);
  elsif target_category='discussion_activity' then
    selected_email:=coalesce(legacy_preference.email_discussions,true);
  end if;
  if target_category in ('moderation_activity','security_activity') then
    selected_in_app:=true;
  end if;

  if target_organization is not null then
    select * into organization_preference
    from public.organization_notification_preferences
    where organization_id=target_organization and profile_id=target_profile;
    if organization_preference.profile_id is not null then
      if organization_preference.muted_until>decision_time then
        return query select false,false,'organization_muted'::text;
        return;
      end if;
      if target_category='organization_membership'
        and not organization_preference.membership_changes then
        return query select false,false,'organization_membership_disabled'::text;
        return;
      end if;
    end if;
  end if;

  select c.timezone into campus_timezone
  from public.profiles p join public.campuses c on c.id=p.campus_id
  where p.id=target_profile;
  if legacy_preference.quiet_hours_start is not null then
    local_hour:=extract(hour from decision_time at time zone campus_timezone);
    if (
      legacy_preference.quiet_hours_start<legacy_preference.quiet_hours_end
      and local_hour>=legacy_preference.quiet_hours_start
      and local_hour<legacy_preference.quiet_hours_end
    ) or (
      legacy_preference.quiet_hours_start>legacy_preference.quiet_hours_end
      and (
        local_hour>=legacy_preference.quiet_hours_start
        or local_hour<legacy_preference.quiet_hours_end
      )
    ) then
      return query select selected_in_app,false,'quiet_hours'::text;
      return;
    end if;
  end if;
  return query select selected_in_app,selected_email,null::text;
end $$;

revoke all on function public.notification_delivery_decision(
  uuid,public.notification_category,uuid,timestamptz
) from public,anon,authenticated;
grant execute on function public.notification_delivery_decision(
  uuid,public.notification_category,uuid,timestamptz
) to service_role;

create or replace function public.search_member_directory_v2(
  search_term text default '',
  institution_filter text default 'my',
  after_profile uuid default null,
  result_limit integer default 20
)
returns table(
  id uuid,handle text,display_name text,avatar_media_id uuid,
  campus_id uuid,campus_name text,campus_short_name text,campus_slug text,
  institution_id text,joined_month date,relationship_status text,
  relationship_requested_by uuid,mutual_friend_count integer
)
language sql stable security definer
set search_path='' as $$
  with selected as (
    select case
      when institution_filter='my' then public.current_campus_id()
      when institution_filter='all' then null
      else (select i.campus_id from public.institution_directory i where i.id=institution_filter)
    end campus_id
  )
  select p.id,p.handle::text,p.display_name,p.avatar_media_id,p.campus_id,
    c.name,c.short_name,c.slug::text,i.id,date_trunc('month',p.created_at)::date,
    case when p.id=(select auth.uid()) then 'self' else coalesce(f.status::text,'none') end,
    f.requested_by,private.profile_mutual_friend_count(p.id)
  from public.profiles p
  join public.campuses c on c.id=p.campus_id
  left join public.institution_directory i on i.campus_id=c.id
  left join public.friend_relationships f
    on f.profile_low_id=least(p.id,(select auth.uid()))
    and f.profile_high_id=greatest(p.id,(select auth.uid()))
  cross join selected
  where private.active_member((select auth.uid()))
    and private.active_member(p.id)
    and not private.block_exists((select auth.uid()),p.id)
    and (
      institution_filter='all'
      or (selected.campus_id is not null and p.campus_id=selected.campus_id)
    )
    and (
      trim(search_term)=''
      or p.handle::text ilike '%'||trim(search_term)||'%'
      or coalesce(p.display_name,'') ilike '%'||trim(search_term)||'%'
    )
    and private.profile_field_visible(p.id,p.campus_id,p.profile_visibility)
    and (after_profile is null or p.id>after_profile)
  order by p.id
  limit least(greatest(coalesce(result_limit,20),1),50)
$$;

revoke all on function public.search_member_directory_v2(text,text,uuid,integer)
  from public,anon;
grant execute on function public.search_member_directory_v2(text,text,uuid,integer)
  to authenticated;

create or replace function public.unified_search_v2(
  search_term text,
  institution_filter text default 'my',
  type_filters text[] default null,
  before_created timestamptz default null,
  before_id uuid default null,
  result_limit integer default 20
)
returns table(
  kind text,id uuid,title text,subtitle text,href text,image_media_id uuid,
  campus_slug text,campus_short_name text,institution_id text,
  visibility text,occurred_at timestamptz
)
language sql stable security definer
set search_path='' as $$
  with selected as (
    select case
      when institution_filter='my' then public.current_campus_id()
      when institution_filter='all' then null
      else (select i.campus_id from public.institution_directory i where i.id=institution_filter)
    end campus_id
  ), hits(kind,id,title,subtitle,href,image_media_id,campus_slug,campus_short_name,institution_id,visibility,occurred_at) as (
    select 'profile'::text,p.id,coalesce(p.display_name,p.handle::text),
      '@'||p.handle::text,'/u/'||p.handle::text,p.avatar_media_id,c.slug::text,c.short_name,
      i.id,p.profile_visibility::text,p.updated_at
    from public.profiles p
    join public.campuses c on c.id=p.campus_id
    left join public.institution_directory i on i.campus_id=c.id
    cross join selected
    where (type_filters is null or 'profile'=any(type_filters))
      and (institution_filter='all' or p.campus_id=selected.campus_id)
      and private.active_member(p.id)
      and not private.block_exists((select auth.uid()),p.id)
      and private.profile_field_visible(p.id,p.campus_id,p.profile_visibility)
      and (
        p.handle::text ilike '%'||search_term||'%'
        or coalesce(p.display_name,'') ilike '%'||search_term||'%'
      )
    union all
    select 'listing',l.id,l.title,c.short_name,'/listings/'||l.id,null::uuid,
      c.slug::text,c.short_name,i.id,l.visibility::text,l.created_at
    from public.listings l
    join public.campuses c on c.id=l.campus_id
    left join public.institution_directory i on i.campus_id=c.id
    cross join selected
    where (type_filters is null or 'listing'=any(type_filters))
      and (institution_filter='all' or l.campus_id=selected.campus_id)
      and l.deleted_at is null and l.status in ('active','reserved','sold')
      and private.content_is_visible(l.campus_id,l.visibility)
      and (
        l.search_vector@@websearch_to_tsquery('english',search_term)
        or l.title ilike '%'||search_term||'%'
      )
    union all
    select 'organization',o.id,o.name,c.short_name,'/organizations/'||o.slug::text,
      o.avatar_media_id,c.slug::text,c.short_name,i.id,o.visibility::text,o.created_at
    from public.organizations o
    join public.campuses c on c.id=o.campus_id
    left join public.institution_directory i on i.campus_id=c.id
    cross join selected
    where (type_filters is null or 'organization'=any(type_filters))
      and (institution_filter='all' or o.campus_id=selected.campus_id)
      and private.can_read_organization(o.id)
      and (
        to_tsvector('english',o.name||' '||o.description)
          @@websearch_to_tsquery('english',search_term)
        or o.name ilike '%'||search_term||'%'
      )
    union all
    select 'event',e.id,e.title,c.short_name,'/events?event='||e.id,null::uuid,
      c.slug::text,c.short_name,i.id,e.visibility::text,e.created_at
    from public.events e
    join public.campuses c on c.id=e.campus_id
    left join public.institution_directory i on i.campus_id=c.id
    cross join selected
    where (type_filters is null or 'event'=any(type_filters))
      and (institution_filter='all' or e.campus_id=selected.campus_id)
      and e.deleted_at is null and e.cancelled_at is null
      and private.content_is_visible(e.campus_id,e.visibility)
      and (e.title ilike '%'||search_term||'%' or e.description ilike '%'||search_term||'%')
    union all
    select 'community',d.id,d.display_name,c.short_name,'/discussions/c/'||d.slug,
      null::uuid,c.slug::text,c.short_name,i.id,'campus_only',d.created_at
    from public.discussion_communities d
    join public.campuses c on c.id=d.campus_id
    left join public.institution_directory i on i.campus_id=c.id
    cross join selected
    where (type_filters is null or 'community'=any(type_filters))
      and d.campus_id=public.current_campus_id()
      and (institution_filter='all' or d.campus_id=selected.campus_id)
      and d.deleted_at is null and d.status='active'
      and (
        d.display_name ilike '%'||search_term||'%'
        or d.description ilike '%'||search_term||'%'
      )
    union all
    select 'social_post',s.id,left(s.body,80),coalesce(o.name,p.display_name,p.handle::text),
      '/social?post='||s.id,null::uuid,c.slug::text,c.short_name,i.id,s.visibility::text,s.created_at
    from public.social_posts s
    join public.profiles p on p.id=s.author_profile_id
    join public.campuses c on c.id=s.campus_id
    left join public.institution_directory i on i.campus_id=c.id
    left join public.organizations o on o.id=s.organization_id
    cross join selected
    where (type_filters is null or 'social_post'=any(type_filters))
      and (institution_filter='all' or s.campus_id=selected.campus_id)
      and private.can_read_social_post(s.id)
      and s.search_vector@@websearch_to_tsquery('english',search_term)
  )
  select * from hits
  where before_created is null or (occurred_at,id)<(before_created,before_id)
  order by occurred_at desc,id desc
  limit least(greatest(coalesce(result_limit,20),1),50)
$$;

revoke all on function public.unified_search_v2(
  text,text,text[],timestamptz,uuid,integer
) from public,anon;
grant execute on function public.unified_search_v2(
  text,text,text[],timestamptz,uuid,integer
) to authenticated;

do $$
begin
  if exists(
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public'
      and c.relname in (
        'conversation_request_status_history',
        'organization_channel_message_reactions',
        'notification_category_preferences'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'Step 2C social tables must retain RLS';
  end if;
  if has_table_privilege(
    'authenticated','public.organization_channel_message_reactions','INSERT'
  ) then
    raise exception 'organization reactions must use the toggle RPC';
  end if;
  if exists(
    select 1 from public.notification_category_preferences
    where category in ('moderation_activity','security_activity') and not in_app
  ) then
    raise exception 'mandatory notification categories cannot be disabled';
  end if;
end $$;
