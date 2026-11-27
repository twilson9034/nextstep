-- v0.4.4.3: permanent personal milestones and cooperative household goals.
alter table public.ns_children add column allow_family_challenges boolean not null default true;
grant update(allow_family_challenges) on public.ns_children to authenticated;
create table ns_private.family_challenges(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.ns_households(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 100),
 description text not null default '' check(length(description)<=500),
 celebration text not null default '' check(length(celebration)<=200),
 target integer not null check(target between 1 and 1000),
 participants uuid[] not null check(cardinality(participants) between 1 and 100),
 include_adults boolean not null default false,
 progress integer not null default 0 check(progress>=0 and progress<=target),
 archived boolean not null default false,
 created_at timestamptz not null default now(), completed_at timestamptz,
 revision integer not null default 0
);
create index family_challenge_household_idx on ns_private.family_challenges(household_id) where not archived and completed_at is null;
create table ns_private.family_challenge_credits(
 challenge_id uuid not null references ns_private.family_challenges(id) on delete cascade,
 task_id uuid not null, credited_at timestamptz not null default now(),
 primary key(challenge_id,task_id)
);
alter table ns_private.family_challenges enable row level security;
alter table ns_private.family_challenge_credits enable row level security;
revoke all on ns_private.family_challenges,ns_private.family_challenge_credits from public,anon,authenticated;
-- A task can count once per challenge. Serialize progress on the challenge row.
create function ns_private.credit_family_challenge() returns trigger
language plpgsql security definer set search_path='' as $$
declare goal ns_private.family_challenges; adult_id uuid; eligible_child boolean:=false; eligible_adult boolean:=false;
begin
 if not new.done or old.done or new.household_id is null
 or new.household_id is distinct from old.household_id
 or new.assignee_child is distinct from old.assignee_child
 or new.assignee_user is distinct from old.assignee_user then return new;end if;
 if new.assignee_child is not null then
  select exists(select 1 from public.ns_children c where c.id=new.assignee_child and c.household_id=new.household_id and not c.archived and c.allow_family_challenges) into eligible_child;
 else
  adult_id:=coalesce(new.assignee_user,new.creator_id);
  select exists(select 1 from public.ns_households h where h.id=new.household_id and h.owner_id=adult_id)
  or exists(select 1 from public.ns_memberships m where m.household_id=new.household_id and m.user_id=adult_id and m.role='adult') into eligible_adult;
 end if;
 if not eligible_child and not eligible_adult then return new;end if;
 for goal in select g.* from ns_private.family_challenges g where g.household_id=new.household_id
  and not g.archived and g.completed_at is null
  and ((eligible_child and new.assignee_child=any(g.participants)) or (eligible_adult and g.include_adults))
  order by g.id for update loop
  insert into ns_private.family_challenge_credits(challenge_id,task_id) values(goal.id,new.id) on conflict do nothing;
  if found then
   update ns_private.family_challenges set progress=progress+1,completed_at=case when progress+1>=target then now() else null end,revision=revision+1 where id=goal.id;
  end if;
 end loop;
 return new;
end $$;
revoke all on function ns_private.credit_family_challenge() from public,anon,authenticated;
create trigger credit_family_challenge after update of done on public.ns_tasks for each row execute function ns_private.credit_family_challenge();
-- Milestones derive from the existing immutable XP ledger, never spend XP.
create function ns_private.achievement_snapshot(profile uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with totals as (
 select coalesce(sum(xp),0) xp, count(*) filter(where event_key='complete' and xp>0) missions,
 count(*) filter(where event_key like 'step:%' and xp>0) steps
 from ns_private.engagement_awards where child_id=profile
 ), milestones as (
 select v.id,v.title,v.description,v.icon,v.target,v.current,v.sort from totals cross join lateral(values
 ('first-step','First Step','Complete your first individual step','footprints',1::bigint,steps,1),
 ('first-mission','Mission Complete','Finish your first mission','flag',1::bigint,missions,2),
 ('step-builder','Step Builder','Complete 10 individual steps','layers',10::bigint,steps,3),
 ('momentum','Building Momentum','Finish 5 missions','zap',5::bigint,missions,4),
 ('level-two','New Heights','Earn 100 XP','mountain',100::bigint,xp,5),
 ('steady-progress','Steady Progress','Finish 20 missions','star',20::bigint,missions,6),
 ('step-master','Small Steps, Big Things','Complete 50 individual steps','sparkles',50::bigint,steps,7),
 ('level-five','Adventure Expert','Earn 400 XP','trophy',400::bigint,xp,8)
 ) v(id,title,description,icon,target,current,sort)
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'description',description,'icon',icon,'target',target,'current',least(current,target),'earned',current>=target) order by sort),'[]') from milestones
$$;
revoke all on function ns_private.achievement_snapshot(uuid) from public,anon,authenticated;
create function ns_private.challenge_snapshot(house uuid, profile uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(
 jsonb_build_object('id',g.id,'title',g.title,'description',g.description,'celebration',g.celebration,'target',g.target,'progress',g.progress,
 'completed_at',g.completed_at,'created_at',g.created_at,'archived',g.archived,'revision',g.revision)
 || case when profile is null then jsonb_build_object('participants',g.participants,'include_adults',g.include_adults) else '{}'::jsonb end
 order by g.created_at desc,g.id),'[]')
 from ns_private.family_challenges g where g.household_id=house
 and (profile is null or (not g.archived and profile=any(g.participants) and exists(select 1 from public.ns_children c where c.id=profile and c.household_id=house and not c.archived and c.allow_family_challenges)))
