-- Shared restricted workspace, for either a paired device or an authenticated linked child.
create or replace function ns_private.is_linked_child() returns boolean
language sql stable security definer set search_path='' as $$
select exists(select 1 from public.ns_children where linked_user=auth.uid())
$$;
revoke all on function ns_private.is_linked_child() from public,anon;
grant execute on function ns_private.is_linked_child() to authenticated;
-- Children use the narrow RPC below, not the adult task API. Existing private data is preserved.
create policy linked_child_no_direct_task_read on public.ns_tasks as restrictive for select to authenticated
using (not (select ns_private.is_linked_child()));
create policy linked_child_no_direct_task_insert on public.ns_tasks as restrictive for insert to authenticated
with check (not (select ns_private.is_linked_child()));
create policy linked_child_no_direct_task_update on public.ns_tasks as restrictive for update to authenticated
using (not (select ns_private.is_linked_child())) with check (not (select ns_private.is_linked_child()));
create policy linked_child_no_direct_setup_insert on public.ns_personalization as restrictive for insert to authenticated
with check (not (select ns_private.is_linked_child()));
create policy linked_child_no_direct_setup_update on public.ns_personalization as restrictive for update to authenticated
using (not (select ns_private.is_linked_child())) with check (not (select ns_private.is_linked_child()));
create or replace function ns_private.child_workspace(token text, changes jsonb, expected_revision int, task_id uuid, task_revision int)
returns jsonb language plpgsql security definer set search_path='' as $$
declare child public.ns_children; prefs jsonb; rev int; tasks jsonb; tasks_enabled boolean;
begin
 if token is not null then
   if length(token)<>64 then raise exception 'Device access ended' using errcode='42501'; end if;
   select c.* into child from public.ns_children c join ns_private.child_devices d on d.profile=c.id
    where d.token_hash=sha256(convert_to(token,'UTF8')) and not c.archived for update of c;
 elsif auth.uid() is not null then
   select c.* into child from public.ns_children c where c.linked_user=auth.uid() and not c.archived for update;
 end if;
 if child.id is null then raise exception 'Child access ended' using errcode='42501'; end if;
 if child.linked_user is null then
  select s.preferences,s.revision into prefs,rev from ns_private.child_setup s where s.profile=child.id for update;
 else
  select s.preferences,s.revision into prefs,rev from public.ns_personalization s where s.user_id=child.linked_user for update;
 end if;
 prefs:=coalesce(prefs,'{}'); rev:=coalesce(rev,-1);
 if changes is not null then
   if not child.may_edit_setup then raise exception 'Your parent manages these settings' using errcode='42501'; end if;
   if jsonb_typeof(changes)<>'object' or octet_length(changes::text)>=65536 then raise exception 'Invalid preferences'; end if;
   if exists(select 1 from jsonb_object_keys(changes) k where k not in ('step','name','family','styles','behaviors','answers','strengths','decisions','assistance','overrides')) then raise exception 'Only a parent can change available modules'; end if;
   if expected_revision is distinct from rev then raise exception 'Settings changed on another device. Reload to review.'; end if;
   prefs:=prefs||changes;
   if octet_length(prefs::text)>=65536 then raise exception 'Preferences too large'; end if;
   rev:=rev+1;
   if child.linked_user is null then
     insert into ns_private.child_setup values(child.id,prefs,rev) on conflict on constraint child_setup_pkey do update set preferences=excluded.preferences,revision=excluded.revision;
   else
     insert into public.ns_personalization(user_id,preferences,revision) values(child.linked_user,prefs,rev)
     on conflict(user_id) do update set preferences=excluded.preferences,revision=excluded.revision;
   end if;
 end if;
 tasks_enabled:=coalesce((prefs->'modules') ? 'Tasks',true);
 if task_id is not null then
   if not tasks_enabled then raise exception 'Tasks are disabled' using errcode='42501'; end if;
   update public.ns_tasks t set done=true,revision=t.revision+1 where t.id=task_id and t.assignee_child=child.id and t.household_id=child.household_id and not t.done and t.revision=task_revision;
   if not found then raise exception 'Task unavailable or changed. Refresh and try again.'; end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'done',t.done,'revision',t.revision,'subtasks',t.subtasks,'definition_of_done',t.definition_of_done) order by t.created_at),'[]')
 into tasks from public.ns_tasks t where tasks_enabled and t.assignee_child=child.id and t.household_id=child.household_id;
 return jsonb_build_object('name',child.display_name,'preferences',prefs,'revision',rev,'may_edit_setup',child.may_edit_setup,'tasks',tasks);
end $$;
revoke all on function ns_private.child_workspace(text,jsonb,int,uuid,int) from public,anon,authenticated;
grant execute on function ns_private.child_workspace(text,jsonb,int,uuid,int) to anon,authenticated;
grant usage on schema ns_private to anon;
create function public.ns_child_workspace(token text default null,changes jsonb default null,expected_revision int default null,task_id uuid default null,task_revision int default null)
returns jsonb language sql security invoker set search_path='' as $$
 select ns_private.child_workspace(token,changes,expected_revision,task_id,task_revision)
$$;
revoke all on function public.ns_child_workspace(text,jsonb,int,uuid,int) from public,anon,authenticated;
grant execute on function public.ns_child_workspace(text,jsonb,int,uuid,int) to anon,authenticated;
-- Old cached device clients obey the same restrictions.
create or replace function public.ns_device_workspace(token text,changes jsonb default null,expected_revision int default null)
returns jsonb language sql security invoker set search_path='' as $$
 select ns_private.child_workspace(token,changes,expected_revision,null,null)
$$;
-- Do not allow an old device endpoint with a null token to fall back to auth.
