-- v0.4.4.1: private reward catalog, reserved points and parent approval.
alter table public.ns_children add column require_reward_approval boolean not null default true;
grant update(require_reward_approval) on public.ns_children to authenticated;
create table ns_private.reward_catalog(
 id uuid primary key default gen_random_uuid(),
 child_id uuid not null references public.ns_children(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 100),
 description text not null default '' check(length(description)<=500),
 cost integer not null check(cost between 1 and 100000),
 active boolean not null default true,
 revision integer not null default 0,
 created_at timestamptz not null default now()
);
create index reward_catalog_child_idx on ns_private.reward_catalog(child_id);
create table ns_private.reward_requests(
 id uuid primary key,
 child_id uuid not null references public.ns_children(id) on delete cascade,
 reward_id uuid not null references ns_private.reward_catalog(id),
 title text not null, description text not null, cost integer not null check(cost>0),
 status text not null check(status in ('pending','approved','rejected','cancelled','fulfilled')),
 created_at timestamptz not null default now(),
 decided_at timestamptz, fulfilled_at timestamptz
);
create index reward_requests_child_idx on ns_private.reward_requests(child_id);
create unique index reward_one_pending_idx on ns_private.reward_requests(child_id,reward_id) where status='pending';
alter table ns_private.reward_catalog enable row level security;
alter table ns_private.reward_requests enable row level security;
revoke all on ns_private.reward_catalog,ns_private.reward_requests from public,anon,authenticated;
-- Preserve the existing XP ledger. Reserve on request; spend on approval; release on rejection/cancellation.
create or replace function ns_private.engagement_summary(profile uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('gamification_enabled',c.gamification_enabled,'rewards_enabled',c.rewards_enabled,
 'require_reward_approval',c.require_reward_approval,
 'xp',coalesce(a.xp,0),'reward_points',coalesce(a.points,0)-coalesce(r.reserved,0)-coalesce(r.spent,0),
 'earned_points',coalesce(a.points,0),'reserved_points',coalesce(r.reserved,0),'spent_points',coalesce(r.spent,0),
 'level',1+coalesce(a.xp,0)/100,'completed_awards',coalesce(a.completed,0))
 from public.ns_children c
 left join lateral (select sum(xp) xp,sum(points) points,count(*) filter(where event_key='complete') completed
 from ns_private.engagement_awards where child_id=c.id) a on true
 left join lateral (select sum(cost) filter(where status='pending') reserved,
 sum(cost) filter(where status in ('approved','fulfilled')) spent
 from ns_private.reward_requests where child_id=c.id) r on true
 where c.id=profile
$$;
create function ns_private.reward_snapshot(profile uuid, is_parent boolean) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('engagement',ns_private.engagement_summary(profile),
 'catalog',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'description',r.description,'cost',r.cost,'active',r.active,'revision',r.revision) order by r.created_at,r.id) from ns_private.reward_catalog r where r.child_id=profile and (is_parent or r.active)),'[]'),
 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'reward_id',q.reward_id,'title',q.title,'description',q.description,'cost',q.cost,'status',q.status,'created_at',q.created_at,'decided_at',q.decided_at,'fulfilled_at',q.fulfilled_at) order by q.created_at desc,q.id) from ns_private.reward_requests q where q.child_id=profile),'[]'))
