-- Keep previously delivered notifications on current App Router routes.
update public.notifications
set href = '/messages'
where href = '/messages/requests';

update public.notifications
set href = regexp_replace(
  href,
  '^/discussions/c/[a-z0-9_]{3,32}/posts/([0-9a-fA-F-]{36})',
  '/discussions/posts/\1'
)
where href ~ '^/discussions/c/[a-z0-9_]{3,32}/posts/[0-9a-fA-F-]{36}';

update public.notifications
set href = regexp_replace(
  href,
  '^/discussions/posts/([0-9a-fA-F-]{36})/comments/([0-9a-fA-F-]{36})$',
  '/discussions/posts/\1#discussion-comment-\2'
)
where href ~ '^/discussions/posts/[0-9a-fA-F-]{36}/comments/[0-9a-fA-F-]{36}$';

update public.notifications
set href = regexp_replace(href, '^/marketplace/([0-9a-fA-F-]{36})$', '/listings/\1')
where href ~ '^/marketplace/[0-9a-fA-F-]{36}$';

update public.notifications
set href = regexp_replace(href, '^/events/([0-9a-fA-F-]{36})$', '/events?event=\1#event-\1')
where href ~ '^/events/[0-9a-fA-F-]{36}$';

update public.notifications
set href = regexp_replace(href, '^/reports/([0-9a-fA-F-]{36})$', '/admin?report=\1')
where href ~ '^/reports/[0-9a-fA-F-]{36}$';

update public.notifications
set href = '/notifications?unavailable=1'
where href is not null and (
  href not like '/%'
  or href like '//%'
  or position(chr(92) in href) > 0
  or href ~ '[[:cntrl:]]'
);

alter table public.notifications drop constraint if exists notifications_href_internal;
alter table public.notifications add constraint notifications_href_internal check (
  href is null or (
    href like '/%'
    and href not like '//%'
    and position(chr(92) in href) = 0
    and href !~ '[[:cntrl:]]'
  )
);

create or replace function public.create_direct_conversation_request(target_profile uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  caller_campus uuid := public.current_campus_id();
  request_id uuid;
begin
  if not public.is_active_student() then raise exception 'active membership required' using errcode = '42501'; end if;
  if target_profile = caller then raise exception 'cannot request yourself' using errcode = '23514'; end if;
  if not exists(
    select 1 from public.profiles
    where id = target_profile and campus_id = caller_campus and status = 'active'
      and onboarding_completed_at is not null
      and (not public.auth_v2_enforced() or not password_setup_required)
      and (account_kind = 'staff' or (verified_until is not null and verified_until > now()))
  ) then raise exception 'profile unavailable' using errcode = 'P0002'; end if;
  if exists(
    select 1 from public.blocks
    where (blocker_id = caller and blocked_id = target_profile)
      or (blocker_id = target_profile and blocked_id = caller)
  ) then raise exception 'request blocked' using errcode = '42501'; end if;
  if exists(
    select 1 from public.conversations c
    join public.conversation_participants a on a.conversation_id = c.id and a.profile_id = caller
    join public.conversation_participants b on b.conversation_id = c.id and b.profile_id = target_profile
    where c.listing_id is null
  ) then raise exception 'conversation already exists' using errcode = '23505'; end if;
  insert into public.conversation_requests(campus_id, requester_id, recipient_id)
  values(caller_campus, caller, target_profile)
  returning id into request_id;
  insert into public.notifications(campus_id, profile_id, kind, title, body, href)
  values(caller_campus, target_profile, 'message_request', 'New conversation request', 'A verified campus member wants to message you.', '/messages');
  return request_id;
end $$;

create or replace function public.respond_to_conversation_request(target_request uuid, response text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  selected public.conversation_requests;
  conversation_id uuid;
begin
  if response not in ('accepted', 'declined') then raise exception 'invalid response' using errcode = '23514'; end if;
  select * into selected from public.conversation_requests
  where id = target_request and recipient_id = auth.uid() and status = 'pending' for update;
  if selected.id is null then raise exception 'request unavailable' using errcode = 'P0002'; end if;
  update public.conversation_requests set status = response::public.conversation_request_status, responded_at = now() where id = selected.id;
  if response = 'accepted' then
    insert into public.conversations(campus_id, created_by, request_id, direct_pair_key)
    values(
      selected.campus_id,
      selected.requester_id,
      selected.id,
      least(selected.requester_id::text, selected.recipient_id::text) || ':' || greatest(selected.requester_id::text, selected.recipient_id::text)
    ) returning id into conversation_id;
    insert into public.conversation_participants(conversation_id, profile_id, campus_id, last_read_at)
    values(conversation_id, selected.requester_id, selected.campus_id, now()),
          (conversation_id, selected.recipient_id, selected.campus_id, now());
    insert into public.notifications(campus_id, profile_id, kind, title, body, href)
    values(
      selected.campus_id,
      selected.requester_id,
      'message_request',
      'Conversation request accepted',
      'You can now start messaging.',
      '/messages?conversation=' || conversation_id::text
    );
  end if;
  return conversation_id;
end $$;
