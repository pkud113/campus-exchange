-- Reviewed college directory, fail-closed registration domain resolution, and
-- unsupported-school intake. Existing campus-scoped authorization is unchanged.

create type public.campus_domain_review_status as enum ('unreviewed','reviewed','ambiguous','rejected');
create type public.campus_domain_kind as enum ('student','institutional','shared','alumni','other');
create type public.school_request_status as enum ('pending','reviewing','approved','rejected','duplicate');

alter table public.campus_email_domains
  drop constraint if exists campus_email_domains_domain_key;

alter table public.campus_email_domains
  add column review_status public.campus_domain_review_status,
  add column domain_kind public.campus_domain_kind,
  add column source_url text,
  add column source_label text,
  add column reviewed_at timestamptz,
  add column review_notes text;

-- Domains that were already enabled were explicitly operator-managed before
-- this migration. Preserve that behavior, while requiring review for new rows.
update public.campus_email_domains
set review_status = case when is_enabled then 'reviewed'::public.campus_domain_review_status else 'unreviewed'::public.campus_domain_review_status end,
    domain_kind = 'institutional',
    reviewed_at = case when is_enabled then now() else null end,
    source_label = case when is_enabled then 'Legacy operator-managed mapping' else null end;

alter table public.campus_email_domains
  alter column review_status set default 'unreviewed',
  alter column review_status set not null,
  alter column domain_kind set default 'other',
  alter column domain_kind set not null,
  add constraint campus_email_domains_format_check
    check (lower(domain::text) = domain::text and domain::text ~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$' and position('.' in domain::text) > 0) not valid,
  add constraint campus_email_domains_source_check
    check (source_url is null or source_url ~ '^https://[^[:space:]]+$') not valid,
  add constraint campus_email_domains_review_notes_check
    check (review_notes is null or char_length(review_notes) <= 2000) not valid,
  add constraint campus_email_domains_activation_check
    check (not is_enabled or (review_status = 'reviewed' and domain_kind in ('student','institutional'))) not valid;

alter table public.campus_email_domains validate constraint campus_email_domains_format_check;
alter table public.campus_email_domains validate constraint campus_email_domains_source_check;
alter table public.campus_email_domains validate constraint campus_email_domains_review_notes_check;
alter table public.campus_email_domains validate constraint campus_email_domains_activation_check;

create unique index campus_email_domains_one_active_mapping_idx
  on public.campus_email_domains (lower(domain::text))
  where is_enabled and review_status = 'reviewed' and domain_kind in ('student','institutional');
create index campus_email_domains_resolution_idx
  on public.campus_email_domains (lower(domain::text),review_status,is_enabled);

create table public.school_requests (
  id uuid primary key default gen_random_uuid(),
  school_name text not null check (char_length(school_name) between 2 and 160),
  school_name_key text not null check (char_length(school_name_key) between 2 and 160),
  email_domain extensions.citext not null,
  status public.school_request_status not null default 'pending',
  request_count integer not null default 1 check (request_count between 1 and 1000000),
  first_requested_at timestamptz not null default now(),
  last_requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  resolution_campus_id uuid references public.campuses(id) on delete set null,
  operator_notes text check (operator_notes is null or char_length(operator_notes) <= 2000),
  unique (email_domain,school_name_key),
  check (lower(email_domain::text) = email_domain::text and email_domain::text ~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$' and position('.' in email_domain::text) > 0)
);
create index school_requests_review_queue_idx on public.school_requests(status,last_requested_at desc);

create table public.directory_operator_audit (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id) on delete set null,
  action text not null check (action ~ '^[a-z0-9_.-]{3,100}$'),
  target_type text not null check (char_length(target_type) between 2 and 80),
  target_id text not null check (char_length(target_id) between 1 and 254),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index directory_operator_audit_created_idx on public.directory_operator_audit(created_at desc);

alter table public.school_requests enable row level security;
alter table public.directory_operator_audit enable row level security;
revoke all on table public.school_requests,public.directory_operator_audit from public,anon,authenticated;
grant all on table public.school_requests,public.directory_operator_audit to service_role;

create or replace function private.normalize_school_name(input_name text) returns text
language sql immutable strict set search_path = '' as $$
  select lower(regexp_replace(trim(input_name), '[[:space:]]+', ' ', 'g'))
$$;

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
    and d.domain_kind in ('student','institutional')
    and d.is_enabled and c.status='enabled';

  if eligible_count = 1 then
    return query
      select 'eligible'::text,c.id,c.name
      from public.campus_email_domains d join public.campuses c on c.id=d.campus_id
      where lower(d.domain::text)=normalized and d.review_status='reviewed'
        and d.domain_kind in ('student','institutional') and d.is_enabled and c.status='enabled';
  elsif eligible_count > 1 then
    -- Defense in depth; the partial unique index should make this unreachable.
    return query select 'ambiguous'::text,null::uuid,null::text;
  elsif exists(select 1 from public.campus_email_domains d where lower(d.domain::text)=normalized and d.domain_kind='alumni') then
    return query select 'alumni'::text,null::uuid,null::text;
  elsif exists(select 1 from public.campus_email_domains d where lower(d.domain::text)=normalized and (d.review_status='ambiguous' or d.domain_kind='shared')) then
    return query select 'ambiguous'::text,null::uuid,null::text;
  elsif exists(
    select 1 from public.campus_email_domains d join public.campuses c on c.id=d.campus_id
    where lower(d.domain::text)=normalized and d.review_status='reviewed'
      and d.domain_kind in ('student','institutional') and d.is_enabled and c.status<>'enabled'
  ) then
    return query select 'campus_disabled'::text,null::uuid,null::text;
  elsif exists(
    select 1 from public.campus_email_domains d
    where lower(d.domain::text)=normalized and d.review_status='reviewed'
      and d.domain_kind in ('student','institutional') and not d.is_enabled
  ) then
    return query select 'domain_disabled'::text,null::uuid,null::text;
  elsif exists(select 1 from public.campus_email_domains d where lower(d.domain::text)=normalized) then
    return query select 'review_required'::text,null::uuid,null::text;
  else
    return query select 'unsupported'::text,null::uuid,null::text;
  end if;
end $$;

create or replace function public.registration_domain_resolution(input_domain text)
returns table(resolution text,campus_id uuid,campus_name text)
language sql stable security definer set search_path = '' as $$
  select * from private.resolve_registration_domain(input_domain)
$$;
revoke all on function public.registration_domain_resolution(text) from public,anon,authenticated;
grant execute on function public.registration_domain_resolution(text) to service_role;

create or replace function public.submit_school_request(requested_school_name text,requested_domain text)
returns table(request_id uuid,request_status public.school_request_status)
language plpgsql security definer set search_path = '' as $$
declare cleaned_name text := regexp_replace(trim(requested_school_name), '[[:space:]]+', ' ', 'g');
declare name_key text;
declare normalized_domain text := lower(trim(trailing '.' from trim(requested_domain)));
begin
  name_key := private.normalize_school_name(cleaned_name);
  if char_length(cleaned_name) not between 2 and 160
    or normalized_domain !~ '^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$'
    or position('.' in normalized_domain)=0 then
    raise exception 'invalid school request' using errcode='23514';
  end if;

  return query
    insert into public.school_requests(school_name,school_name_key,email_domain)
    values(cleaned_name,name_key,normalized_domain)
    on conflict (email_domain,school_name_key) do update set
      request_count=least(public.school_requests.request_count+1,1000000),
      last_requested_at=now()
    returning id,status;
end $$;
revoke all on function public.submit_school_request(text,text) from public,anon,authenticated;
grant execute on function public.submit_school_request(text,text) to service_role;

-- All student provisioning paths use the same fail-closed resolver. No client
-- metadata or campus identifier participates in assignment.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare matched_campus uuid; resolution text; staff_invite public.staff_invitations; normalized_hash text;
begin
  normalized_hash := encode(extensions.digest(lower(new.email),'sha256'),'hex');
  select * into staff_invite from public.staff_invitations
    where email_hash=normalized_hash and claimed_at is null and expires_at>now() for update;
  if staff_invite.id is not null then
    insert into public.profiles(id,campus_id,status,account_kind,verified_at,verified_until)
      values(new.id,staff_invite.campus_id,'pending','staff',null,null);
    insert into public.role_assignments(profile_id,campus_id,role) values(new.id,staff_invite.campus_id,staff_invite.role);
    update public.staff_invitations set claimed_at=now() where id=staff_invite.id;
    insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
      values(staff_invite.campus_id,null,'role.provisioned','profile',new.id::text,jsonb_build_object('role',staff_invite.role,'invitationId',staff_invite.id));
    return new;
  end if;
  select r.resolution,r.campus_id into resolution,matched_campus
    from private.resolve_registration_domain(split_part(new.email,'@',2)) r;
  if resolution<>'eligible' or matched_campus is null then
    raise exception 'school email domain is not eligible' using errcode='28000';
  end if;
  insert into public.profiles(id,campus_id,status,account_kind,verified_at,verified_until)
    values(new.id,matched_campus,'pending','student',null,null);
  insert into public.role_assignments(profile_id,campus_id,role) values(new.id,matched_campus,'student');
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(matched_campus,null,'role.provisioned','profile',new.id::text,jsonb_build_object('role','student'));
  return new;
end $$;

create or replace function public.reverify_student() returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.profiles; auth_user auth.users; matched_campus uuid; resolution text;
begin
  select * into selected from public.profiles where id=(select auth.uid()) for update;
  select * into auth_user from auth.users where id=(select auth.uid());
  select r.resolution,r.campus_id into resolution,matched_campus
    from private.resolve_registration_domain(split_part(auth_user.email,'@',2)) r;
  if selected.id is null or selected.account_kind<>'student' or selected.status<>'active'
    or selected.onboarding_completed_at is null or selected.password_setup_required or auth_user.email_confirmed_at is null
    or resolution<>'eligible' or matched_campus is null or matched_campus<>selected.campus_id then
    raise exception 'student re-verification unavailable' using errcode='42501';
  end if;
  update public.profiles set verified_at=now(),verified_until=now()+interval '1 year' where id=(select auth.uid());
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata)
    values(selected.campus_id,(select auth.uid()),'account.reverified','profile',(select auth.uid())::text,'{}'::jsonb);
end $$;

create or replace function public.complete_onboarding(new_handle text) returns void
language plpgsql security definer set search_path = '' as $$
declare selected public.profiles; auth_user auth.users; matched_campus uuid; resolution text;
begin
  select * into selected from public.profiles where id=(select auth.uid()) for update;
  select * into auth_user from auth.users where id=(select auth.uid());
  if selected.id is null or auth_user.id is null then raise exception 'account not found' using errcode='P0002'; end if;
  if selected.status not in ('pending','active') or (select status from public.campuses where id=selected.campus_id)<>'enabled' then raise exception 'account is not eligible for onboarding' using errcode='42501'; end if;
  if selected.onboarding_completed_at is not null and not selected.password_setup_required then raise exception 'onboarding already complete' using errcode='23514'; end if;
  if auth_user.encrypted_password is null or auth_user.encrypted_password='' then raise exception 'password required' using errcode='23514'; end if;
  if selected.account_kind='student' then
    select r.resolution,r.campus_id into resolution,matched_campus
      from private.resolve_registration_domain(split_part(auth_user.email,'@',2)) r;
    if auth_user.email_confirmed_at is null or resolution<>'eligible' or matched_campus is null or matched_campus<>selected.campus_id then
      raise exception 'email verification required' using errcode='42501';
    end if;
  end if;
  update public.profiles set handle=lower(new_handle),display_name=coalesce(display_name,lower(new_handle)),status=case when status='pending' then 'active'::public.profile_status else status end,
    verified_at=case when account_kind='student' then now() else verified_at end,verified_until=case when account_kind='student' then now()+interval '1 year' else verified_until end,
    onboarding_completed_at=now(),password_setup_required=false where id=(select auth.uid());
  insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata) values(selected.campus_id,(select auth.uid()),'account.onboarding_completed','profile',(select auth.uid())::text,'{}'::jsonb);