$$;
revoke all on function ns_private.reward_snapshot(uuid,boolean) from public,anon,authenticated;
create function ns_private.parent_rewards(profile uuid, action text, reward uuid, request uuid, title text, description text, cost int, expected_revision int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.ns_children;
begin
 select ch.* into c from public.ns_children ch where ch.id=profile and not ch.archived and ns_private.owns_household(ch.household_id) for update;
 if c.id is null then raise exception 'Household owner required' using errcode='42501';end if;
 if action='list' then null;
 elsif action='create' then
  if title is null or cost is null then raise exception 'Name and point cost required';end if;
  insert into ns_private.reward_catalog(child_id,title,description,cost) values(c.id,btrim(title),coalesce(description,''),cost);
 elsif action='edit' then
  if title is null or cost is null then raise exception 'Name and point cost required';end if;
  update ns_private.reward_catalog r set title=btrim(parent_rewards.title),description=coalesce(parent_rewards.description,''),cost=parent_rewards.cost,revision=r.revision+1 where r.id=reward and r.child_id=c.id and r.revision=expected_revision;
  if not found then raise exception 'Reward changed. Refresh and try again.';end if;
 elsif action in ('archive','restore') then
  update ns_private.reward_catalog r set active=(action='restore'),revision=r.revision+1 where r.id=reward and r.child_id=c.id and r.revision=expected_revision;
  if not found then raise exception 'Reward changed. Refresh and try again.';end if;
 elsif action in ('approve','reject') then
  update ns_private.reward_requests q set status=case when action='approve' then 'approved' else 'rejected' end,decided_at=now() where q.id=request and q.child_id=c.id and q.status='pending';
  if not found then raise exception 'Request already resolved or unavailable';end if;
 elsif action='fulfill' then
  update ns_private.reward_requests q set status='fulfilled',fulfilled_at=now() where q.id=request and q.child_id=c.id and q.status='approved';
  if not found then raise exception 'Only approved requests can be fulfilled';end if;
 else raise exception 'Unknown reward action';end if;
 return ns_private.reward_snapshot(c.id,true);
end $$;
revoke all on function ns_private.parent_rewards(uuid,text,uuid,uuid,text,text,int,int) from public,anon,authenticated;
grant execute on function ns_private.parent_rewards(uuid,text,uuid,uuid,text,text,int,int) to authenticated;
create function public.ns_parent_rewards(profile uuid,action text default 'list',reward uuid default null,request uuid default null,title text default null,description text default null,cost int default null,expected_revision int default null) returns jsonb
language sql security invoker set search_path='' as $$
 select ns_private.parent_rewards(profile,action,reward,request,title,description,cost,expected_revision)
$$;
revoke all on function public.ns_parent_rewards(uuid,text,uuid,uuid,text,text,int,int) from public,anon,authenticated;
grant execute on function public.ns_parent_rewards(uuid,text,uuid,uuid,text,text,int,int) to authenticated;
create function ns_private.child_rewards(token text,action text,reward uuid,request uuid,expected_cost int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.ns_children; item ns_private.reward_catalog; prior ns_private.reward_requests; available bigint;
begin
 if token is not null then
  select ch.* into c from public.ns_children ch join ns_private.child_devices d on d.profile=ch.id
   where length(token)=64 and d.token_hash=sha256(convert_to(token,'UTF8')) and not ch.archived for update of ch;
 elsif auth.uid() is not null then
  select ch.* into c from public.ns_children ch where ch.linked_user=auth.uid() and not ch.archived for update;
 end if;
 if c.id is null then raise exception 'Child access ended' using errcode='42501';end if;
 if not c.rewards_enabled then raise exception 'Rewards are disabled' using errcode='42501';end if;
 if action='list' then null;
 elsif action='request' then
  if request is null or reward is null or expected_cost is null then raise exception 'Invalid reward request';end if;
  select * into prior from ns_private.reward_requests q where q.id=request and q.child_id=c.id;
  if found then
   if prior.reward_id<>reward or prior.cost<>expected_cost then raise exception 'Request does not match';end if;
   return ns_private.reward_snapshot(c.id,false);
  end if;
  select * into item from ns_private.reward_catalog r where r.id=reward and r.child_id=c.id and r.active;
  if not found then raise exception 'Reward is no longer available';end if;
  if item.cost<>expected_cost then raise exception 'Point cost changed. Refresh before requesting.';end if;
  if exists(select 1 from ns_private.reward_requests q where q.child_id=c.id and q.reward_id=reward and q.status='pending') then raise exception 'You already have a request waiting for this reward';end if;
  available:=(ns_private.engagement_summary(c.id)->>'reward_points')::bigint;
  if item.cost>available then raise exception 'Not enough available reward points';end if;
  insert into ns_private.reward_requests(id,child_id,reward_id,title,description,cost,status,decided_at)
   values(request,c.id,item.id,item.title,item.description,item.cost,case when c.require_reward_approval then 'pending' else 'approved' end,case when c.require_reward_approval then null else now() end);
 elsif action='cancel' then
  update ns_private.reward_requests q set status='cancelled',decided_at=now() where q.id=request and q.child_id=c.id and q.status='pending';
  if not found then raise exception 'Only pending requests can be cancelled';end if;
 else raise exception 'Unknown reward action';end if;
 return ns_private.reward_snapshot(c.id,false);
end $$;
revoke all on function ns_private.child_rewards(text,text,uuid,uuid,int) from public,anon,authenticated;
grant execute on function ns_private.child_rewards(text,text,uuid,uuid,int) to anon,authenticated;
create function public.ns_child_rewards(token text default null,action text default 'list',reward uuid default null,request uuid default null,expected_cost int default null) returns jsonb
language sql security invoker set search_path='' as $$
 select ns_private.child_rewards(token,action,reward,request,expected_cost)
$$;
revoke all on function public.ns_child_rewards(text,text,uuid,uuid,int) from public,anon,authenticated;
grant execute on function public.ns_child_rewards(text,text,uuid,uuid,int) to anon,authenticated;
