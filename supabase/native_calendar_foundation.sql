-- v0.5.0 native calendar: local civil dates/times, private or household visibility.
create table public.ns_calendar_events(
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null references auth.users(id) on delete cascade,
 household_id uuid references public.ns_households(id) on delete cascade,
 child_id uuid references public.ns_children(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 200),
 event_date date not null,
 start_time time,
 end_time time,
 location text not null default '' check(char_length(location)<=300),
 notes text not null default '' check(char_length(notes)<=2000),
 revision integer not null default 0 check(revision>=0),
 created_at timestamptz not null default now(),
 check(child_id is null or household_id is not null),
 check((start_time is null and end_time is null) or (start_time is not null and (end_time is null or end_time>start_time)))
);
create index ns_calendar_creator_day on public.ns_calendar_events(creator_id,event_date);
create index ns_calendar_house_day on public.ns_calendar_events(household_id,event_date);
alter table public.ns_calendar_events enable row level security;
revoke all on public.ns_calendar_events from public,anon,authenticated;
grant select,insert,delete on public.ns_calendar_events to authenticated;
grant update(household_id,child_id,title,event_date,start_time,end_time,location,notes,revision) on public.ns_calendar_events to authenticated;
create policy calendar_read on public.ns_calendar_events for select to authenticated using (
 not (select ns_private.is_linked_child()) and ((household_id is null and creator_id=(select auth.uid())) or
 (household_id is not null and exists(select 1 from public.ns_households h where h.id=household_id))));
create policy calendar_insert on public.ns_calendar_events for insert to authenticated with check (
 not (select ns_private.is_linked_child()) and creator_id=(select auth.uid()) and ns_private.valid_task_assignment(household_id,null,child_id));
create policy calendar_update on public.ns_calendar_events for update to authenticated using (
 not (select ns_private.is_linked_child()) and creator_id=(select auth.uid()) and (household_id is null or exists(select 1 from public.ns_households h where h.id=household_id)))
 with check(not (select ns_private.is_linked_child()) and creator_id=(select auth.uid()) and ns_private.valid_task_assignment(household_id,null,child_id));
create policy calendar_delete on public.ns_calendar_events for delete to authenticated using (
 not (select ns_private.is_linked_child()) and creator_id=(select auth.uid()) and (household_id is null or exists(select 1 from public.ns_households h where h.id=household_id)));
alter table public.ns_children add column show_calendar boolean not null default true;
grant update(show_calendar) on public.ns_children to authenticated;
create function ns_private.child_calendar(profile uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'event_date',e.event_date,'start_time',e.start_time,'end_time',e.end_time,'location',e.location,'notes',e.notes) order by e.event_date,e.start_time nulls first,e.id),'[]'::jsonb)
 from public.ns_calendar_events e join public.ns_children c on c.id=profile and not c.archived and c.show_calendar and c.household_id=e.household_id
 where (e.child_id is null or e.child_id=c.id) and e.event_date between current_date-interval '31 days' and current_date+interval '1 year'
$$;
revoke all on function ns_private.child_calendar(uuid) from public,anon,authenticated;
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
 'family_challenges',ns_private.challenge_snapshot(house,profile),'family_challenges_allowed',challenges_allowed,'age_group',(select age_group from public.ns_children where id=profile),'show_calendar',(select show_calendar from public.ns_children where id=profile),'calendar',ns_private.child_calendar(profile));
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
 return jsonb_build_object('name',c.display_name,'age_group',c.age_group,'preferences',prefs,'revision',rev,'tasks',tasks,'show_support',c.show_support,'show_completed_tasks',c.show_completed_tasks,'may_edit_setup',false,'adventure',ns_private.adventure_snapshot(c.id),'engagement',ns_private.engagement_summary(c.id),'achievements',case when c.gamification_enabled then ns_private.achievement_snapshot(c.id) else '[]'::jsonb end,'family_challenges',ns_private.challenge_snapshot(c.household_id,c.id),'family_challenges_allowed',c.allow_family_challenges,'reward_preview',rewards,'show_calendar',c.show_calendar,'calendar',ns_private.child_calendar(c.id));
end $function$
;
