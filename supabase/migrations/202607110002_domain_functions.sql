create or replace function public.create_listing_conversation(target_listing uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare listing public.listings; conversation_id uuid; caller uuid := auth.uid();
begin
  select * into listing from public.listings where id=target_listing and campus_id=public.current_campus_id() and status in ('active','reserved');
  if listing.id is null then raise exception 'listing unavailable' using errcode='P0002'; end if;
  if caller = listing.seller_id then raise exception 'seller cannot message self' using errcode='23514'; end if;
  if exists(select 1 from public.blocks where (blocker_id=caller and blocked_id=listing.seller_id) or (blocker_id=listing.seller_id and blocked_id=caller)) then raise exception 'conversation blocked' using errcode='42501'; end if;
  select c.id into conversation_id from public.conversations c
    join public.conversation_participants a on a.conversation_id=c.id and a.profile_id=caller
    join public.conversation_participants b on b.conversation_id=c.id and b.profile_id=listing.seller_id
    where c.listing_id=target_listing limit 1;
  if conversation_id is not null then return conversation_id; end if;
  insert into public.conversations(campus_id,listing_id,created_by) values(listing.campus_id,listing.id,caller) returning id into conversation_id;
  insert into public.conversation_participants(conversation_id,profile_id,campus_id) values
    (conversation_id,caller,listing.campus_id),(conversation_id,listing.seller_id,listing.campus_id);
  return conversation_id;
end $$;
grant execute on function public.create_listing_conversation(uuid) to authenticated;

create or replace function public.rsvp_to_event(target_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.events; attendee_count integer;
begin
  select * into selected from public.events where id=target_event and campus_id=public.current_campus_id() and cancelled_at is null and starts_at > now() for update;
  if selected.id is null then raise exception 'event unavailable' using errcode='P0002'; end if;
  select count(*) into attendee_count from public.event_rsvps where event_id=target_event;
  if selected.capacity is not null and attendee_count >= selected.capacity then raise exception 'event is full' using errcode='23514'; end if;
  insert into public.event_rsvps(event_id,profile_id,campus_id) values(target_event,auth.uid(),selected.campus_id) on conflict do nothing;
end $$;
grant execute on function public.rsvp_to_event(uuid) to authenticated;

create or replace function public.moderate_report(target_report uuid, chosen_action text, action_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.reports; caller uuid := auth.uid();
begin
  if not public.has_role(array['moderator','admin']::public.app_role[]) then raise exception 'moderator required' using errcode='42501'; end if;
  select * into selected from public.reports where id=target_report and campus_id=public.current_campus_id() for update;
  if selected.id is null then raise exception 'report not found' using errcode='P0002'; end if;
  if chosen_action not in ('dismiss','warn','hide_content','suspend','restore') then raise exception 'invalid moderation action' using errcode='23514'; end if;
  if chosen_action='hide_content' and selected.target_type='listing' then update public.listings set status='withdrawn' where id=selected.target_id and status not in ('sold','withdrawn'); end if;
  if chosen_action='suspend' and selected.target_type='profile' then update public.profiles set status='suspended' where id=selected.target_id; end if;
  if chosen_action='restore' and selected.target_type='profile' then update public.profiles set status='active' where id=selected.target_id; end if;
  insert into public.moderation_actions(campus_id,report_id,moderator_id,subject_profile_id,action,reason)
    values(selected.campus_id,selected.id,caller,case when selected.target_type='profile' then selected.target_id else null end,chosen_action,action_reason);
  update public.reports set status=case when chosen_action='dismiss' then 'dismissed' else 'resolved' end,resolved_at=now(),assigned_to=caller where id=selected.id;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(selected.campus_id,caller,'moderation.'||chosen_action,selected.target_type,selected.target_id::text,jsonb_build_object('reportId',selected.id,'reason',action_reason));
end $$;
grant execute on function public.moderate_report(uuid,text,text) to authenticated;

create or replace function public.public_stats() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'activeListings', (select count(*) from public.listings where status = 'active'),
    'upcomingEvents', (select count(*) from public.events where starts_at > now() and cancelled_at is null),
    'verifiedStudents', (select count(*) from public.profiles where status = 'active' and verified_until > now())
  )
$$;
