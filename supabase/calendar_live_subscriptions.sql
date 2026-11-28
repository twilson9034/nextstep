-- v0.5.1.3: subscription URLs are owner-only; events are separately shareable.
create table public.ns_calendar_subscriptions(
 id uuid primary key default gen_random_uuid(),
 creator_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('crossbar','icloud')),
 feed_url text not null check(char_length(feed_url) between 1 and 4096),
 name text not null check(char_length(btrim(name)) between 1 and 100),
 color text not null default '#06b6d4' check(color ~ '^#[0-9a-fA-F]{6}$'),
 timezone text not null check(char_length(timezone) between 1 and 100),
 household_id uuid references public.ns_households(id) on delete cascade,
 child_id uuid references public.ns_children(id) on delete cascade,
 revision integer not null default 0,
 last_synced_at timestamptz,
 last_warning text not null default '',
 check(child_id is null or household_id is not null),
 unique(creator_id,provider,feed_url)
);
alter table public.ns_calendar_subscriptions enable row level security;
revoke all on public.ns_calendar_subscriptions from public,anon,authenticated;
grant select on public.ns_calendar_subscriptions to authenticated;
create policy subscription_owner_read on public.ns_calendar_subscriptions for select to authenticated
 using(creator_id=(select auth.uid()) and not (select ns_private.is_linked_child()));
alter table public.ns_calendar_events add column subscription_id uuid references public.ns_calendar_subscriptions(id) on delete cascade;
alter table public.ns_calendar_events add column source_key text;
alter table public.ns_calendar_events add column source_name text;
alter table public.ns_calendar_events add column source_color text;
alter table public.ns_calendar_events add constraint calendar_source_fields check(
 (subscription_id is null and source_key is null and source_name is null and source_color is null) or
 (subscription_id is not null and source_key is not null and length(source_key)<=2000 and source_name is not null and source_color ~ '^#[0-9a-fA-F]{6}$'));
