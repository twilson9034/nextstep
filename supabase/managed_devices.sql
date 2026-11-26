create extension if not exists pgcrypto with schema extensions;

create table ns_private.child_devices (
  id uuid primary key default gen_random_uuid(),
  profile uuid not null references public.ns_children on delete cascade,
  label text not null,
  code_hash bytea unique,
  expires timestamptz not null default now()+interval '15 minutes',
  token_hash bytea unique,
  pin_hash text not null,
  failures int not null default 0,
  next_try timestamptz
);
create index on ns_private.child_devices(profile);
create table ns_private.child_setup (
  profile uuid primary key references public.ns_children on delete cascade,
  preferences jsonb not null, revision int not null
);
revoke all on ns_private.child_devices,ns_private.child_setup from public,anon,authenticated;

create function public.ns_manage_device(profile_id uuid, action text, label text default '', pin text default '', device_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare code text;
begin
  perform 1 from public.ns_children c where c.id=profile_id and not c.archived and ns_private.owns_household(c.household_id) for update;
  if not found then raise exception 'Active profile and household owner required'; end if;
  case action
  when 'issue' then
    if pin is null or pin !~ '^[0-9]{6}$' or length(trim(label)) not between 1 and 60 then raise exception 'Enter a device name and six-digit parent PIN'; end if;
    code:=encode(extensions.gen_random_bytes(8),'hex');
    insert into ns_private.child_devices(profile,label,code_hash,pin_hash)
      values(profile_id,trim(label),sha256(convert_to(code,'UTF8')),extensions.crypt(pin,extensions.gen_salt('bf',10)));
    return to_jsonb(code);
  when 'revoke' then
    delete from ns_private.child_devices where profile=profile_id and id=device_id;
    return 'true';
  when 'list' then
    return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',d.label,'paired',token_hash is not null) order by expires),'[]')
      from ns_private.child_devices d where profile=profile_id and (token_hash is not null or expires>now()));
  else raise exception 'Unknown device action';
  end case;
end $$;

create function public.ns_pair_device(code text) returns text language plpgsql security definer set search_path='' as $$
declare secret text:=encode(extensions.gen_random_bytes(32),'hex');
begin
  update ns_private.child_devices d set code_hash=null,token_hash=sha256(convert_to(secret,'UTF8'))
    where code_hash=sha256(convert_to(lower(code),'UTF8')) and expires>now() and token_hash is null
    and exists(select from public.ns_children where id=d.profile and not archived);
  if not found then raise exception 'Code expired or unavailable'; end if;
  return secret;
end $$;

create function public.ns_device_workspace(token text, changes jsonb default null, expected_revision int default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare child public.ns_children; prefs jsonb; rev int; tasks jsonb;
begin
  select c.* into child from public.ns_children c join ns_private.child_devices d on d.profile=c.id
    where d.token_hash=sha256(convert_to(token,'UTF8')) and not c.archived for update of c;
  if not found then raise exception 'Device access ended' using errcode='42501'; end if;
  if child.linked_user is null then
    select s.preferences,s.revision into prefs,rev from ns_private.child_setup s where profile=child.id;
  else
    select s.preferences,s.revision into prefs,rev from public.ns_personalization s where user_id=child.linked_user for update;
  end if;
  if changes is not null then
    if jsonb_typeof(changes)<>'object' or octet_length(changes::text)>=65536 then raise exception 'Invalid preferences'; end if;
    if expected_revision is distinct from coalesce(rev,-1) then raise exception 'Settings changed on another device. Reload to review.'; end if;
    prefs:=coalesce(prefs,'{}')||changes;
    if octet_length(prefs::text)>=65536 then raise exception 'Preferences too large'; end if;
    rev:=coalesce(rev,-1)+1;
    if child.linked_user is null then
      insert into ns_private.child_setup values(child.id,prefs,rev)
        on conflict(profile) do update set preferences=excluded.preferences,revision=excluded.revision;
    elsif rev=0 then
      insert into public.ns_personalization values(child.linked_user,prefs,rev);
    else
      update public.ns_personalization set preferences=prefs,revision=rev where user_id=child.linked_user;
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'done',t.done) order by t.created_at),'[]')
    into tasks from public.ns_tasks t where t.assignee_child=child.id and t.household_id=child.household_id;
  return jsonb_build_object('name',child.display_name,'preferences',coalesce(prefs,'{}'),'revision',coalesce(rev,-1),'tasks',tasks);
end $$;

create function public.ns_leave_device(token text,pin text) returns boolean language plpgsql security definer set search_path='' as $$
declare d ns_private.child_devices;
begin
  select * into d from ns_private.child_devices where token_hash=sha256(convert_to(token,'UTF8')) for update;
  if not found then return true; end if;
  if d.next_try>now() then return false; end if;
  if pin ~ '^[0-9]{6}$' and extensions.crypt(pin,d.pin_hash)=d.pin_hash then
    delete from ns_private.child_devices where id=d.id; return true;
  end if;
  update ns_private.child_devices set failures=failures+1,next_try=now()+make_interval(secs=>least(900,2^least(failures,10))::int) where id=d.id;
  return false;
end $$;

create function ns_private.sync_child_device_link() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.archived and not old.archived then delete from ns_private.child_devices where profile=new.id; end if;
  if new.linked_user is not null and old.linked_user is null then
    insert into public.ns_personalization(user_id,preferences,revision)
      select new.linked_user,preferences,revision from ns_private.child_setup where profile=new.id
      on conflict(user_id) do update set preferences=public.ns_personalization.preferences||excluded.preferences,revision=greatest(public.ns_personalization.revision,excluded.revision)+1;
    delete from ns_private.child_setup where profile=new.id;
  end if;
  return new;
end $$;
create trigger sync_child_device_link after update of linked_user,archived on public.ns_children
  for each row execute function ns_private.sync_child_device_link();
revoke all on function ns_private.sync_child_device_link(),public.ns_manage_device(uuid,text,text,text,uuid), public.ns_pair_device(text),
  public.ns_device_workspace(text,jsonb,int),public.ns_leave_device(text,text) from public,anon,authenticated;
grant execute on function public.ns_manage_device(uuid,text,text,text,uuid) to authenticated;
grant execute on function public.ns_pair_device(text),public.ns_device_workspace(text,jsonb,int),public.ns_leave_device(text,text) to anon,authenticated;