end $$;

-- Reviewed launch directory. Source URLs are official university pages that
-- explicitly document student account domains; see data/college-directory.v1.json.
with directory(name,short_name,slug,city,region,timezone,domain,domain_kind,source_url) as (values
  ('Michigan State University','MSU','michigan-state-university','East Lansing','MI','America/Detroit','msu.edu','institutional','https://netid.msu.edu/'),
  ('University of Illinois Urbana-Champaign','Illinois','university-of-illinois-urbana-champaign','Champaign','IL','America/Chicago','illinois.edu','institutional','https://online.illinois.edu/getting-started/other-important-info-for-online-students/netid-and-passwords/'),
  ('University of Wisconsin-Madison','UW-Madison','university-of-wisconsin-madison','Madison','WI','America/Chicago','wisc.edu','institutional','https://kb.wisc.edu/microsoft365/page.php?id=57889'),
  ('University of Chicago','UChicago','university-of-chicago','Chicago','IL','America/Chicago','uchicago.edu','institutional','https://registrar.uchicago.edu/records/policies-regulations/email-correspondence/'),
  ('Northwestern University','Northwestern','northwestern-university','Evanston','IL','America/Chicago','u.northwestern.edu','student','https://services.northwestern.edu/TDClient/30/Portal/Requests/Service/217/Google-Workspace'),
  ('University of Notre Dame','Notre Dame','university-of-notre-dame','Notre Dame','IN','America/Indiana/Indianapolis','nd.edu','institutional','https://catalog.nd.edu/undergraduate/general-information/using-notre-dame-email/'),
  ('Stanford University','Stanford','stanford-university','Stanford','CA','America/Los_Angeles','stanford.edu','institutional','https://bulletin.stanford.edu/pages/2x9Qnr6bfRUVzXXIOhvK'),
  ('University of California, Berkeley','UC Berkeley','university-of-california-berkeley','Berkeley','CA','America/Los_Angeles','berkeley.edu','institutional','https://bconnected.berkeley.edu/email'),
  ('Yale University','Yale','yale-university','New Haven','CT','America/New_York','yale.edu','institutional','https://studenttechnology.yale.edu/new-students'),
  ('Princeton University','Princeton','princeton-university','Princeton','NJ','America/New_York','princeton.edu','institutional','https://gradschool.princeton.edu/sites/g/files/toruqf846/files/images/New%20Student%20Checklist%20-%202020.pdf'),
  ('Duke University','Duke','duke-university','Durham','NC','America/New_York','duke.edu','institutional','https://sites.sanford.duke.edu/mppadmittedstudents/wp-content/uploads/sites/38/2021/08/2021-MPP-Handbook-1.pdf'),
  ('Vanderbilt University','Vanderbilt','vanderbilt-university','Nashville','TN','America/Chicago','vanderbilt.edu','institutional','https://www.vanderbilt.edu/enrollmentbulletin/policies/official-university-communications/'),
  ('Rice University','Rice','rice-university','Houston','TX','America/Chicago','rice.edu','institutional','https://kb.rice.edu/65783'),
  ('Georgia Institute of Technology','Georgia Tech','georgia-institute-of-technology','Atlanta','GA','America/New_York','gatech.edu','institutional','https://isss.oie.gatech.edu/sites/default/files/campuscompass7.11.2022edit.pdf'),
  ('The University of Texas at Austin','UT Austin','university-of-texas-at-austin','Austin','TX','America/Chicago','my.utexas.edu','student','https://tech.utexas.edu/services-tools/technology-students'),
  ('Texas A&M University','Texas A&M','texas-a-and-m-university','College Station','TX','America/Chicago','email.tamu.edu','student','https://service.tamu.edu/TDClient/36/Portal/KB/PrintArticle?ID=680'),
  ('Dartmouth College','Dartmouth','dartmouth-college','Hanover','NH','America/New_York','dartmouth.edu','institutional','https://services.dartmouth.edu/TDClient/2415/Student/KB/Article/107190/Email-Overview-Students')
), inserted as (
  insert into public.campuses(name,short_name,slug,city,region,country_code,timezone,status)
  select name,short_name,slug,city,region,'US',timezone,'enabled'::public.campus_status from directory
  on conflict (slug) do update set name=excluded.name,short_name=excluded.short_name,city=excluded.city,
    region=excluded.region,country_code=excluded.country_code,timezone=excluded.timezone
  returning id,slug
)
insert into public.campus_email_domains(campus_id,domain,is_enabled,review_status,domain_kind,source_url,source_label,reviewed_at,review_notes)
select i.id,d.domain,true,'reviewed',d.domain_kind::public.campus_domain_kind,d.source_url,'Official university student-email documentation',now(),'Reviewed launch directory v1'
from directory d join inserted i using(slug)
on conflict (campus_id,domain) do update set
  review_status='reviewed',domain_kind=excluded.domain_kind,source_url=excluded.source_url,
  source_label=excluded.source_label,reviewed_at=coalesce(public.campus_email_domains.reviewed_at,excluded.reviewed_at),
  review_notes=excluded.review_notes;

