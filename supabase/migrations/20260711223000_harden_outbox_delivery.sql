alter table public.notifications
  add column source_event_id uuid;

create unique index notifications_source_event_idx
  on public.notifications (profile_id, source_event_id)
  where source_event_id is not null;

create or replace function public.claim_outbox(batch_size integer default 25)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select id
    from public.outbox_events
    where (
      status = 'pending' and available_at <= now()
    ) or (
      status = 'processing' and locked_at < now() - interval '10 minutes'
    )
    order by created_at
    for update skip locked
    limit least(batch_size, 100)
  )
  update public.outbox_events o
  set status = 'processing',
      locked_at = now(),
      attempt_count = attempt_count + 1
  from claimed
  where o.id = claimed.id
  returning o.*;
end
$$;

revoke all on function public.claim_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox(integer) to service_role;