create unique index calendar_source_occurrence on public.ns_calendar_events(subscription_id,source_key);
create policy native_calendar_insert_only on public.ns_calendar_events as restrictive for insert to authenticated with check(subscription_id is null);
create policy native_calendar_update_only on public.ns_calendar_events as restrictive for update to authenticated using(subscription_id is null) with check(subscription_id is null);
create policy native_calendar_delete_only on public.ns_calendar_events as restrictive for delete to authenticated using(subscription_id is null);
-- All writes to subscription records and their generated events go through this narrowly scoped RPC.
create function ns_private.calendar_subscription(action text, subscription uuid, expected_revision integer, settings jsonb, entries jsonb, window_start date, window_end date, complete boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s public.ns_calendar_subscriptions; h uuid; c uuid; nm text; col text; provider_name text; link text; tz text; e record; removed integer:=0; synced integer:=0;
begin
 if u is null or ns_private.is_linked_child() then raise exception 'Adult account required' using errcode='42501';end if;
 if action='create' then
  perform pg_advisory_xact_lock(hashtextextended(u::text,0));
  if (select count(*) from public.ns_calendar_subscriptions where creator_id=u)>=10 then raise exception 'Limit of ten subscriptions reached' using errcode='23514';end if;
  nm:=btrim(settings->>'name');col:=settings->>'color';provider_name:=settings->>'provider';link:=settings->>'feed_url';tz:=settings->>'timezone';
  h:=nullif(settings->>'household_id','')::uuid;c:=nullif(settings->>'child_id','')::uuid;
  if not ns_private.valid_task_assignment(h,null,c) then raise exception 'Invalid calendar sharing' using errcode='42501';end if;
  if provider_name='crossbar' and link !~ '^https://accounts\.crossbar\.org/calendar/ical/[0-9]+/?(\?[^#]*)?$' or provider_name='icloud' and link !~ '^https://p[0-9]{1,4}-caldav\.icloud\.com/published/[0-9]+/[A-Za-z0-9_~.=%+-]+/?(\?[^#]*)?$' then raise exception 'Invalid feed URL' using errcode='23514';end if;
  if not exists(select 1 from pg_timezone_names where name=tz) then raise exception 'Invalid calendar timezone' using errcode='23514';end if;
  insert into public.ns_calendar_subscriptions(creator_id,provider,feed_url,name,color,timezone,household_id,child_id)
   values(u,provider_name,link,nm,col,tz,h,c) returning * into s;
 elsif action in ('update','sync','disconnect') then
  select * into s from public.ns_calendar_subscriptions where id=subscription and creator_id=u for update;
  if s.id is null then raise exception 'Subscription not found' using errcode='42501';end if;
  if expected_revision is distinct from s.revision then raise exception 'Subscription changed; reload and retry' using errcode='40001';end if;
  if action='disconnect' then
   delete from public.ns_calendar_subscriptions where id=s.id;
   return jsonb_build_object('disconnected',true);
  end if;
  if action='update' then
   h:=nullif(settings->>'household_id','')::uuid;c:=nullif(settings->>'child_id','')::uuid;
   if not ns_private.valid_task_assignment(h,null,c) then raise exception 'Invalid calendar sharing' using errcode='42501';end if;
   update public.ns_calendar_subscriptions set name=btrim(settings->>'name'),color=settings->>'color',household_id=h,child_id=c,revision=revision+1 where id=s.id returning * into s;
   update public.ns_calendar_events set household_id=h,child_id=c,source_name=s.name,source_color=s.color,revision=revision+1 where subscription_id=s.id;
   return jsonb_build_object('revision',s.revision);
  end if;
  if not ns_private.valid_task_assignment(s.household_id,null,s.child_id) then raise exception 'Calendar sharing is no longer authorized' using errcode='42501';end if;
 else raise exception 'Unknown calendar operation' using errcode='22023';end if;
 if entries is null or jsonb_typeof(entries)<>'array' or jsonb_array_length(entries)>500 or octet_length(entries::text)>2500000 or window_start is null or window_end is null or window_end<window_start or window_end-window_start>400 or window_start<current_date-40 or window_end>current_date+370 then raise exception 'Invalid calendar snapshot' using errcode='23514';end if;
 if exists(select 1 from jsonb_to_recordset(entries) x(key text,event_date date,title text) where key is null or length(key) not between 1 and 2000 or event_date is null or event_date not between window_start and window_end or title is null or char_length(btrim(title)) not between 1 and 200) then raise exception 'Invalid calendar occurrence' using errcode='23514';end if;
 -- Upserts only touch this subscription. Manual events and old one-time copies are never touched.
 for e in select * from jsonb_to_recordset(entries) x(key text,title text,event_date date,start_time time,end_time time,location text,notes text) loop
  insert into public.ns_calendar_events(creator_id,household_id,child_id,title,event_date,start_time,end_time,location,notes,subscription_id,source_key,source_name,source_color)
  values(u,s.household_id,s.child_id,e.title,e.event_date,e.start_time,e.end_time,coalesce(e.location,''),coalesce(e.notes,''),s.id,e.key,s.name,s.color)
  on conflict(subscription_id,source_key) do update set title=excluded.title,event_date=excluded.event_date,start_time=excluded.start_time,end_time=excluded.end_time,location=excluded.location,notes=excluded.notes,household_id=excluded.household_id,child_id=excluded.child_id,source_name=excluded.source_name,source_color=excluded.source_color,revision=ns_calendar_events.revision+1;
  synced:=synced+1;
 end loop;
 if complete is true then
  delete from public.ns_calendar_events ev where ev.subscription_id=s.id and ev.event_date between window_start and window_end and not exists(select 1 from jsonb_to_recordset(entries) x(key text) where x.key=ev.source_key);
  get diagnostics removed=row_count;
 end if;
 update public.ns_calendar_subscriptions set revision=revision+1,last_synced_at=now(),last_warning=case when complete is true then '' else 'Incomplete feed: missing events retained' end where id=s.id returning * into s;
 return jsonb_build_object('id',s.id,'revision',s.revision,'synced',synced,'removed',removed);
end $$;
revoke all on function ns_private.calendar_subscription(text,uuid,integer,jsonb,jsonb,date,date,boolean) from public,anon,authenticated;
grant execute on function ns_private.calendar_subscription(text,uuid,integer,jsonb,jsonb,date,date,boolean) to authenticated;
create function public.ns_calendar_subscription(action text, subscription uuid default null, expected_revision integer default null, settings jsonb default '{}', entries jsonb default '[]', window_start date default null, window_end date default null, complete boolean default false)
returns jsonb language sql security invoker set search_path='' as $$ select ns_private.calendar_subscription(action,subscription,expected_revision,settings,entries,window_start,window_end,complete) $$;
revoke all on function public.ns_calendar_subscription(text,uuid,integer,jsonb,jsonb,date,date,boolean) from public,anon,authenticated;
grant execute on function public.ns_calendar_subscription(text,uuid,integer,jsonb,jsonb,date,date,boolean) to authenticated;
create or replace function ns_private.child_calendar(profile uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'event_date',e.event_date,'start_time',e.start_time,'end_time',e.end_time,'location',e.location,'notes',e.notes,'source_name',e.source_name,'source_color',e.source_color) order by e.event_date,e.start_time nulls first,e.id),'[]'::jsonb)
 from public.ns_calendar_events e join public.ns_children c on c.id=profile and not c.archived and c.show_calendar and c.household_id=e.household_id
 where (e.child_id is null or e.child_id=c.id) and e.event_date between current_date-interval '31 days' and current_date+interval '1 year'
$$;
