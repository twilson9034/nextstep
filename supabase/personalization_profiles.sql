create table public.ns_personalization(user_id uuid primary key references auth.users(id) on delete cascade, preferences jsonb not null check(jsonb_typeof(preferences)='object' and octet_length(preferences::text)<65536), revision integer not null default 0 check(revision>=0));
alter table public.ns_personalization enable row level security;
revoke all on public.ns_personalization from public,anon,authenticated;
grant select,insert,update(preferences,revision) on public.ns_personalization to authenticated;
create policy personal_read on public.ns_personalization for select to authenticated using ((select auth.uid())=user_id);
create policy personal_insert on public.ns_personalization for insert to authenticated with check ((select auth.uid())=user_id);
create policy personal_update on public.ns_personalization for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);