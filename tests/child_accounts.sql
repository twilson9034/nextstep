-- Run after the v0.4.3.2 migration. All fixtures roll back.
begin;
do $$
declare k text;
begin
  foreach k in array array['parent','child','other','house','profile','sibling'] loop
    perform set_config('test.'||k,gen_random_uuid()::text,true);
  end loop;
  foreach k in array array['parent','child','other'] loop
    insert into auth.users(id,email,email_confirmed_at)
      values(current_setting('test.'||k)::uuid,current_setting('test.'||k)||'@example.invalid',now());
  end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.parent'),true);
insert into public.ns_households(id,owner_id,name) values(current_setting('test.house')::uuid,auth.uid(),'Test family');
insert into public.ns_children(id,household_id,display_name)
  values(current_setting('test.profile')::uuid,current_setting('test.house')::uuid,'Test child'),
        (current_setting('test.sibling')::uuid,current_setting('test.house')::uuid,'Test sibling');
select public.ns_child_invite(current_setting('test.profile')::uuid,current_setting('test.child')||'@example.invalid');
insert into public.ns_tasks(id,creator_id,household_id,title,assignee_child)
  select gen_random_uuid(),auth.uid(),household_id,display_name,id from public.ns_children where household_id=current_setting('test.house')::uuid;
insert into public.ns_personalization(user_id,preferences) values(auth.uid(),'{"step":7}');
select set_config('request.jwt.claim.sub',current_setting('test.other'),true);
do $$
begin
  if exists(select from public.ns_child_connections()) then raise exception 'Unexpected invitation disclosure'; end if;
  begin
    perform public.ns_accept_child_invite(current_setting('test.profile')::uuid);
    raise exception 'Expected denial' using errcode='XX000';
  exception when raise_exception then null; end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.child'),true);
do $$
begin
  if (select count(*) from public.ns_child_connections() where not linked)<>1 then raise exception 'Missing invitation'; end if;
  perform public.ns_accept_child_invite(current_setting('test.profile')::uuid);
  perform public.ns_accept_child_invite(current_setting('test.profile')::uuid);
  if (select count(*) from public.ns_child_connections() where linked)<>1 then raise exception 'Missing linked household'; end if;
  if (select count(*) from public.ns_children)<>1 or (select count(*) from public.ns_tasks)<>1 then raise exception 'Incorrect family visibility'; end if;
  if exists(select from public.ns_personalization) then raise exception 'Parent preferences visible'; end if;
  begin
    insert into public.ns_households(owner_id,name) values(auth.uid(),'Unauthorized');
    raise exception 'Expected denial' using errcode='XX000';
  exception when raise_exception then null; end;
end $$;
insert into public.ns_personalization(user_id,preferences) values(auth.uid(),'{"step":3,"strengths":["Quiet surroundings"]}');
update public.ns_personalization set revision=1,preferences=preferences||'{"step":4}' where revision=0;
do $$
begin
  update public.ns_personalization set preferences='{}' where revision=0;
  if found then raise exception 'Stale revision overwrote progress'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.parent'),true);
update public.ns_children set archived=true where id=current_setting('test.profile')::uuid;
do $$
begin
  if (select count(*) from public.ns_personalization)<>1 or (select preferences->>'step' from public.ns_personalization)<>'7' then raise exception 'Parent preferences changed'; end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.child'),true);
do $$
begin
  if exists(select from public.ns_tasks) or exists(select from public.ns_children) then raise exception 'Archived access remained active'; end if;
  if (select preferences->>'step' from public.ns_personalization)<>'4' then raise exception 'Child progress lost'; end if;
end $$;
rollback;
