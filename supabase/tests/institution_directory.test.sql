begin;
create extension if not exists pgtap with schema extensions;
select plan(86);

select is((select count(*)::integer from public.institution_directory),6072,'all HD2024 institutions are imported');
select is((select count(*)::integer from public.institution_directory where source='ipeds' and source_year=2024),6072,'all rows retain IPEDS 2024 provenance');
select is((select count(*)::integer from public.institution_directory where status='active'),5994,'active IPEDS rows are preserved');
select is((select count(*)::integer from public.institution_directory where status<>'active'),78,'inactive, closed, and merged rows are preserved');
select is((select count(distinct source_id)::integer from public.institution_directory where source='ipeds'),6072,'IPEDS UNITIDs are unique');
select is((select count(*)::integer from public.institution_directory where source_hash='d7b20e136fd971d7dce8ad6ec9b7002f0f281f133959f2c3a6c089a5a4610fe5'),6072,'every row records the reviewed source hash');
select is((select count(*)::integer from public.search_institution_directory('',50)),50,'empty search returns a bounded directory page');
select ok(exists(select 1 from public.search_institution_directory('Michigan State University',20) where id='ipeds:171100'),'active institution appears in search');
select ok(exists(select 1 from public.search_institution_directory('Birmingham-Southern College',20) where id='ipeds:100937'),'closed institution appears in search');
select ok(exists(select 1 from public.search_institution_directory('Purdue University - Indianapolis',20) where id='ipeds:500139'),'merged physical-campus record appears in search');
select ok(exists(select 1 from public.search_institution_directory('Alabama A & M University',20) where id='ipeds:100654'),'unverified active institution appears in search');
select is((select availability from public.search_institution_directory('Michigan State University',20) where id='ipeds:171100'),'supported','MSU is immediately supported');
select is((select availability from public.search_institution_directory('University of Illinois Urbana-Champaign',20) where id='ipeds:145637'),'supported','Illinois is immediately supported');
select is((select availability from public.search_institution_directory('Stanford University',20) where id='ipeds:243744'),'supported','Stanford is immediately supported');
select is((select availability from public.search_institution_directory('Alabama A & M University',20) where id='ipeds:100654'),'verification_required','unreviewed active institution routes to domain review');
select is((select availability from public.search_institution_directory('Purdue University-Main Campus',20) where id='ipeds:243780'),'verification_required','shared Purdue main campus routes to review');
select is((select availability from public.search_institution_directory('Purdue University - Indianapolis',20) where id='ipeds:500139'),'verification_required','Purdue Indianapolis remains a distinct review choice');
select is((select availability from public.search_institution_directory('University of Michigan-Ann Arbor',20) where id='ipeds:170976'),'verification_required','Michigan Ann Arbor routes shared domain to review');
select is((select availability from public.search_institution_directory('Birmingham-Southern College',20) where id='ipeds:100937'),'unavailable','closed institution is visible but unavailable');
select is((select count(*)::integer from public.institution_directory where status='active' and registration_status='open'),5994,'current active IPEDS rows accept approved registration or domain review');
select is((select registration_status::text from public.institution_directory where id='ipeds:100937'),'closed','closed institution registration fails closed');
select is((select count(distinct i.id)::integer from public.institution_directory i join public.campuses c on c.id=i.campus_id join public.campus_email_domains d on d.campus_id=c.id where c.status='enabled' and d.is_enabled and d.review_status='reviewed' and d.domain_kind in ('student','institutional')),17,'exactly the reviewed 17 institutions are immediately supported');
select is((select count(*)::integer from public.institution_directory where campus_id is not null),21,'reviewed and known ambiguous campuses are linked without duplicate campuses');
select is((select count(*)::integer from public.campus_email_domains where is_enabled and domain::text not like '%.invalid' and institution_id is null),0,'enabled real domains link to directory institutions');
select is((select count(*)::integer from public.campus_email_domains where domain_kind='shared' and institution_id is null),0,'known shared domains link to explicit physical-campus candidates');

