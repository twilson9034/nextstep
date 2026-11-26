create or replace function ns_private.manage_household(h uuid, action text, value text) returns void language plpgsql security definer set search_path='' as $$
declare owner uuid; old_name text; target uuid;
begin
select owner_id,name into owner,old_name from public.ns_households where id=h for update;
if auth.uid() is null or owner is distinct from auth.uid() then raise exception 'Owner required'; end if;
if action='rename' then
if length(trim(value)) not between 1 and 100 then raise exception 'Invalid name'; end if;
update public.ns_households set name=trim(value) where id=h;
elsif action='transfer' then
target:=value::uuid;
if target=owner or not exists(select 1 from public.ns_memberships where household_id=h and user_id=target for update) then raise exception 'Select an existing adult member'; end if;
update public.ns_households set owner_id=target where id=h;
insert into public.ns_memberships(household_id,user_id,role) values(h,owner,'adult') on conflict do nothing;
delete from public.ns_memberships where household_id=h and user_id=target;
elsif action='delete' then
if value is distinct from old_name then raise exception 'Household name mismatch'; end if;
if exists(select 1 from public.ns_children where household_id=h) then raise exception 'Household has child profiles; deletion blocked to preserve them'; end if;
update public.ns_tasks set household_id=null,assignee_user=null,assignee_child=null,revision=revision+1 where household_id=h;
update public.ns_brain_items set household_id=null where household_id=h;
delete from public.ns_households where id=h;
else raise exception 'Invalid action'; end if;
end $$;
revoke all on function ns_private.manage_household(uuid,text,text) from public,anon;
grant execute on function ns_private.manage_household(uuid,text,text) to authenticated;
create or replace function public.ns_manage_household(h uuid, action text, value text) returns void language sql security invoker set search_path='' as $$ select ns_private.manage_household(h,action,value) $$;
revoke all on function public.ns_manage_household(uuid,text,text) from public,anon;
grant execute on function public.ns_manage_household(uuid,text,text) to authenticated;