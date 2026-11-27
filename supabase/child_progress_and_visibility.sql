alter table public.ns_children add column show_support boolean not null default false, add column show_completed_tasks boolean not null default true;
grant update(show_support,show_completed_tasks) on public.ns_children to authenticated;
-- Reuse the existing authorization and locking checks; keep the old endpoint compatible.
create function ns_private.child_progress(token text, changes jsonb, expected_revision integer, task_id uuid, task_revision integer, step_id text, step_done boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.ns_children; result jsonb; task public.ns_tasks; prefs jsonb; updated_steps jsonb; matches integer;
begin
 if token is not null then
   select ch.* into c from public.ns_children ch join ns_private.child_devices d on d.profile=ch.id
   where length(token)=64 and d.token_hash=sha256(convert_to(token,'UTF8')) and not ch.archived for update of ch;
 elsif auth.uid() is not null then
   select ch.* into c from public.ns_children ch where ch.linked_user=auth.uid() and not ch.archived for update;
 end if;
 if c.id is null then raise exception 'Child access ended' using errcode='42501'; end if;
 if changes is not null and (not c.show_support or not c.may_edit_setup) then raise exception 'Your parent manages these settings' using errcode='42501'; end if;
 result:=ns_private.child_workspace(token,changes,expected_revision,null,null);
 prefs:=result->'preferences';
 if task_id is not null then
   if not coalesce((prefs->'modules') ? 'Tasks',true) then raise exception 'Tasks are disabled' using errcode='42501'; end if;
   select * into task from public.ns_tasks t where t.id=task_id and t.assignee_child=c.id and t.household_id=c.household_id and not t.done and t.revision=task_revision for update;
   if not found then raise exception 'Task unavailable or changed. Refresh and try again.'; end if;
   if step_id is not null then
     if step_done is null then raise exception 'Choose a step status'; end if;
     select count(*) into matches from jsonb_array_elements(task.subtasks) e where e->>'id'=step_id;
     if matches<>1 then raise exception 'Step unavailable or changed. Refresh and try again.'; end if;
     select jsonb_agg(case when e->>'id'=step_id then jsonb_set(e,'{done}',to_jsonb(step_done),true) else e end order by ord) into updated_steps from jsonb_array_elements(task.subtasks) with ordinality a(e,ord);
     update public.ns_tasks set subtasks=updated_steps,revision=revision+1 where id=task_id;
   else
     if exists(select 1 from jsonb_array_elements(task.subtasks) e where e->>'done' is distinct from 'true') then raise exception 'Complete the remaining steps first'; end if;
     update public.ns_tasks set done=true,revision=revision+1 where id=task_id;
   end if;
   result:=ns_private.child_workspace(token,null,null,null,null);
 end if;
 return result||jsonb_build_object('show_support',c.show_support,'show_completed_tasks',c.show_completed_tasks,'may_edit_setup',c.may_edit_setup and c.show_support);
end $$;
revoke all on function ns_private.child_progress(text,jsonb,integer,uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function ns_private.child_progress(text,jsonb,integer,uuid,integer,text,boolean) to anon,authenticated;
create function public.ns_child_progress(token text default null,changes jsonb default null,expected_revision integer default null,task_id uuid default null,task_revision integer default null,step_id text default null,step_done boolean default null)
returns jsonb language sql security invoker set search_path='' as $$
 select ns_private.child_progress(token,changes,expected_revision,task_id,task_revision,step_id,step_done)
$$;
revoke all on function public.ns_child_progress(text,jsonb,integer,uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.ns_child_progress(text,jsonb,integer,uuid,integer,text,boolean) to anon,authenticated;
-- Older installed clients cannot bypass completion or settings rules.
create or replace function public.ns_child_workspace(token text default null,changes jsonb default null,expected_revision int default null,task_id uuid default null,task_revision int default null)
returns jsonb language sql security invoker set search_path='' as $$
 select ns_private.child_progress(token,changes,expected_revision,task_id,task_revision,null,null)
$$;
create or replace function public.ns_device_workspace(token text,changes jsonb default null,expected_revision int default null)
returns jsonb language sql security invoker set search_path='' as $$
 select ns_private.child_progress(token,changes,expected_revision,null,null,null,null)
$$;
-- The legacy helper must not be callable directly by API roles.
revoke execute on function ns_private.child_workspace(text,jsonb,integer,uuid,integer) from anon,authenticated;