select ok((select relrowsecurity from pg_class where oid='public.institution_directory'::regclass),'institution directory has RLS');
select ok((select relrowsecurity from pg_class where oid='public.institution_domain_verification_challenges'::regclass),'verification challenges have RLS');
select ok((select relrowsecurity from pg_class where oid='public.institution_domain_requests'::regclass),'verified domain requests have RLS');
select is(has_table_privilege('anon','public.institution_directory','SELECT'),false,'anonymous clients cannot query the raw directory table');
select is(has_table_privilege('authenticated','public.institution_directory','SELECT'),false,'authenticated clients cannot query the raw directory table');
select is(has_table_privilege('anon','public.institution_domain_verification_challenges','SELECT'),false,'anonymous clients cannot read challenges');
select is(has_table_privilege('authenticated','public.institution_domain_requests','SELECT'),false,'authenticated clients cannot read verified requests');
select is(has_table_privilege('service_role','public.institution_directory','SELECT'),true,'service role can search directory data');
select is(has_function_privilege('anon','public.search_institution_directory(text,integer)','EXECUTE'),false,'anonymous clients cannot bypass the server search route');
select is(has_function_privilege('service_role','public.search_institution_directory(text,integer)','EXECUTE'),true,'service role can execute safe search');
select is(has_function_privilege('anon','public.complete_institution_domain_verification(uuid,text,text)','EXECUTE'),false,'anonymous clients cannot complete domain verification directly');
select is(has_function_privilege('service_role','public.complete_institution_domain_verification(uuid,text,text)','EXECUTE'),true,'service role can complete domain verification');
select is(has_function_privilege('anon','public.approve_institution_domain_request(uuid,uuid,public.campus_domain_kind,text,text,public.domain_review_confidence,boolean,text)','EXECUTE'),false,'anonymous clients cannot approve mappings');
select is(has_function_privilege('service_role','public.approve_institution_domain_request(uuid,uuid,public.campus_domain_kind,text,text,public.domain_review_confidence,boolean,text)','EXECUTE'),true,'service role can approve mappings');
select is(has_function_privilege('anon','public.merge_institution_directory(text,text,public.institution_directory_status,text)','EXECUTE'),false,'anonymous clients cannot merge institutions');
select is(has_function_privilege('service_role','public.merge_institution_directory(text,text,public.institution_directory_status,text)','EXECUTE'),true,'service role can merge institutions');
select ok((select prosecdef from pg_proc where oid='public.search_institution_directory(text,integer)'::regprocedure),'safe search owns its narrow cross-table projection');
select ok((select prosecdef from pg_proc where oid='public.complete_institution_domain_verification(uuid,text,text)'::regprocedure),'verification completion owns its atomic service-only write');
select ok((select prosecdef from pg_proc where oid='public.approve_institution_domain_request(uuid,uuid,public.campus_domain_kind,text,text,public.domain_review_confidence,boolean,text)'::regprocedure),'approval owns its atomic service-only cross-table write');
select ok((select prosecdef from pg_proc where oid='public.merge_institution_directory(text,text,public.institution_directory_status,text)'::regprocedure),'merge owns its atomic service-only cross-table write');
set local role service_role;
select is((select count(*)::integer from public.search_institution_directory('Michigan State University',20) where id='ipeds:171100'),1,'service role can execute the directory search through the production privilege boundary');
reset role;
select hasnt_column('public','institution_domain_verification_challenges','email','challenge table never stores full email');
select hasnt_column('public','institution_domain_requests','email','request table never stores full email');
select has_column('public','institution_domain_verification_challenges','requester_hash','challenge stores only a keyed requester hash');

