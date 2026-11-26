-- Existing managed profiles start without an account or invitation.
alter table public.ns_children
  add column linked_user uuid unique references auth.users(id) on delete set null,
  add column invite_email text,
  add column invite_expires timestamptz;

revoke insert on public.ns_children from authenticated;
grant insert(id, household_id, display_name, age_group, archived) on public.ns_children to authenticated;

-- Serialize changes to adult and child roles for the same identity.
create function ns_private.guard_adult_account() returns trigger
language plpgsql security definer set search_path='' as $$
declare account uuid;
begin
  if tg_table_name = 'ns_households' then account := new.owner_id;
  else account := new.user_id; end if;
  perform pg_advisory_xact_lock(hashtextextended(account::text,0));
  if exists(select 1 from public.ns_children where linked_user=account) then
    raise exception 'A child account cannot manage or join a household as an adult';
  end if;
  return new;
end $$;
revoke all on function ns_private.guard_adult_account() from public, anon, authenticated;
create trigger household_adult_guard before insert or update of owner_id on public.ns_households
  for each row execute function ns_private.guard_adult_account();
create trigger member_adult_guard before insert or update of user_id on public.ns_memberships
  for each row execute function ns_private.guard_adult_account();

create function ns_private.child_invite(profile uuid, address text) returns void
language plpgsql security definer set search_path='' as $$
declare email text := lower(btrim(address));
begin
  if email is not null and (length(email)>254 or email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$') then
    raise exception 'Enter a valid email address';
  end if;
  update public.ns_children set invite_email=email,
    invite_expires=case when email is not null then now()+interval '7 days' end
    where id=profile and linked_user is null and not archived and ns_private.owns_household(household_id);
  if not found then raise exception 'This profile is unavailable for invitations'; end if;
end $$;

create function ns_private.child_connections()
returns table(profile uuid,child_name text,household_name text,linked boolean,archived boolean)
language sql stable security definer set search_path='' as $$
  select c.id,c.display_name,h.name,c.linked_user is not null,c.archived
  from public.ns_children c join public.ns_households h on h.id=c.household_id
  where c.linked_user=auth.uid() or (c.linked_user is null and not c.archived
    and c.invite_expires>now() and ns_private.invited_email(c.invite_email))
$$;

create function ns_private.accept_child_invite(profile uuid) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid := auth.uid();
begin
  if account is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended(account::text,0));
  if exists(select 1 from public.ns_children where id=profile and linked_user=account and not archived) then return; end if;
  if exists(select 1 from public.ns_households where owner_id=account)
    or exists(select 1 from public.ns_memberships where user_id=account)
    or exists(select 1 from public.ns_children where linked_user=account) then
    raise exception 'Use a separate account for this child';
  end if;
  update public.ns_children set linked_user=account,invite_email=null,invite_expires=null
    where id=profile and not archived and linked_user is null and invite_expires>now()
      and ns_private.invited_email(invite_email);
  if not found then raise exception 'Invitation unavailable for this account'; end if;
end $$;

create function ns_private.clear_archived_invite() returns trigger language plpgsql set search_path='' as $$
begin
  if new.archived then new.invite_email:=null; new.invite_expires:=null; end if;
  return new;
end $$;
revoke all on function ns_private.clear_archived_invite() from public,anon,authenticated;
create trigger child_archive_invite before update of archived on public.ns_children
  for each row execute function ns_private.clear_archived_invite();

create policy child_read_self on public.ns_children for select to authenticated
  using (linked_user=(select auth.uid()) and not archived);
create policy child_assigned_task_read on public.ns_tasks for select to authenticated
  using (exists(select 1 from public.ns_children c where c.id=assignee_child
    and c.household_id=ns_tasks.household_id and c.linked_user=(select auth.uid()) and not c.archived));

create function public.ns_child_invite(profile uuid,address text) returns void
language sql security invoker set search_path='' as $$ select ns_private.child_invite(profile,address) $$;
create function public.ns_child_connections()
returns table(profile uuid,child_name text,household_name text,linked boolean,archived boolean)
language sql stable security invoker set search_path='' as $$ select * from ns_private.child_connections() $$;
create function public.ns_accept_child_invite(profile uuid) returns void
language sql security invoker set search_path='' as $$ select ns_private.accept_child_invite(profile) $$;

revoke all on function ns_private.child_invite(uuid,text), ns_private.child_connections(),
  ns_private.accept_child_invite(uuid), public.ns_child_invite(uuid,text), public.ns_child_connections(),
  public.ns_accept_child_invite(uuid) from public,anon;
grant execute on function ns_private.child_invite(uuid,text), ns_private.child_connections(),
  ns_private.accept_child_invite(uuid), public.ns_child_invite(uuid,text), public.ns_child_connections(),
  public.ns_accept_child_invite(uuid) to authenticated;