-- Explicit alumni exclusions tied to official alumni documentation.
insert into public.campus_email_domains(campus_id,domain,is_enabled,review_status,domain_kind,source_url,source_label,reviewed_at,review_notes)
select c.id,x.domain,false,'reviewed','alumni',x.source_url,'Official university alumni-email documentation',now(),'Alumni-only domain; never qualifies for student registration'
from (values
  ('northwestern-university','alum.northwestern.edu','https://services.northwestern.edu/TDClient/30/Portal/Requests/Service/217/Google-Workspace'),
  ('northwestern-university','kelloggalumni.northwestern.edu','https://services.northwestern.edu/TDClient/30/Portal/Requests/Service/217/Google-Workspace'),
  ('yale-university','aya.yale.edu','https://alumni.yale.edu/help-center-alumni-email-yalemail')
) x(slug,domain,source_url) join public.campuses c on c.slug=x.slug
on conflict (campus_id,domain) do update set is_enabled=false,review_status='reviewed',domain_kind='alumni',
  source_url=excluded.source_url,source_label=excluded.source_label,reviewed_at=excluded.reviewed_at,review_notes=excluded.review_notes;

-- Shared physical-campus domains are represented but cannot resolve to a
-- campus. This is intentionally not an active production mapping.
with ambiguous(name,short_name,slug,city,region,timezone,domain,source_url,notes) as (values
  ('University of Michigan-Ann Arbor','U-M Ann Arbor','university-of-michigan-ann-arbor','Ann Arbor','MI','America/Detroit','umich.edu','https://www.bus.umich.edu/MyiMpact/DiscoverIT/ITBasics/Content/EmailServices.htm','Domain is also used at separately operated U-M campuses.'),
  ('University of Michigan-Dearborn','U-M Dearborn','university-of-michigan-dearborn','Dearborn','MI','America/Detroit','umich.edu','https://umdearborn.edu/sites/default/files/unmanaged/pdf/casl/teaching_guidelines.pdf','Domain is shared with Ann Arbor and other U-M campuses.'),
  ('Purdue University West Lafayette','Purdue West Lafayette','purdue-university-west-lafayette','West Lafayette','IN','America/Indiana/Indianapolis','purdue.edu','https://service.purdue.edu/TDClient/32/Purdue/KB/PrintArticle?ID=2218','Official guidance says the domain spans Purdue campuses.'),
  ('Purdue University in Indianapolis','Purdue Indianapolis','purdue-university-indianapolis','Indianapolis','IN','America/Indiana/Indianapolis','purdue.edu','https://service.purdue.edu/TDClient/32/Purdue/KB/PrintArticle?ID=2218','Official guidance says the domain spans Purdue campuses.')
), inserted as (
  insert into public.campuses(name,short_name,slug,city,region,country_code,timezone,status)
  select name,short_name,slug,city,region,'US',timezone,'disabled'::public.campus_status from ambiguous
  on conflict (slug) do update set name=excluded.name,short_name=excluded.short_name,city=excluded.city,
    region=excluded.region,country_code=excluded.country_code,timezone=excluded.timezone
  returning id,slug
)
insert into public.campus_email_domains(campus_id,domain,is_enabled,review_status,domain_kind,source_url,source_label,reviewed_at,review_notes)
select i.id,a.domain,false,'ambiguous','shared',a.source_url,'Official documentation plus physical-campus review',now(),a.notes
from ambiguous a join inserted i using(slug)
on conflict (campus_id,domain) do update set is_enabled=false,review_status='ambiguous',domain_kind='shared',
  source_url=excluded.source_url,source_label=excluded.source_label,reviewed_at=excluded.reviewed_at,review_notes=excluded.review_notes;

