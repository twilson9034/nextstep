-- v0.4.4: opt-in, persistent engagement; no redemption in this release.
alter table public.ns_children add column gamification_enabled boolean not null default false,
 add column rewards_enabled boolean not null default false;
grant update(gamification_enabled,rewards_enabled) on public.ns_children to authenticated;
alter table public.ns_tasks add column reward_points integer not null default 0
 check(reward_points between 0 and 10000);
alter table public.ns_tasks add constraint reward_points_child_only check(assignee_child is not null or reward_points=0);
grant update(reward_points) on public.ns_tasks to authenticated;
create table ns_private.engagement_awards(
 child_id uuid not null references public.ns_children(id) on delete cascade,
 task_id uuid not null, event_key text not null,
 xp integer not null check(xp>=0), points integer not null check(points>=0),
 earned_at timestamptz not null default now(),
 primary key(child_id,task_id,event_key)
);
alter table ns_private.engagement_awards enable row level security;
revoke all on ns_private.engagement_awards from public,anon,authenticated;
create function ns_private.award_child_progress() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.ns_children; item jsonb; sid text;
begin
 if new.assignee_child is null or new.assignee_child is distinct from old.assignee_child
 or new.household_id is distinct from old.household_id then return new; end if;
 select * into c from public.ns_children where id=new.assignee_child and household_id=new.household_id and not archived;
 if not found then return new;end if;
 if c.gamification_enabled then
  for item in select value from jsonb_array_elements(new.subtasks) loop
   sid:=item->>'id';
   if sid is not null and length(sid) between 1 and 200 and item->>'done'='true'
    and exists(select 1 from jsonb_array_elements(old.subtasks) e where e->>'id'=sid and e->>'done'='false') then
    insert into ns_private.engagement_awards(child_id,task_id,event_key,xp,points)
    values(c.id,new.id,'step:'||sid,2,0) on conflict do nothing;
   end if;
  end loop;
 end if;
 if new.done and not old.done and (c.gamification_enabled or c.rewards_enabled) then
  insert into ns_private.engagement_awards(child_id,task_id,event_key,xp,points)
  values(c.id,new.id,'complete',case when c.gamification_enabled then 10 else 0 end,
    case when c.rewards_enabled then new.reward_points else 0 end) on conflict do nothing;
 end if;
 return new;
end $$;
revoke all on function ns_private.award_child_progress() from public,anon,authenticated;
create trigger award_child_progress after update of done,subtasks on public.ns_tasks
 for each row execute function ns_private.award_child_progress();
create function ns_private.engagement_summary(profile uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('gamification_enabled',c.gamification_enabled,'rewards_enabled',c.rewards_enabled,
 'xp',coalesce(a.xp,0),'reward_points',coalesce(a.points,0),'level',1+coalesce(a.xp,0)/100,
 'completed_awards',coalesce(a.completed,0))
 from public.ns_children c left join lateral
 (select sum(xp) xp,sum(points) points,count(*) filter(where event_key='complete') completed
 from ns_private.engagement_awards where child_id=c.id) a on true where c.id=profile
$$;
revoke all on function ns_private.engagement_summary(uuid) from public,anon,authenticated;
create function ns_private.parent_engagement(profile uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.ns_children c where id=profile and not archived and ns_private.owns_household(c.household_id)) then
 raise exception 'Household owner required' using errcode='42501';end if;
 return ns_private.engagement_summary(profile);
end $$;
revoke all on function ns_private.parent_engagement(uuid) from public,anon,authenticated;
grant execute on function ns_private.parent_engagement(uuid) to authenticated;
create function public.ns_parent_engagement(profile uuid) returns jsonb
language sql security invoker set search_path='' as $$ select ns_private.parent_engagement(profile) $$;
revoke all on function public.ns_parent_engagement(uuid) from public,anon,authenticated;
grant execute on function public.ns_parent_engagement(uuid) to authenticated;
create function ns_private.child_engagement(token text, changes jsonb, expected_revision integer, task_id uuid, task_revision integer, step_id text, step_done boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; profile uuid; tasks jsonb;
begin
 -- Existing RPC verifies active child, permissions, task assignment and revision.
 result:=ns_private.child_progress(token,changes,expected_revision,task_id,task_revision,step_id,step_done);
 if token is not null then select c.id into profile from public.ns_children c join ns_private.child_devices d on d.profile=c.id where d.token_hash=sha256(convert_to(token,'UTF8')) and not c.archived;
 else select id into profile from public.ns_children where linked_user=auth.uid() and not archived;end if;
 if profile is null then raise exception 'Child access ended' using errcode='42501';end if;
 select coalesce(jsonb_agg(e || jsonb_build_object('reward_points',t.reward_points) order by ord),'[]') into tasks
 from jsonb_array_elements(result->'tasks') with ordinality a(e,ord) join public.ns_tasks t on t.id=(e->>'id')::uuid and t.assignee_child=profile;
 return result||jsonb_build_object('engagement',ns_private.engagement_summary(profile),'tasks',tasks);
end $$;
revoke all on function ns_private.child_engagement(text,jsonb,integer,uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function ns_private.child_engagement(text,jsonb,integer,uuid,integer,text,boolean) to anon,authenticated;
create or replace function public.ns_child_progress(token text default null,changes jsonb default null,expected_revision integer default null,task_id uuid default null,task_revision integer default null,step_id text default null,step_done boolean default null)
returns jsonb language sql security invoker set search_path='' as $$
 select ns_private.child_engagement(token,changes,expected_revision,task_id,task_revision,step_id,step_done)
$$;
