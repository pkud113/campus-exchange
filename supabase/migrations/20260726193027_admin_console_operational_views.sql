-- Step 2C operational administration views.
-- trusted AAL2 projections
-- Every projection scopes before filtering or limiting rows.
create or replace function public.staff_access_context()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=(select auth.uid()); declare campus uuid:=private.staff_campus_id(actor);
declare capabilities jsonb; declare platform_role public.platform_role; declare campus_role public.app_role;
declare campus_name text; declare institution_id text;
begin
 if coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'AAL2 required' using errcode='42501'; end if;
 select role into platform_role from public.platform_role_assignments where profile_id=actor order by role desc limit 1;
 select role into campus_role from public.role_assignments where profile_id=actor and campus_id=campus and role in ('moderator','admin') order by role desc limit 1;
 if platform_role is null and campus_role is null then raise exception 'staff access required' using errcode='42501'; end if;
 select c.name,i.id into campus_name,institution_id from public.campuses c left join public.institution_directory i on i.campus_id=c.id where c.id=campus;
 select coalesce(jsonb_agg(capability::text order by capability::text),'[]'::jsonb) into capabilities from unnest(enum_range(null::public.staff_capability)) capability where private.staff_has_capability(capability,campus,actor);
 return jsonb_build_object('actorId',actor,'campusId',campus,'campusName',campus_name,'institutionId',institution_id,'scope',case when platform_role is not null then 'platform' else 'campus' end,'platformRole',platform_role,'campusRole',campus_role,'capabilities',capabilities,'aal','aal2');
end $$;
revoke all on function public.staff_access_context() from public,anon;
grant execute on function public.staff_access_context() to authenticated;

create or replace function public.admin_dashboard_summary()
returns jsonb language sql stable security definer set search_path='' as $$
 with scoped_cases as (
  select mc.id,mc.status,mc.severity,mc.entity_type,r.source from public.moderation_cases mc join public.reports r on r.id=mc.report_id where private.staff_has_capability('cases.read',mc.subject_campus_id)
 ), scoped_content as (
  select s.campus_id,(s.status<>'active' or s.deleted_at is not null) restricted from public.social_posts s
  union all select p.campus_id,(p.removed_at is not null or p.deleted_at is not null) from public.discussion_posts p
  union all select o.campus_id,(o.status<>'active' or o.deleted_at is not null) from public.organizations o
  union all select o.campus_id,(ch.status<>'active') from public.organization_channels ch join public.organizations o on o.id=ch.organization_id
  union all select l.campus_id,(l.status='withdrawn' or l.deleted_at is not null) from public.listings l
  union all select e.campus_id,(e.cancelled_at is not null or e.deleted_at is not null) from public.events e
 ) select jsonb_build_object(
  'openCases',(select count(*) from scoped_cases where status not in ('resolved','dismissed')),
  'urgentCases',(select count(*) from scoped_cases where status not in ('resolved','dismissed') and severity in ('high','critical')),
  'pendingAppeals',(select count(*) from public.moderation_appeals a join public.moderation_cases mc on mc.id=a.case_id where a.status in ('open','reviewing','awaiting_user_response') and private.staff_has_capability('cases.read',mc.subject_campus_id)),
  'automatedReviews',(select count(*) from scoped_cases where status not in ('resolved','dismissed') and (entity_type='automated_moderation' or source in ('automated','user_review'))),
  'restrictedUsers',(select count(*) from public.profiles p where (p.status='suspended' or p.restricted_until>now()) and private.staff_has_capability('users.read',p.campus_id)),
  'restrictedContent',(select count(*) from scoped_content c where c.restricted and private.staff_has_capability('content.read',c.campus_id)),
  'pendingStaffInvitations',(select count(*) from public.staff_invitations i where i.claimed_at is null and i.expires_at>now() and (private.staff_has_capability('staff.manage',i.campus_id) or private.staff_has_capability('campus_moderators.manage',i.campus_id))),
  'recentAuditedActions',(select count(*) from public.audit_log a where a.created_at>now()-interval '24 hours' and private.staff_has_capability('audit.read',a.campus_id)))
$$;
revoke all on function public.admin_dashboard_summary() from public,anon;
grant execute on function public.admin_dashboard_summary() to authenticated;

create or replace function public.admin_case_queue_v3(
 status_filter text default null,severity_filter text default null,source_filter text default null,entity_filter text default null,
 institution_filter text default null,campus_filter uuid default null,assignee_filter text default null,automated_filter boolean default null,
 appeals_filter boolean default null,search_term text default '',after_created timestamptz default null,after_id uuid default null,result_limit integer default 50)
