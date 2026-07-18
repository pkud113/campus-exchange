-- Domain evidence is time-bounded. Existing reviewed launch mappings receive a
-- 90-day minimum grace period so this forward migration cannot cause a surprise
-- registration outage, while future reviews default to one year.
alter table public.campus_email_domains
  add column review_expires_at timestamptz;

update public.campus_email_domains
set review_expires_at = greatest(
  coalesce(reviewed_at, now()) + interval '1 year',
  now() + interval '90 days'
)
where review_status in ('reviewed','ambiguous','rejected');

-- Replace two retired launch-evidence documents with current first-party pages
-- that explicitly describe the institution-issued student email account.
update public.campus_email_domains
set source_url = case domain::text
  when 'princeton.edu' then 'https://gradschool.princeton.edu/admission-onboarding/nondegree-programs/review-admission-decision-onboard'
  when 'duke.edu' then 'https://gradschool.duke.edu/admissions/admitted-students/netid-and-duke-e-mail/'
  else source_url
end
where domain::text in ('princeton.edu','duke.edu');

create or replace function private.set_domain_review_expiry()
returns trigger
language plpgsql
security invoker
set search_path = '' as $$
begin
  if new.reviewed_at is not null
    and new.review_status in ('reviewed','ambiguous','rejected')
    and (new.review_expires_at is null
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_status is distinct from old.review_status) then
    new.review_expires_at := new.reviewed_at + interval '1 year';
  end if;
  if new.review_status='unreviewed' then new.review_expires_at := null; end if;
  return new;
end $$;

-- Transactional notification emails are user-controlled. In-app notifications
-- remain available regardless of these preferences.
create table public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email_messages boolean not null default true,
  email_discussions boolean not null default true,
  quiet_hours_start smallint,
  quiet_hours_end smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quiet_hours_start is null or quiet_hours_start between 0 and 23),
  check (quiet_hours_end is null or quiet_hours_end between 0 and 23),
  check ((quiet_hours_start is null)=(quiet_hours_end is null)),
  check (quiet_hours_start is null or quiet_hours_start<>quiet_hours_end)
);
create trigger notification_preferences_touch before update on public.notification_preferences
for each row execute function public.touch_updated_at();
alter table public.notification_preferences enable row level security;
grant select,insert,update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;
create policy notification_preferences_self_select on public.notification_preferences
for select to authenticated using (profile_id=auth.uid());
create policy notification_preferences_self_insert on public.notification_preferences
for insert to authenticated with check (profile_id=auth.uid());
create policy notification_preferences_self_update on public.notification_preferences
for update to authenticated using (profile_id=auth.uid()) with check (profile_id=auth.uid());

create trigger campus_email_domains_review_expiry
before insert or update of reviewed_at,review_status on public.campus_email_domains
for each row execute function private.set_domain_review_expiry();

alter table public.campus_email_domains
  add constraint campus_email_domains_review_expiry_check
  check (
    review_expires_at is null
    or (reviewed_at is not null and review_expires_at > reviewed_at)
  ) not valid;
alter table public.campus_email_domains validate constraint campus_email_domains_review_expiry_check;

create index campus_email_domains_review_expiry_idx
  on public.campus_email_domains(review_expires_at)
  where is_enabled and review_status='reviewed';

create or replace function private.resolve_registration_domain(input_domain text)
returns table(resolution text,campus_id uuid,campus_name text)
language plpgsql stable security definer set search_path = '' as $$
declare normalized text := lower(trim(trailing '.' from trim(input_domain)));
declare eligible_count integer;
begin
  if normalized = '' or normalized ~ '[@*]' then
    return query select 'unsupported'::text,null::uuid,null::text;
    return;
  end if;

  select count(*) into eligible_count
  from public.campus_email_domains d
  join public.campuses c on c.id=d.campus_id
  where lower(d.domain::text)=normalized
    and d.review_status='reviewed'
    and d.review_expires_at>now()
    and d.domain_kind in ('student','institutional')
    and d.is_enabled and c.status='enabled';

  if eligible_count = 1 then
    return query
      select 'eligible'::text,c.id,c.name
      from public.campus_email_domains d join public.campuses c on c.id=d.campus_id
      where lower(d.domain::text)=normalized and d.review_status='reviewed'
        and d.review_expires_at>now()
        and d.domain_kind in ('student','institutional') and d.is_enabled and c.status='enabled';
  elsif eligible_count > 1 then
    return query select 'ambiguous'::text,null::uuid,null::text;
  elsif exists(select 1 from public.campus_email_domains d where lower(d.domain::text)=normalized and d.domain_kind='alumni') then
    return query select 'alumni'::text,null::uuid,null::text;
  elsif exists(select 1 from public.campus_email_domains d where lower(d.domain::text)=normalized and (d.review_status='ambiguous' or d.domain_kind='shared')) then
    return query select 'ambiguous'::text,null::uuid,null::text;
  elsif exists(
    select 1 from public.campus_email_domains d join public.campuses c on c.id=d.campus_id
    where lower(d.domain::text)=normalized and d.review_status='reviewed'
      and d.review_expires_at>now()
      and d.domain_kind in ('student','institutional') and d.is_enabled and c.status<>'enabled'
  ) then
    return query select 'campus_disabled'::text,null::uuid,null::text;
  elsif exists(
    select 1 from public.campus_email_domains d
    where lower(d.domain::text)=normalized and d.review_status='reviewed'
      and d.review_expires_at>now()
      and d.domain_kind in ('student','institutional') and not d.is_enabled
  ) then
    return query select 'domain_disabled'::text,null::uuid,null::text;
  elsif exists(select 1 from public.campus_email_domains d where lower(d.domain::text)=normalized) then
    return query select 'review_required'::text,null::uuid,null::text;
  else
    return query select 'unsupported'::text,null::uuid,null::text;
  end if;
end $$;

create or replace function public.search_institution_directory(search_query text,result_limit integer default 20)
returns table(
  id text,name text,city text,region text,status public.institution_directory_status,
  registration_status public.institution_registration_status,campus_id uuid,availability text
)
language sql stable security definer set search_path = '' as $$
  with input as (
    select lower(trim(coalesce(search_query,''))) as query,greatest(1,least(coalesce(result_limit,20),50)) as take
  )
  select i.id,i.name,i.city,i.region,i.status,i.registration_status,i.campus_id,
    case
      when i.registration_status<>'open' then 'unavailable'
      when c.status='enabled' and exists(
        select 1 from public.campus_email_domains d
        where d.campus_id=i.campus_id and d.is_enabled and d.review_status='reviewed'
          and d.review_expires_at>now() and d.domain_kind in ('student','institutional')
      ) then 'supported'
      when i.registration_status='open' then 'verification_required'
      else 'unavailable'
    end as availability
  from public.institution_directory i
  cross join input
  left join public.campuses c on c.id=i.campus_id
  where input.query='' or lower(i.name) like '%'||input.query||'%'
    or lower(i.aliases) like '%'||input.query||'%'
    or lower(i.city||' '||i.region) like '%'||input.query||'%'
  order by
    case when lower(i.name)=input.query then 0 when lower(i.name) like input.query||'%' then 1 else 2 end,
    i.name,i.region,i.id
  limit (select take from input)
$$;

do $$
begin
  if exists(
    select 1 from public.campus_email_domains
    where is_enabled and review_status='reviewed'
      and domain_kind in ('student','institutional')
      and (review_expires_at is null or review_expires_at<=now())
  ) then raise exception 'enabled reviewed domains require current evidence'; end if;
end $$;
