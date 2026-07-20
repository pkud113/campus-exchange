-- PostgreSQL requires a newly added enum value to be committed before it can
-- be referenced by later schema objects. Keep this migration intentionally
-- isolated from the workspace model that follows.
alter type public.organization_role add value if not exists 'moderator' before 'officer';