$$;
revoke all on function ns_private.challenge_snapshot(uuid,uuid) from public,anon,authenticated;
create function ns_private.parent_challenges(house uuid,action text,challenge uuid,title text,description text,celebration text,target int,participants uuid[],include_adults boolean,expected_revision int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare enrolled uuid[];
begin
 if auth.uid() is null or not ns_private.owns_household(house) then raise exception 'Household owner required' using errcode='42501';end if;
 if action='list' then null;
 elsif action='create' then
  if title is null or target is null or participants is null or include_adults is null then raise exception 'Challenge details required';end if;
  select coalesce(array_agg(distinct c.id),'{}'::uuid[]) into enrolled from public.ns_children c where c.household_id=house and not c.archived and c.allow_family_challenges and c.id=any(participants);
  if cardinality(enrolled)<>cardinality(participants) or cardinality(enrolled)<1 or (cardinality(enrolled)<2 and not include_adults) then raise exception 'Choose at least two eligible participants, including adults if desired';end if;
  insert into ns_private.family_challenges(household_id,title,description,celebration,target,participants,include_adults)
  values(house,btrim(title),coalesce(description,''),coalesce(celebration,''),target,enrolled,include_adults);
 elsif action='edit' then
  if title is null then raise exception 'Challenge name required';end if;
  update ns_private.family_challenges g set title=btrim(parent_challenges.title),description=coalesce(parent_challenges.description,''),celebration=coalesce(parent_challenges.celebration,''),revision=g.revision+1
  where g.id=challenge and g.household_id=house and g.revision=expected_revision and not g.archived;
  if not found then raise exception 'Challenge changed. Refresh and try again.';end if;
 elsif action='archive' then
  update ns_private.family_challenges g set archived=true,revision=g.revision+1 where g.id=challenge and g.household_id=house and g.revision=expected_revision and not g.archived;
  if not found then raise exception 'Challenge changed. Refresh and try again.';end if;
 else raise exception 'Unknown challenge action';end if;
 return ns_private.challenge_snapshot(house,null);
end $$;
revoke all on function ns_private.parent_challenges(uuid,text,uuid,text,text,text,int,uuid[],boolean,int) from public,anon,authenticated;
grant execute on function ns_private.parent_challenges(uuid,text,uuid,text,text,text,int,uuid[],boolean,int) to authenticated;
create function public.ns_parent_challenges(house uuid,action text default 'list',challenge uuid default null,title text default null,description text default null,celebration text default null,target int default null,participants uuid[] default null,include_adults boolean default null,expected_revision int default null) returns jsonb
language sql security invoker set search_path='' as $$
 select ns_private.parent_challenges(house,action,challenge,title,description,celebration,target,participants,include_adults,expected_revision)
$$;
revoke all on function public.ns_parent_challenges(uuid,text,uuid,text,text,text,int,uuid[],boolean,int) from public,anon,authenticated;
grant execute on function public.ns_parent_challenges(uuid,text,uuid,text,text,text,int,uuid[],boolean,int) to authenticated;
-- Extend existing parent summary with personal achievements.
create or replace function ns_private.parent_engagement(profile uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.ns_children c where id=profile and not archived and ns_private.owns_household(c.household_id)) then
 raise exception 'Household owner required' using errcode='42501';end if;
 return ns_private.engagement_summary(profile)||jsonb_build_object('achievements',ns_private.achievement_snapshot(profile));
end $$;
create or replace function ns_private.child_engagement(token text,changes jsonb,expected_revision integer,task_id uuid,task_revision integer,step_id text,step_done boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; profile uuid; house uuid; tasks jsonb; gamified boolean; challenges_allowed boolean;
begin
 result:=ns_private.child_progress(token,changes,expected_revision,task_id,task_revision,step_id,step_done);
 if token is not null then select c.id,c.household_id,c.gamification_enabled,c.allow_family_challenges into profile,house,gamified,challenges_allowed from public.ns_children c join ns_private.child_devices d on d.profile=c.id where d.token_hash=sha256(convert_to(token,'UTF8')) and not c.archived;
 else select id,household_id,gamification_enabled,allow_family_challenges into profile,house,gamified,challenges_allowed from public.ns_children where linked_user=auth.uid() and not archived;end if;
 if profile is null then raise exception 'Child access ended' using errcode='42501';end if;
 select coalesce(jsonb_agg(e || jsonb_build_object('reward_points',t.reward_points) order by ord),'[]') into tasks
 from jsonb_array_elements(result->'tasks') with ordinality a(e,ord) join public.ns_tasks t on t.id=(e->>'id')::uuid and t.assignee_child=profile;
 return result||jsonb_build_object('engagement',ns_private.engagement_summary(profile),'tasks',tasks,'adventure',ns_private.adventure_snapshot(profile),
 'achievements',case when gamified then ns_private.achievement_snapshot(profile) else '[]'::jsonb end,
 'family_challenges',ns_private.challenge_snapshot(house,profile),'family_challenges_allowed',challenges_allowed);
end $$;
