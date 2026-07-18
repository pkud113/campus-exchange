-- Cache the authenticated subject once per statement instead of evaluating it
-- for every candidate preference row. Authorization semantics are unchanged.
drop policy if exists notification_preferences_self_select on public.notification_preferences;
drop policy if exists notification_preferences_self_insert on public.notification_preferences;
drop policy if exists notification_preferences_self_update on public.notification_preferences;

create policy notification_preferences_self_select on public.notification_preferences
for select to authenticated
using (profile_id = (select auth.uid()));

create policy notification_preferences_self_insert on public.notification_preferences
for insert to authenticated
with check (profile_id = (select auth.uid()));

create policy notification_preferences_self_update on public.notification_preferences
for update to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));