returns table(id uuid,report_id uuid,status public.moderation_case_status,severity public.moderation_severity,entity_type text,entity_id uuid,
 subject_campus_id uuid,campus_name text,campus_short_name text,institution_id text,assigned_to uuid,source text,reason text,details text,
 organization_id uuid,community_id uuid,repeat_offender boolean,related_subject_count bigint,appeal_count bigint,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select mc.id,mc.report_id,mc.status,mc.severity,mc.entity_type,mc.entity_id,mc.subject_campus_id,c.name,c.short_name,i.id,mc.assigned_to,r.source,r.reason,r.details,mc.organization_id,mc.community_id,mc.repeat_offender,
  (select count(*) from public.moderation_cases related where related.entity_type=mc.entity_type and related.entity_id=mc.entity_id and private.staff_has_capability('cases.read',related.subject_campus_id)),
  (select count(*) from public.moderation_appeals a where a.case_id=mc.id),mc.created_at
 from public.moderation_cases mc join public.reports r on r.id=mc.report_id join public.campuses c on c.id=mc.subject_campus_id left join public.institution_directory i on i.campus_id=c.id
 where private.staff_has_capability('cases.read',mc.subject_campus_id)
  and (status_filter is null or (status_filter='open' and mc.status not in ('resolved','dismissed')) or mc.status::text=status_filter)
  and (severity_filter is null or mc.severity::text=severity_filter) and (source_filter is null or r.source=source_filter)
  and (entity_filter is null or mc.entity_type=entity_filter) and (institution_filter is null or i.id=institution_filter)
  and (campus_filter is null or mc.subject_campus_id=campus_filter)
  and (assignee_filter is null or (assignee_filter='unassigned' and mc.assigned_to is null) or (assignee_filter<>'unassigned' and mc.assigned_to=assignee_filter::uuid))
  and (automated_filter is null or automated_filter=(mc.entity_type='automated_moderation' or r.source in ('automated','user_review')))
  and (appeals_filter is null or appeals_filter=exists(select 1 from public.moderation_appeals a where a.case_id=mc.id and a.status in ('open','reviewing','awaiting_user_response')))
  and (trim(search_term)='' or mc.id::text ilike '%'||trim(search_term)||'%' or mc.entity_type ilike '%'||trim(search_term)||'%' or r.reason ilike '%'||trim(search_term)||'%' or r.details ilike '%'||trim(search_term)||'%' or c.name ilike '%'||trim(search_term)||'%')
  and (after_created is null or (mc.created_at,mc.id)<(after_created,after_id))
 order by mc.created_at desc,mc.id desc limit least(greatest(coalesce(result_limit,50),1),100)
$$;
revoke all on function public.admin_case_queue_v3(text,text,text,text,text,uuid,text,boolean,boolean,text,timestamptz,uuid,integer) from public,anon;
grant execute on function public.admin_case_queue_v3(text,text,text,text,text,uuid,text,boolean,boolean,text,timestamptz,uuid,integer) to authenticated;
create or replace function private.admin_content_snapshot(selected_type text,selected_id uuid)
returns table(target_campus uuid,snapshot jsonb) language plpgsql stable security definer set search_path='' as $$
begin
 if selected_type='social_post' then return query select s.campus_id,jsonb_build_object('status',s.status,'removedAt',s.removed_at,'removedBy',s.removed_by,'removalReason',s.removal_reason,'deletedAt',s.deleted_at) from public.social_posts s where s.id=selected_id;
 elsif selected_type='discussion_post' then return query select p.campus_id,jsonb_build_object('removedAt',p.removed_at,'removedBy',p.removed_by,'removalReason',p.removal_reason,'deletedAt',p.deleted_at) from public.discussion_posts p where p.id=selected_id;
 elsif selected_type='organization' then return query select o.campus_id,jsonb_build_object('status',o.status,'suspendedAt',o.suspended_at,'deletedAt',o.deleted_at) from public.organizations o where o.id=selected_id;
 elsif selected_type='organization_channel' then return query select o.campus_id,jsonb_build_object('status',ch.status) from public.organization_channels ch join public.organizations o on o.id=ch.organization_id where ch.id=selected_id;
 elsif selected_type='listing' then return query select l.campus_id,jsonb_build_object('status',l.status,'deletedAt',l.deleted_at,'deletedBy',l.deleted_by) from public.listings l where l.id=selected_id;
 elsif selected_type='event' then return query select e.campus_id,jsonb_build_object('cancelledAt',e.cancelled_at,'deletedAt',e.deleted_at,'deletedBy',e.deleted_by) from public.events e where e.id=selected_id;
 end if;
end $$;

create or replace function public.admin_content_directory(search_term text default '',surface_filter text default null,
 status_filter text default null,institution_filter text default null,after_created timestamptz default null,
 after_id uuid default null,result_limit integer default 50)
returns table(id uuid,surface text,target_type text,title text,excerpt text,status text,campus_id uuid,campus_name text,
 campus_short_name text,institution_id text,source_href text,moderation_case_id uuid,moderation_case_status text,
 operational_case_id uuid,operational_case_status text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 with content as (
  select s.id,'social'::text surface,'social_post'::text target_type,left(s.body,120) title,left(s.body,360) excerpt,s.status::text status,s.campus_id,'/social/posts/'||s.id::text source_href,s.created_at from public.social_posts s
  union all select p.id,'discussions','discussion_post',coalesce(p.title,left(p.body,120),'Discussion post'),left(coalesce(p.body,p.link_url,''),360),case when p.deleted_at is not null then 'deleted' when p.removed_at is not null then 'removed' else 'active' end,p.campus_id,'/discussions/posts/'||p.id::text,p.created_at from public.discussion_posts p
  union all select o.id,'organizations','organization',o.name,left(o.description,360),o.status::text,o.campus_id,'/organizations/'||o.slug::text,o.created_at from public.organizations o
  union all select ch.id,'organizations','organization_channel',o.name||' / #'||ch.name::text,left(ch.description,360),ch.status,o.campus_id,'/organizations/'||o.slug::text,ch.created_at from public.organization_channels ch join public.organizations o on o.id=ch.organization_id
  union all select l.id,'marketplace','listing',l.title,left(l.description,360),case when l.deleted_at is not null then 'deleted' else l.status::text end,l.campus_id,'/listings/'||l.id::text,l.created_at from public.listings l
  union all select e.id,'events','event',e.title,left(e.description,360),case when e.deleted_at is not null then 'deleted' when e.cancelled_at is not null then 'removed' else 'active' end,e.campus_id,'/events?event='||e.id::text,e.created_at from public.events e
 )
 select x.id,x.surface,x.target_type,x.title,x.excerpt,x.status,x.campus_id,c.name,c.short_name,i.id,x.source_href,
  mc.id,mc.status::text,oc.id,oc.status::text,x.created_at
 from content x join public.campuses c on c.id=x.campus_id left join public.institution_directory i on i.campus_id=x.campus_id
 left join lateral (select m.id,m.status from public.moderation_cases m where m.entity_type=x.target_type and m.entity_id=x.id and private.staff_has_capability('cases.read',m.subject_campus_id) order by case when m.status not in ('resolved','dismissed') then 0 else 1 end,m.created_at desc limit 1) mc on true
 left join lateral (select a.id,a.status from public.admin_operational_cases a where a.target_type=x.target_type and a.target_id=x.id::text and private.staff_has_capability('audit.read',a.campus_id) order by a.created_at desc limit 1) oc on true
 where private.staff_has_capability('content.read',x.campus_id) and (surface_filter is null or x.surface=surface_filter)
  and (institution_filter is null or i.id=institution_filter)
  and (status_filter is null or x.status=status_filter or (status_filter='reported' and mc.id is not null and mc.status not in ('resolved','dismissed')) or (status_filter='restricted' and x.status in ('suspended','read_only','removed','withdrawn')))
  and (trim(search_term)='' or x.title ilike '%'||trim(search_term)||'%' or x.excerpt ilike '%'||trim(search_term)||'%' or c.name ilike '%'||trim(search_term)||'%' or x.id::text ilike '%'||trim(search_term)||'%')
  and (after_created is null or (x.created_at,x.id)<(after_created,after_id))
 order by x.created_at desc,x.id desc limit least(greatest(coalesce(result_limit,50),1),100)
$$;
revoke all on function public.admin_content_directory(text,text,text,text,timestamptz,uuid,integer) from public,anon;
grant execute on function public.admin_content_directory(text,text,text,text,timestamptz,uuid,integer) to authenticated;

create or replace function public.apply_admin_content_action(selected_action text,selected_target_type text,selected_target_id uuid,
 submitted_reason text,request_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare caller uuid:=(select auth.uid()); declare target_campus uuid; declare prior jsonb; declare after_snapshot jsonb; declare result uuid;
begin
 if char_length(trim(submitted_reason))<10 then raise exception 'operational reason required' using errcode='23514'; end if;
 select a.id into result from public.admin_operational_cases a where a.actor_id=caller and a.idempotency_key=request_key;
 if result is not null then return result; end if;
 select s.target_campus,s.snapshot into target_campus,prior from private.admin_content_snapshot(selected_target_type,selected_target_id) s;
 if prior is null then raise exception 'administrative target unavailable' using errcode='P0002'; end if;
 if not private.staff_has_capability('content.act',target_campus) then raise exception 'staff capability denied' using errcode='42501'; end if;
 if selected_action not in ('review_requested','remove','restrict','restore') then raise exception 'unsupported content action' using errcode='23514'; end if;
 insert into public.admin_operational_cases(campus_id,actor_id,capability,action,target_type,target_id,reason,before_state,status,idempotency_key)
 values(target_campus,caller,'content.act',selected_action,selected_target_type,selected_target_id::text,trim(submitted_reason),prior,case when selected_action='review_requested' then 'open'::public.admin_operational_case_status else 'open'::public.admin_operational_case_status end,request_key) returning id into result;
 if selected_action<>'review_requested' then
  if selected_target_type='social_post' and selected_action='remove' then update public.social_posts set status='removed',removed_at=coalesce(removed_at,now()),removed_by=caller,removal_reason=trim(submitted_reason) where id=selected_target_id and deleted_at is null;
  elsif selected_target_type='social_post' and selected_action='restore' then update public.social_posts set status='active',removed_at=null,removed_by=null,removal_reason=null where id=selected_target_id and deleted_at is null;
  elsif selected_target_type='discussion_post' and selected_action='remove' then update public.discussion_posts set removed_at=coalesce(removed_at,now()),removed_by=caller,removal_reason=trim(submitted_reason) where id=selected_target_id and deleted_at is null;
  elsif selected_target_type='discussion_post' and selected_action='restore' then update public.discussion_posts set removed_at=null,removed_by=null,removal_reason=null where id=selected_target_id and deleted_at is null;
  elsif selected_target_type='organization' and selected_action in ('remove','restrict') then update public.organizations set status='suspended',suspended_at=coalesce(suspended_at,now()) where id=selected_target_id and deleted_at is null;
  elsif selected_target_type='organization' and selected_action='restore' then update public.organizations set status='active',suspended_at=null where id=selected_target_id and deleted_at is null;
  elsif selected_target_type='organization_channel' and selected_action='restrict' then update public.organization_channels set status='read_only' where id=selected_target_id;
  elsif selected_target_type='organization_channel' and selected_action='remove' then update public.organization_channels set status='removed' where id=selected_target_id;
  elsif selected_target_type='organization_channel' and selected_action='restore' then update public.organization_channels set status='active' where id=selected_target_id;
  elsif selected_target_type='listing' and selected_action='remove' then update public.listings set status='withdrawn',deleted_at=coalesce(deleted_at,now()),deleted_by=caller where id=selected_target_id and status<>'sold';
  elsif selected_target_type='listing' and selected_action='restore' then update public.listings set status=case when (prior->>'status')='withdrawn' then 'active'::public.listing_status else (prior->>'status')::public.listing_status end,deleted_at=null,deleted_by=null where id=selected_target_id and status<>'sold';
  elsif selected_target_type='event' and selected_action='remove' then update public.events set cancelled_at=coalesce(cancelled_at,now()) where id=selected_target_id;
  elsif selected_target_type='event' and selected_action='restore' then update public.events set cancelled_at=null,deleted_at=null,deleted_by=null where id=selected_target_id;
  else raise exception 'unsupported content action' using errcode='23514'; end if;
  select s.snapshot into after_snapshot from private.admin_content_snapshot(selected_target_type,selected_target_id) s;
  update public.admin_operational_cases set status='applied',after_state=after_snapshot where id=result;
 end if;
 insert into public.audit_log(campus_id,actor_id,action,target_type,target_id,metadata) values(target_campus,caller,'admin.'||selected_action,selected_target_type,selected_target_id::text,jsonb_build_object('operationalCaseId',result,'reason',trim(submitted_reason)));
 return result;
end $$;
revoke all on function public.apply_admin_content_action(text,text,uuid,text,uuid) from public,anon;
grant execute on function public.apply_admin_content_action(text,text,uuid,text,uuid) to authenticated;
revoke all on function private.admin_content_snapshot(text,uuid) from public,anon,authenticated;
grant execute on function private.admin_content_snapshot(text,uuid) to service_role;

do $$ begin
 if has_function_privilege('anon','public.admin_dashboard_summary()','EXECUTE') or has_function_privilege('anon','public.admin_content_directory(text,text,text,text,timestamp with time zone,uuid,integer)','EXECUTE') then raise exception 'administration projections must not be anonymous'; end if;
end $$;
