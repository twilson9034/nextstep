-- Existing awards ledger has no task foreign key. Namespace routine occurrences explicitly
-- so task milestones and task completion awards cannot collide with routine awards.
alter table public.ns_schedules add column reward_points integer not null default 0
 check(reward_points between 0 and 10000);
alter table public.ns_schedules add constraint routine_reward_scope
 check(reward_points=0 or (kind='routine' and household_id is not null));
grant update(reward_points) on public.ns_schedules to authenticated;
create or replace function ns_private.routine_snapshot(who uuid, child boolean) returns jsonb
 language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('earned_xp',coalesce(a.xp,0),'earned_points',coalesce(a.points,0),'completion_awarded',coalesce(a.finished,false))),'[]'::jsonb)
 from ns_private.routine_runs r
 left join lateral (
 select sum(xp) xp,sum(points) points,bool_or(event_key='routine:'||to_char(r.day,'YYYY-MM-DD')||':complete') finished
 from ns_private.engagement_awards
 where child and child_id=r.participant and task_id=r.schedule_id and event_key like 'routine:'||to_char(r.day,'YYYY-MM-DD')||':%'
 ) a on true
 where r.participant=who and r.is_child=child and r.day between current_date-1 and current_date+1
$$;
CREATE OR REPLACE FUNCTION ns_private.routine_action(schedule uuid, on_day date, expected_schedule integer, expected_run integer, action text, later_time time without time zone, token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 -- Award only on a successful forward step, inside the same transaction as progress.
 if child and action='step' then
  if c.gamification_enabled then
   insert into ns_private.engagement_awards(child_id,task_id,event_key,xp,points)
   values(c.id,s.id,'routine:'||to_char(on_day,'YYYY-MM-DD')||':step:'||r.completed,2,0)
   on conflict do nothing;
  end if;
  if r.completed=n and (c.gamification_enabled or c.rewards_enabled) then
   insert into ns_private.engagement_awards(child_id,task_id,event_key,xp,points)
   values(c.id,s.id,'routine:'||to_char(on_day,'YYYY-MM-DD')||':complete',case when c.gamification_enabled then 10 else 0 end,case when c.rewards_enabled then s.reward_points else 0 end)
   on conflict do nothing;
  end if;
 end if;
 return ns_private.routine_snapshot(actor,child);
end $function$
;