select lives_ok($$insert into public.institution_domain_verification_challenges(id,institution_id,email_domain,email_hash,code_hash,requester_hash,expires_at) values('e0000000-0000-4000-8000-000000000001','ipeds:100654','students.aamu.test',repeat('a',64),repeat('b',64),repeat('c',64),now()+interval '10 minutes')$$,'unreviewed institution can begin an ownership challenge');
select is((select outcome from public.complete_institution_domain_verification('e0000000-0000-4000-8000-000000000001',repeat('a',64),repeat('x',64))),'invalid','wrong ownership code fails');
select is((select attempts::integer from public.institution_domain_verification_challenges where id='e0000000-0000-4000-8000-000000000001'),1,'failed attempt is counted');
select is((select outcome from public.complete_institution_domain_verification('e0000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64))),'verified','correct ownership proof creates request');
select is((select count(*)::integer from public.institution_domain_requests where institution_id='ipeds:100654' and email_domain='students.aamu.test'),1,'verified request is linked to selected institution and domain');
select is((select status::text from public.institution_domain_requests where institution_id='ipeds:100654' and email_domain='students.aamu.test'),'pending','ownership verification cannot self-approve mapping');
select is((select email_domain::text from public.institution_domain_requests where institution_id='ipeds:100654'),'students.aamu.test','request retains only normalized domain');
select is((select campus_id from public.institution_directory where id='ipeds:100654'),null,'verification creates no campus');
select is((select count(*)::integer from public.campus_email_domains where domain='students.aamu.test'),0,'verification creates no domain mapping');
select is((select outcome from public.complete_institution_domain_verification('e0000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64))),'invalid','consumed challenge cannot be replayed');
select lives_ok($$insert into public.institution_domain_verification_challenges(id,institution_id,email_domain,email_hash,code_hash,requester_hash,expires_at) values('e0000000-0000-4000-8000-000000000002','ipeds:100654','students.aamu.test',repeat('d',64),repeat('e',64),repeat('f',64),now()+interval '10 minutes')$$,'repeat ownership can use a new challenge');
select is((select outcome from public.complete_institution_domain_verification('e0000000-0000-4000-8000-000000000002',repeat('d',64),repeat('e',64))),'verified','repeat ownership proof is accepted idempotently');
select is((select count(*)::integer from public.institution_domain_requests where institution_id='ipeds:100654' and email_domain='students.aamu.test'),1,'repeat proof does not duplicate request');
select is((select verification_count from public.institution_domain_requests where institution_id='ipeds:100654' and email_domain='students.aamu.test'),2,'repeat proof increments verification demand');

select lives_ok($$insert into public.campuses(id,name,short_name,slug,timezone,status) values('e1000000-0000-4000-8000-000000000001','Alabama A&M Review','AAMU','alabama-a-and-m-review','America/Chicago','disabled')$$,'operator prepares one disabled campus');
select lives_ok($$select public.approve_institution_domain_request((select id from public.institution_domain_requests where institution_id='ipeds:100654' and email_domain='students.aamu.test'),'e1000000-0000-4000-8000-000000000001','student','https://www.aamu.edu/official-email-policy','operator-test','high',false,'pgTAP review')$$,'operator can atomically approve a verified request without enabling it');
select is((select status::text from public.institution_domain_requests where institution_id='ipeds:100654' and email_domain='students.aamu.test'),'approved','request records approval');
select is((select campus_id from public.institution_directory where id='ipeds:100654'),'e1000000-0000-4000-8000-000000000001','approval links existing institution to one campus');
select ok(exists(select 1 from public.campus_email_domains where campus_id='e1000000-0000-4000-8000-000000000001' and domain='students.aamu.test' and review_status='reviewed' and not is_enabled),'approval creates reviewed disabled mapping');
select is((select evidence_url from public.institution_domain_requests where institution_id='ipeds:100654'),'https://www.aamu.edu/official-email-policy','approval records evidence');
select ok(exists(select 1 from public.institution_domain_requests where institution_id='ipeds:100654' and reviewed_by='operator-test' and review_confidence='high'),'approval records reviewer and confidence');
select ok(exists(select 1 from public.directory_operator_audit where action='institution_domain_request.operator_approved' and target_id=(select id::text from public.institution_domain_requests where institution_id='ipeds:100654')),'approval is audited');
select is((select status::text from public.campuses where id='e1000000-0000-4000-8000-000000000001'),'disabled','approval never activates campus implicitly');

select lives_ok($$insert into public.campuses(id,name,short_name,slug,timezone,status) values('e2000000-0000-4000-8000-000000000001','Duplicate Review Campus','Duplicate','duplicate-review-campus','America/Chicago','disabled')$$,'merge fixture has its own campus');
insert into public.institution_directory(id,source,source_id,source_year,name,status,registration_status,campus_id,source_url,source_hash) values
  ('test:source','test','source',2024,'Duplicate Source Institution','active','open','e2000000-0000-4000-8000-000000000001','https://example.invalid/source',repeat('1',64)),
  ('test:target','test','target',2024,'Canonical Target Institution','active','open',null,'https://example.invalid/source',repeat('1',64));
insert into public.campus_email_domains(campus_id,domain,is_enabled,review_status,domain_kind,institution_id)
  values('e2000000-0000-4000-8000-000000000001','students.duplicate.edu',false,'unreviewed','student','test:source');
insert into public.institution_domain_verification_challenges(id,institution_id,email_domain,email_hash,code_hash,requester_hash,expires_at)
  values('e3000000-0000-4000-8000-000000000001','test:source','pending.duplicate.edu',repeat('1',64),repeat('2',64),repeat('3',64),now()+interval '10 minutes');
insert into public.institution_domain_requests(institution_id,email_domain,verified_email_hash)
  values('test:source','requested.duplicate.edu',repeat('4',64));
select lives_ok($$select public.merge_institution_directory('test:source','test:target','duplicate','operator-test')$$,'operator can merge duplicate directory records atomically');
select is((select status::text from public.institution_directory where id='test:source'),'duplicate','source record is retained as duplicate');
select is((select merged_into_id from public.institution_directory where id='test:source'),'test:target','source points to canonical record');
select is((select campus_id from public.institution_directory where id='test:target'),'e2000000-0000-4000-8000-000000000001','canonical record retains campus link');
select is((select campus_id from public.institution_directory where id='test:source'),null,'duplicate source releases campus link');
select is((select institution_id from public.campus_email_domains where domain='students.duplicate.edu'),'test:target','merge moves reviewed domain evidence to the canonical institution');
select is((select institution_id from public.institution_domain_verification_challenges where id='e3000000-0000-4000-8000-000000000001'),'test:target','merge moves pending ownership challenges to the canonical institution');
select is((select institution_id from public.institution_domain_requests where email_domain='requested.duplicate.edu'),'test:target','merge moves non-conflicting verified demand to the canonical institution');
select ok(exists(select 1 from public.directory_operator_audit where action='institution.operator_duplicate' and target_id='test:source'),'merge is audited');

select ok(exists(select 1 from pg_indexes where indexname='institution_directory_name_trgm_idx'),'institution name search has trigram index');
select ok(exists(select 1 from pg_indexes where indexname='institution_domain_requests_queue_idx'),'pending request queue is indexed');
select ok(exists(select 1 from pg_indexes where indexname='institution_domain_challenge_lookup_idx' and indexdef ilike '%where (consumed_at is null)%'),'active challenge lookup uses a partial index');
select ok(exists(select 1 from pg_indexes where indexname='institution_directory_campus_idx' and indexdef ilike 'create unique index%'),'one campus cannot link to duplicate institution records');

select * from finish();
rollback;