-- Migration invariants.
do $$
begin
  if (select count(*) from public.campuses c where c.status='enabled' and c.slug in (
    'michigan-state-university','university-of-illinois-urbana-champaign','university-of-wisconsin-madison','university-of-chicago',
    'northwestern-university','university-of-notre-dame','stanford-university','university-of-california-berkeley','yale-university',
    'princeton-university','duke-university','vanderbilt-university','rice-university','georgia-institute-of-technology',
    'university-of-texas-at-austin','texas-a-and-m-university','dartmouth-college'
  )) <> 17 then raise exception 'reviewed launch directory is incomplete'; end if;
  if exists(select 1 from public.campus_email_domains where is_enabled and (review_status<>'reviewed' or domain_kind not in ('student','institutional'))) then
    raise exception 'an enabled domain is not reviewed and qualifying';
  end if;
  if exists(select 1 from public.campus_email_domains where domain_kind in ('alumni','shared') and is_enabled) then
    raise exception 'an alumni or shared domain was enabled';
  end if;
  if (select count(*) from private.resolve_registration_domain('msu.edu') where resolution='eligible')<>1 then
    raise exception 'existing MSU registration no longer resolves';
  end if;
  if (select resolution from private.resolve_registration_domain('purdue.edu'))<>'ambiguous' then
    raise exception 'shared domain does not fail closed';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('school_requests','directory_operator_audit') and not c.relrowsecurity) then
    raise exception 'directory tables must retain RLS';
  end if;
end $$;

revoke execute on function public.handle_new_user() from public,anon,authenticated;
