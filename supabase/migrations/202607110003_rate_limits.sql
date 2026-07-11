create or replace function public.consume_rate_limit(rate_key text, hit_limit integer, window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if hit_limit < 1 or window_seconds < 1 then raise exception 'invalid rate limit configuration'; end if;
  insert into public.rate_limits(key,window_started_at,hits) values(rate_key,now(),1)
  on conflict (key) do update set
    window_started_at=case when public.rate_limits.window_started_at < now() - make_interval(secs=>window_seconds) then now() else public.rate_limits.window_started_at end,
    hits=case when public.rate_limits.window_started_at < now() - make_interval(secs=>window_seconds) then 1 else public.rate_limits.hits+1 end
  returning hits <= hit_limit into allowed;
  return allowed;
end $$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;
