-- Close direct-write authorization bypasses and expose narrow, validated RPCs.

drop policy if exists conversations_member_insert on public.conversations;
drop policy if exists participants_creator_insert on public.conversation_participants;
drop policy if exists reports_self_insert on public.reports;
drop policy if exists favorites_self_all on public.favorites;
drop policy if exists rsvps_self_all on public.event_rsvps;
drop policy if exists rsvps_member_read on public.event_rsvps;
drop policy if exists notifications_self_update on public.notifications;
drop policy if exists blocks_self_all on public.blocks;

revoke insert, update, delete on public.conversations from anon, authenticated;
revoke insert, update, delete on public.conversation_participants from anon, authenticated;
revoke insert, update, delete on public.reports from anon, authenticated;
revoke insert, update, delete on public.favorites from anon, authenticated;
revoke insert, update, delete on public.event_rsvps from anon, authenticated;
revoke insert, update, delete on public.notifications from anon, authenticated;
revoke insert, update, delete on public.blocks from anon, authenticated;

create policy favorites_self_read on public.favorites for select to authenticated
using (profile_id = (select auth.uid()) and campus_id = public.current_campus_id());

create policy rsvps_member_read on public.event_rsvps for select to authenticated
using (campus_id = public.current_campus_id());

create policy blocks_self_read on public.blocks for select to authenticated
using (blocker_id = (select auth.uid()) and campus_id = public.current_campus_id());

create or replace function public.set_listing_favorite(target_listing uuid, desired boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  campus uuid := public.current_campus_id();
  selected public.listings;
begin
  if caller is null or campus is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;

  select * into selected from public.listings
  where id = target_listing and campus_id = campus and deleted_at is null
    and status in ('active', 'reserved', 'sold');
  if selected.id is null then
    raise exception 'listing unavailable' using errcode = 'P0002';
  end if;

  if desired then
    insert into public.favorites(profile_id, listing_id, campus_id)
    values(caller, selected.id, campus)
    on conflict(profile_id, listing_id) do nothing;
  else
    delete from public.favorites where profile_id = caller and listing_id = selected.id;
  end if;
  return desired;
end $$;

create or replace function public.cancel_event_rsvp(target_event uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  campus uuid := public.current_campus_id();
begin
  if caller is null or campus is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  if not exists(select 1 from public.events where id = target_event and campus_id = campus) then
    raise exception 'event unavailable' using errcode = 'P0002';
  end if;
  delete from public.event_rsvps where event_id = target_event and profile_id = caller and campus_id = campus;
end $$;

create or replace function public.mark_notifications_read(target_notification uuid default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  changed integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  update public.notifications
  set read_at = coalesce(read_at, now())
  where profile_id = auth.uid()
    and read_at is null
    and (target_notification is null or id = target_notification);
  get diagnostics changed = row_count;
  return changed;
end $$;

create or replace function public.set_profile_block(target_profile uuid, desired boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  campus uuid := public.current_campus_id();
begin
  if caller is null or campus is null then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  if target_profile = caller then
    raise exception 'cannot block yourself' using errcode = '23514';
  end if;
  if not exists(select 1 from public.profiles where id = target_profile and campus_id = campus) then
    raise exception 'profile unavailable' using errcode = 'P0002';
  end if;

  if desired then
    insert into public.blocks(blocker_id, blocked_id, campus_id)
    values(caller, target_profile, campus)
    on conflict(blocker_id, blocked_id) do nothing;
    update public.conversation_requests
      set status = 'cancelled', responded_at = now()
      where status = 'pending'
        and ((requester_id = caller and recipient_id = target_profile)
          or (requester_id = target_profile and recipient_id = caller));
  else
    delete from public.blocks
      where blocker_id = caller and blocked_id = target_profile and campus_id = campus;
  end if;
  return desired;
end $$;

-- SECURITY DEFINER functions must never inherit PostgreSQL's default PUBLIC execute grant.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', fn.signature);
  end loop;
end $$;

grant execute on function public.public_stats() to anon, authenticated;
grant execute on function public.set_listing_favorite(uuid, boolean) to authenticated;
grant execute on function public.rsvp_to_event(uuid) to authenticated;
grant execute on function public.cancel_event_rsvp(uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;
grant execute on function public.set_profile_block(uuid, boolean) to authenticated;

-- Re-state the intended authenticated API after removing PUBLIC's implicit grant.
grant execute on function public.current_campus_id() to authenticated;
grant execute on function public.is_active_student() to authenticated;
grant execute on function public.has_role(public.app_role[]) to authenticated;
grant execute on function public.is_conversation_participant(uuid) to authenticated;
grant execute on function public.auth_v2_enforced() to authenticated;
grant execute on function public.has_mfa() to authenticated;
grant execute on function public.is_conversation_unblocked(uuid) to authenticated;
grant execute on function public.create_listing_conversation(uuid) to authenticated;
grant execute on function public.complete_onboarding(text) to authenticated;
grant execute on function public.reverify_student() to authenticated;
grant execute on function public.create_direct_conversation_request(uuid) to authenticated;
grant execute on function public.respond_to_conversation_request(uuid, text) to authenticated;
grant execute on function public.cancel_conversation_request(uuid) to authenticated;
grant execute on function public.conversation_inbox() to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.soft_delete_content(text, uuid, text) to authenticated;
grant execute on function public.attach_profile_media(uuid, text) to authenticated;
grant execute on function public.moderation_report_queue() to authenticated;
grant execute on function public.submit_report(text, uuid, text, text, uuid) to authenticated;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;
grant execute on function public.moderate_content(text, uuid, text, text, text) to authenticated;
grant execute on function public.moderate_profile(uuid, text, text) to authenticated;

revoke execute on function public.consume_rate_limit(text, integer, integer) from authenticated;
revoke execute on function public.claim_outbox(integer) from authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
grant execute on function public.claim_outbox(integer) to service_role;

-- Avoid per-row auth function re-evaluation in RLS policies (Supabase advisor initplan).
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()) and campus_id = public.current_campus_id() and status = 'active');

drop policy if exists profiles_campus_read on public.profiles;
create policy profiles_campus_read on public.profiles for select to authenticated using (
  id = (select auth.uid()) or (
    public.is_active_student() and campus_id = public.current_campus_id() and (
      (status = 'active' and onboarding_completed_at is not null
        and (not public.auth_v2_enforced() or not password_setup_required)
        and (account_kind = 'staff' or (verified_until is not null and verified_until > now())))
      or (public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa())
    )
  )
);

drop policy if exists listings_member_read on public.listings;
create policy listings_member_read on public.listings for select to authenticated using (
  public.is_active_student() and campus_id = public.current_campus_id() and deleted_at is null
  and (status <> 'draft' or seller_id = (select auth.uid()))
);
drop policy if exists listings_owner_insert on public.listings;
create policy listings_owner_insert on public.listings for insert to authenticated
with check (public.is_active_student() and seller_id = (select auth.uid()) and campus_id = public.current_campus_id());
drop policy if exists listings_owner_update on public.listings;
create policy listings_owner_update on public.listings for update to authenticated
using (seller_id = (select auth.uid()) and campus_id = public.current_campus_id())
with check (seller_id = (select auth.uid()) and campus_id = public.current_campus_id());

drop policy if exists media_member_read on public.media_uploads;
create policy media_member_read on public.media_uploads for select to authenticated
using (campus_id = public.current_campus_id() and (status = 'ready' or uploader_id = (select auth.uid())));
drop policy if exists media_owner_insert on public.media_uploads;
create policy media_owner_insert on public.media_uploads for insert to authenticated
with check (uploader_id = (select auth.uid()) and campus_id = public.current_campus_id());
drop policy if exists media_owner_update on public.media_uploads;
create policy media_owner_update on public.media_uploads for update to authenticated
using (uploader_id = (select auth.uid()))
with check (uploader_id = (select auth.uid()) and campus_id = public.current_campus_id());

drop policy if exists events_owner_insert on public.events;
create policy events_owner_insert on public.events for insert to authenticated
with check (organizer_id = (select auth.uid()) and campus_id = public.current_campus_id());
drop policy if exists events_owner_update on public.events;
create policy events_owner_update on public.events for update to authenticated
using (organizer_id = (select auth.uid()))
with check (organizer_id = (select auth.uid()) and campus_id = public.current_campus_id());

drop policy if exists messages_participant_insert on public.messages;
create policy messages_participant_insert on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid()) and campus_id = public.current_campus_id()
  and public.is_conversation_participant(conversation_id)
  and public.is_conversation_unblocked(conversation_id)
);

