-- Recurring tasks create one new occurrence per completed task; history is immutable for deduplication.
alter table public.ns_tasks add column repeat_rule text not null default 'none'
 check (repeat_rule in ('none','daily','weekly','monthly'));
alter table public.ns_tasks add constraint repeat_requires_due_date check(repeat_rule='none' or due_date is not null);
grant select(repeat_rule),insert(repeat_rule),update(repeat_rule) on public.ns_tasks to authenticated;
create table ns_private.task_repeat_history(previous_id uuid primary key, next_id uuid not null unique);
alter table ns_private.task_repeat_history enable row level security;
revoke all on ns_private.task_repeat_history from public,anon,authenticated;
create function ns_private.next_task_occurrence() returns trigger
language plpgsql security definer set search_path='' as $$
declare next_id uuid:=gen_random_uuid(); next_due date; new_steps jsonb;
begin
 if old.done or not new.done or new.repeat_rule='none' or new.due_date is null then return new;end if;
 -- Only the existing authorized completion can generate a successor. Do not copy to archived children.
 if new.assignee_child is not null and not exists(select 1 from public.ns_children c where c.id=new.assignee_child and c.household_id=new.household_id and not c.archived) then return new;end if;
 next_due:=case new.repeat_rule when 'daily' then new.due_date+1 when 'weekly' then new.due_date+7 when 'monthly' then (new.due_date+interval '1 month')::date end;
 if next_due is null then return new;end if;
 insert into ns_private.task_repeat_history(previous_id,next_id) values(new.id,next_id) on conflict(previous_id) do nothing;
 if not found then return new;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',gen_random_uuid()::text,'title',s->>'title','done',false) order by ord),'[]') into new_steps from jsonb_array_elements(new.subtasks) with ordinality e(s,ord);
 insert into public.ns_tasks(id,creator_id,household_id,title,priority,due_date,assignee_user,assignee_child,done,revision,effort,subtasks,definition_of_done,reward_points,repeat_rule)
 values(next_id,new.creator_id,new.household_id,new.title,new.priority,next_due,new.assignee_user,new.assignee_child,false,0,new.effort,new_steps,new.definition_of_done,new.reward_points,new.repeat_rule);
 return new;
end $$;
revoke all on function ns_private.next_task_occurrence() from public,anon,authenticated;
create trigger task_repeat_after_completion after update of done on public.ns_tasks for each row execute function ns_private.next_task_occurrence();
CREATE OR REPLACE FUNCTION ns_private.child_engagement(token text, changes jsonb, expected_revision integer, task_id uuid, task_revision integer, step_id text, step_done boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb; profile uuid; house uuid; tasks jsonb; gamified boolean; challenges_allowed boolean;
begin
 result:=ns_private.child_progress(token,changes,expected_revision,task_id,task_revision,step_id,step_done);
 if token is not null then select c.id,c.household_id,c.gamification_enabled,c.allow_family_challenges into profile,house,gamified,challenges_allowed from public.ns_children c join ns_private.child_devices d on d.profile=c.id where d.token_hash=sha256(convert_to(token,'UTF8')) and not c.archived;
 else select id,household_id,gamification_enabled,allow_family_challenges into profile,house,gamified,challenges_allowed from public.ns_children where linked_user=auth.uid() and not archived;end if;
 if profile is null then raise exception 'Child access ended' using errcode='42501';end if;
 select coalesce(jsonb_agg(e || jsonb_build_object('reward_points',t.reward_points,'due_date',t.due_date,'effort',t.effort,'repeat_rule',t.repeat_rule) order by ord),'[]') into tasks
 from jsonb_array_elements(result->'tasks') with ordinality a(e,ord) join public.ns_tasks t on t.id=(e->>'id')::uuid and t.assignee_child=profile;
 return result||jsonb_build_object('engagement',ns_private.engagement_summary(profile),'tasks',tasks,'adventure',ns_private.adventure_snapshot(profile),
 'achievements',case when gamified then ns_private.achievement_snapshot(profile) else '[]'::jsonb end,
 'family_challenges',ns_private.challenge_snapshot(house,profile),'family_challenges_allowed',challenges_allowed,'age_group',(select age_group from public.ns_children where id=profile));
end $function$
;
CREATE OR REPLACE FUNCTION ns_private.parent_child_preview(profile uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.ns_children; prefs jsonb; rev int; tasks jsonb; rewards jsonb;
begin
 select * into c from public.ns_children ch where ch.id=profile and not ch.archived and ns_private.owns_household(ch.household_id);
 if c.id is null or auth.uid() is null then raise exception 'Active child and household owner required' using errcode='42501';end if;
 if c.linked_user is null then select s.preferences,s.revision into prefs,rev from ns_private.child_setup s where s.profile=c.id;
 else select s.preferences,s.revision into prefs,rev from public.ns_personalization s where s.user_id=c.linked_user;end if;
 prefs:=coalesce(prefs,'{}');rev:=coalesce(rev,-1);
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'done',t.done,'revision',t.revision,'subtasks',t.subtasks,'definition_of_done',t.definition_of_done,'reward_points',t.reward_points,'due_date',t.due_date,'effort',t.effort,'repeat_rule',t.repeat_rule) order by t.created_at),'[]') into tasks
 from public.ns_tasks t where t.assignee_child=c.id and t.household_id=c.household_id and coalesce((prefs->'modules')?'Tasks',true);
 rewards:=case when c.rewards_enabled then ns_private.reward_snapshot(c.id,false) else null end;
 return jsonb_build_object('name',c.display_name,'age_group',c.age_group,'preferences',prefs,'revision',rev,'tasks',tasks,'show_support',c.show_support,'show_completed_tasks',c.show_completed_tasks,'may_edit_setup',false,'adventure',ns_private.adventure_snapshot(c.id),'engagement',ns_private.engagement_summary(c.id),'achievements',case when c.gamification_enabled then ns_private.achievement_snapshot(c.id) else '[]'::jsonb end,'family_challenges',ns_private.challenge_snapshot(c.household_id,c.id),'family_challenges_allowed',c.allow_family_challenges,'reward_preview',rewards);
end $function$
;
