-- Native repeating schedules; occurrences are derived from the anchor, not inserted every day.
create function ns_private.valid_routine_steps(v jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(v)<>'array' then false else jsonb_array_length(v)<=30 and not exists(select 1 from jsonb_array_elements(v) e where jsonb_typeof(e)<>'string' or char_length(btrim(e#>>'{}')) not between 1 and 200) end
$$;
create table public.ns_schedules(
 id uuid primary key default gen_random_uuid(), creator_id uuid not null references auth.users(id) on delete cascade,
 household_id uuid references public.ns_households(id) on delete cascade, child_id uuid references public.ns_children(id) on delete cascade,
 kind text not null check(kind in ('routine','event')), title text not null check(char_length(btrim(title)) between 1 and 200),
 anchor_date date not null, end_date date, start_time time, end_time time,
 repeat_rule text not null check(repeat_rule in ('daily','weekly','monthly','selected')),
 weekdays integer[] not null default '{}', steps jsonb not null default '[]',
 location text not null default '' check(char_length(location)<=300),
 archived boolean not null default false, revision integer not null default 0 check(revision>=0),
 check(child_id is null or household_id is not null), check(end_date is null or end_date>=anchor_date),
 check(end_time is null or start_time is not null and end_time>start_time),
 check(weekdays<@array[0,1,2,3,4,5,6] and cardinality(weekdays)<=7 and (repeat_rule<>'selected' or cardinality(weekdays)>0)),
 check(ns_private.valid_routine_steps(steps) and (kind='routine' and jsonb_array_length(steps)>0 or kind='event' and steps='[]'))
);
alter table public.ns_schedules enable row level security;
revoke all on public.ns_schedules from public,anon,authenticated;
grant select,insert on public.ns_schedules to authenticated;
grant update(title,anchor_date,end_date,start_time,end_time,repeat_rule,weekdays,steps,location,household_id,child_id,archived,revision) on public.ns_schedules to authenticated;
create policy schedule_read on public.ns_schedules for select to authenticated using(not (select ns_private.is_linked_child()) and ((household_id is null and creator_id=(select auth.uid())) or (household_id is not null and exists(select 1 from public.ns_households h where h.id=household_id))));
create policy schedule_insert on public.ns_schedules for insert to authenticated with check(not (select ns_private.is_linked_child()) and creator_id=(select auth.uid()) and ns_private.valid_task_assignment(household_id,null,child_id));
create policy schedule_update on public.ns_schedules for update to authenticated using(not (select ns_private.is_linked_child()) and creator_id=(select auth.uid()) and (household_id is null or exists(select 1 from public.ns_households h where h.id=household_id))) with check(not (select ns_private.is_linked_child()) and creator_id=(select auth.uid()) and ns_private.valid_task_assignment(household_id,null,child_id));
create function ns_private.schedule_occurs(s public.ns_schedules,d date) returns boolean language sql immutable set search_path='' as $$
 select not s.archived and d>=s.anchor_date and (s.end_date is null or d<=s.end_date) and case s.repeat_rule
 when 'daily' then true when 'weekly' then (d-s.anchor_date)%7=0
 when 'selected' then extract(dow from d)::int=any(s.weekdays)
 when 'monthly' then extract(day from d)=least(extract(day from s.anchor_date),extract(day from (date_trunc('month',d::timestamp)+interval '1 month - 1 day'))) else false end
$$;
alter table public.ns_children add column show_routines boolean not null default true;
grant update(show_routines) on public.ns_children to authenticated;
create table ns_private.routine_runs(
 schedule_id uuid not null references public.ns_schedules(id) on delete cascade,
 participant uuid not null, is_child boolean not null, day date not null, schedule_revision integer not null,
 completed integer not null default 0 check(completed>=0), skipped boolean not null default false, later time,
 revision integer not null default 0,
 primary key(schedule_id,participant,is_child,day)
);
alter table ns_private.routine_runs enable row level security;
revoke all on ns_private.routine_runs from public,anon,authenticated;
create function ns_private.routine_snapshot(who uuid,child boolean) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from ns_private.routine_runs r
 where r.participant=who and r.is_child=child and r.day between current_date-1 and current_date+1
$$;
create function ns_private.child_schedules(profile uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(s)-'creator_id'-'household_id'-'child_id' order by s.anchor_date,s.start_time),'[]'::jsonb)
 from public.ns_schedules s join public.ns_children c on c.id=profile and not c.archived and c.household_id=s.household_id
 where not s.archived and (s.child_id is null or s.child_id=c.id) and ((s.kind='routine' and c.show_routines) or (s.kind='event' and c.show_calendar))
$$;
create function ns_private.routine_action(schedule uuid, on_day date, expected_schedule integer, expected_run integer, action text, later_time time, token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.ns_children; s public.ns_schedules; r ns_private.routine_runs; actor uuid; child boolean:=false; n int;
begin
 if token is not null then
  select ch.* into c from public.ns_children ch join ns_private.child_devices d on d.profile=ch.id where length(token)=64 and d.token_hash=sha256(convert_to(token,'UTF8')) and not ch.archived for update of ch;
  if c.id is null then raise exception 'Child access ended' using errcode='42501';end if;
 elsif auth.uid() is not null then
  select ch.* into c from public.ns_children ch where ch.linked_user=auth.uid() and not ch.archived for update;
 end if;
 if c.id is not null then actor:=c.id;child:=true; if not c.show_routines then raise exception 'Routines disabled' using errcode='42501';end if;
 elsif token is not null or auth.uid() is null or ns_private.is_linked_child() then raise exception 'Access ended' using errcode='42501';
 else actor:=auth.uid();end if;
 if action='list' then return ns_private.routine_snapshot(actor,child);end if;
 if on_day is null or on_day not between current_date-1 and current_date+1 then raise exception 'Only current routine occurrences can be changed';end if;
 select * into s from public.ns_schedules x where x.id=schedule and x.kind='routine' and not x.archived for update;
 if s.id is null or not ns_private.schedule_occurs(s,on_day) or (child and (s.household_id is distinct from c.household_id or s.child_id is not null and s.child_id<>c.id)) or (not child and (s.child_id is not null or not (s.creator_id=actor and s.household_id is null or s.household_id is not null and ns_private.valid_task_assignment(s.household_id,null,null)))) then raise exception 'Routine unavailable' using errcode='42501';end if;
 if expected_schedule is distinct from s.revision then raise exception 'Routine changed; refresh and retry' using errcode='40001';end if;
 select * into r from ns_private.routine_runs x where x.schedule_id=s.id and x.participant=actor and x.is_child=child and x.day=on_day for update;
 if r.schedule_id is null then
  if expected_run is distinct from -1 then raise exception 'Progress changed; refresh' using errcode='40001';end if;
  insert into ns_private.routine_runs(schedule_id,participant,is_child,day,schedule_revision) values(s.id,actor,child,on_day,s.revision) returning * into r;
 else
  if expected_run is distinct from r.revision then raise exception 'Progress changed; refresh' using errcode='40001';end if;
  if r.schedule_revision<>s.revision then r.completed:=0;r.skipped:=false;r.later:=null;end if;
 end if;
 n:=jsonb_array_length(s.steps);
 case action
 when 'step' then if r.skipped or r.completed>=n then raise exception 'Routine already finished';end if;r.completed:=r.completed+1;r.later:=null;
 when 'skip' then r.skipped:=true;r.later:=null;
 when 'later' then if later_time is null or r.skipped or r.completed>=n then raise exception 'Choose a later time';end if;r.later:=later_time;
 when 'reset' then r.completed:=0;r.skipped:=false;r.later:=null;
 else raise exception 'Unknown routine action';end case;
 update ns_private.routine_runs set completed=r.completed,skipped=r.skipped,later=r.later,revision=r.revision+1,schedule_revision=s.revision where schedule_id=s.id and participant=actor and is_child=child and day=on_day;
 return ns_private.routine_snapshot(actor,child);
end $$;
revoke all on function ns_private.routine_action(uuid,date,integer,integer,text,time,text) from public,anon,authenticated;
grant execute on function ns_private.routine_action(uuid,date,integer,integer,text,time,text) to anon,authenticated;
create function public.ns_routine_action(action text default 'list',schedule uuid default null,on_day date default null,expected_schedule integer default null,expected_run integer default null,later_time time default null,token text default null) returns jsonb language sql security invoker set search_path='' as $$ select ns_private.routine_action(schedule,on_day,expected_schedule,expected_run,action,later_time,token) $$;
revoke all on function public.ns_routine_action(text,uuid,date,integer,integer,time,text) from public,anon,authenticated;
grant execute on function public.ns_routine_action(text,uuid,date,integer,integer,time,text) to anon,authenticated;
revoke all on function ns_private.routine_snapshot(uuid,boolean),ns_private.child_schedules(uuid),ns_private.schedule_occurs(public.ns_schedules,date) from public,anon,authenticated;
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
 'family_challenges',ns_private.challenge_snapshot(house,profile),'family_challenges_allowed',challenges_allowed,'age_group',(select age_group from public.ns_children where id=profile),'show_calendar',(select show_calendar from public.ns_children where id=profile),'calendar',ns_private.child_calendar(profile),'show_routines',(select show_routines from public.ns_children where id=profile),'schedules',ns_private.child_schedules(profile),'routine_runs',ns_private.routine_snapshot(profile,true));
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
 return jsonb_build_object('name',c.display_name,'age_group',c.age_group,'preferences',prefs,'revision',rev,'tasks',tasks,'show_support',c.show_support,'show_completed_tasks',c.show_completed_tasks,'may_edit_setup',false,'adventure',ns_private.adventure_snapshot(c.id),'engagement',ns_private.engagement_summary(c.id),'achievements',case when c.gamification_enabled then ns_private.achievement_snapshot(c.id) else '[]'::jsonb end,'family_challenges',ns_private.challenge_snapshot(c.household_id,c.id),'family_challenges_allowed',c.allow_family_challenges,'reward_preview',rewards,'show_calendar',c.show_calendar,'calendar',ns_private.child_calendar(c.id),'show_routines',c.show_routines,'schedules',ns_private.child_schedules(c.id),'routine_runs',ns_private.routine_snapshot(c.id,true));
end $function$
;