drop policy if exists notifications_self_read on public.notifications;
create policy notifications_self_read on public.notifications for select to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists roles_self_read on public.role_assignments;
create policy roles_self_read on public.role_assignments for select to authenticated using (
  profile_id = (select auth.uid())
  or (campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa())
);

drop policy if exists reports_self_or_staff_read on public.reports;
create policy reports_self_or_staff_read on public.reports for select to authenticated using (
  reporter_id = (select auth.uid())
  or (campus_id = public.current_campus_id() and public.has_role(array['moderator','admin']::public.app_role[]) and public.has_mfa())
);

drop policy if exists conversation_requests_participant_read on public.conversation_requests;
create policy conversation_requests_participant_read on public.conversation_requests for select to authenticated using (
  campus_id = public.current_campus_id()
  and (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()))
);

drop policy if exists conversation_realtime_read on realtime.messages;
create policy conversation_realtime_read on realtime.messages for select to authenticated using (
  public.is_active_student()
  and realtime.topic() ~ '^conversation:[0-9a-f-]{36}$'
  and exists(select 1 from public.conversation_participants cp
    where cp.conversation_id = split_part(realtime.topic(), ':', 2)::uuid
      and cp.profile_id = (select auth.uid()))
);
drop policy if exists notification_realtime_read on realtime.messages;
create policy notification_realtime_read on realtime.messages for select to authenticated using (
  public.is_active_student() and realtime.topic() = 'notification:' || (select auth.uid())::text
);

-- Fix an enum assignment caught by plpgsql_check in the existing moderation path.
create or replace function public.moderate_report(target_report uuid, chosen_action text, action_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.reports; caller uuid := auth.uid();
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
  elsif chosen_action='suspend' and selected.target_type='profile' then
    update public.profiles set status='suspended' where id=selected.target_id and campus_id=selected.campus_id;
  elsif chosen_action='restore' and selected.target_type='profile' then
    update public.profiles set status='active' where id=selected.target_id and campus_id=selected.campus_id;
  end if;
  insert into public.moderation_actions(campus_id,report_id,moderator_id,subject_profile_id,action,reason)
    values(selected.campus_id,selected.id,caller,case when selected.target_type='profile' then selected.target_id else null end,chosen_action,action_reason);
  update public.reports set status=(case when chosen_action='dismiss' then 'dismissed' else 'resolved' end)::public.report_status,
    resolved_at=now(),assigned_to=caller where id=selected.id;
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(selected.campus_id,caller,'moderation.'||chosen_action,selected.target_type,selected.target_id::text,jsonb_build_object('reportId',selected.id,'reason',action_reason));
end $$;
