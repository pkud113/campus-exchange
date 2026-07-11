with campus as (
  insert into public.campuses (
    name,
    slug,
    timezone
  )
  values (
    'Michigan State University',
    'michigan-state-university',
    'America/Detroit'
  )
  on conflict (slug)
  do update set name = excluded.name
  returning id
)
insert into public.campus_email_domains (
  campus_id,
  domain
)
select
  id,
  'msu.edu'
from campus
on conflict (domain) do nothing;
