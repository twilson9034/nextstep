create table public.ns_children(id uuid primary key default gen_random_uuid(),household_id uuid not null references public.ns_households(id) on delete cascade,display_name text not null check(char_length(trim(display_name)) between 1 and 100),age_group text not null default 'unspecified' check(age_group in ('unspecified','preschool','school_age','teen')),archived boolean not null default false);
create index on public.ns_children(household_id);
alter table public.ns_children enable row level security;
revoke all on public.ns_children from public,anon,authenticated;
grant select,insert on public.ns_children to authenticated;
grant update(display_name,age_group,archived) on public.ns_children to authenticated;
create policy child_owner_read on public.ns_children for select to authenticated using(ns_private.owns_household(household_id));
create policy child_owner_insert on public.ns_children for insert to authenticated with check(ns_private.owns_household(household_id));
create policy child_owner_update on public.ns_children for update to authenticated using(ns_private.owns_household(household_id)) with check(ns_private.owns_household(household_id));