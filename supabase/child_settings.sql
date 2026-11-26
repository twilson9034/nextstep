alter table public.ns_children add column may_edit_setup boolean not null default true;
grant update(may_edit_setup) on public.ns_children to authenticated;

create function public.ns_parent_child_setup(profile uuid, changes jsonb default null, expected_revision int default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare child public.ns_children; prefs jsonb; rev int;
begin
  select * into child from public.ns_children c where c.id=profile and not c.archived
    and ns_private.owns_household(c.household_id) for update;
  if not found then raise exception 'Active profile and household owner required'; end if;
  if child.linked_user is null then
    select s.preferences,s.revision into prefs,rev from ns_private.child_setup s where s.profile=child.id;
  else
    select s.preferences,s.revision into prefs,rev from public.ns_personalization s where user_id=child.linked_user for update;
  end if;
  if changes is not null then
    if jsonb_typeof(changes)<>'object' or octet_length(changes::text)>=65536 then raise exception 'Invalid preferences'; end if;
    if expected_revision is distinct from coalesce(rev,-1) then raise exception 'Settings changed on another device. Reload to review.'; end if;
    prefs:=coalesce(prefs,'{}')||changes;
    if octet_length(prefs::text)>=65536 then raise exception 'Preferences too large'; end if;
    rev:=coalesce(rev,-1)+1;
    if child.linked_user is null then
      insert into ns_private.child_setup values(child.id,prefs,rev)
        on conflict on constraint child_setup_pkey do update set preferences=excluded.preferences,revision=excluded.revision;
    elsif rev=0 then
      insert into public.ns_personalization values(child.linked_user,prefs,rev);
    else
      update public.ns_personalization set preferences=prefs,revision=rev where user_id=child.linked_user;
    end if;
  end if;
  return jsonb_build_object('preferences',coalesce(prefs,'{}'),'revision',coalesce(rev,-1));
end $$;
revoke all on function public.ns_parent_child_setup(uuid,jsonb,int) from public,anon;
grant execute on function public.ns_parent_child_setup(uuid,jsonb,int) to authenticated;

create function ns_private.can_edit_setup() returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select from public.ns_children where linked_user=auth.uid() and not may_edit_setup)
$$;
revoke all on function ns_private.can_edit_setup() from public,anon;
grant execute on function ns_private.can_edit_setup() to authenticated;
create policy child_setup_insert_permission on public.ns_personalization as restrictive for insert to authenticated
 with check ((select ns_private.can_edit_setup()));
create policy child_setup_update_permission on public.ns_personalization as restrictive for update to authenticated
 using ((select ns_private.can_edit_setup())) with check ((select ns_private.can_edit_setup()));

alter function public.ns_device_workspace(text,jsonb,int) set schema ns_private;
revoke all on function ns_private.ns_device_workspace(text,jsonb,int) from public,anon,authenticated;
create function public.ns_device_workspace(token text,changes jsonb default null,expected_revision int default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare allowed boolean;
begin
  select c.may_edit_setup into allowed from public.ns_children c join ns_private.child_devices d on d.profile=c.id
   where not c.archived and d.token_hash=sha256(convert_to(token,'UTF8')) for update of c;
  if not found then raise exception 'Device access ended' using errcode='42501'; end if;
  if changes is not null and not allowed then raise exception 'Your parent manages these settings'; end if;
  return ns_private.ns_device_workspace(token,changes,expected_revision)||jsonb_build_object('may_edit_setup',allowed);
end $$;
revoke all on function public.ns_device_workspace(text,jsonb,int) from public;
grant execute on function public.ns_device_workspace(text,jsonb,int) to anon,authenticated;
