-- Disposable fixtures. Run after managed_devices.sql.
begin;
do $$
declare k text;
begin
  foreach k in array array['parent','house','child','sibling','account'] loop
    perform set_config('test.'||k,gen_random_uuid()::text,true);
  end loop;
  foreach k in array array['parent','account'] loop
    insert into auth.users(id,email,email_confirmed_at) values(current_setting('test.'||k)::uuid,current_setting('test.'||k)||'@example.invalid',now());
  end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.parent'),true);
insert into public.ns_households(id,owner_id,name) values(current_setting('test.house')::uuid,auth.uid(),'Family');
insert into public.ns_children(id,household_id,display_name) values(current_setting('test.child')::uuid,current_setting('test.house')::uuid,'Child'),
  (current_setting('test.sibling')::uuid,current_setting('test.house')::uuid,'Sibling');
insert into public.ns_tasks(id,creator_id,household_id,title,assignee_child)
  select gen_random_uuid(),auth.uid(),household_id,display_name,id from public.ns_children where household_id=current_setting('test.house')::uuid;
select set_config('test.code',public.ns_manage_device(current_setting('test.child')::uuid,'issue','Tablet','123456')#>>'{}',true);
select set_config('test.code2',public.ns_manage_device(current_setting('test.child')::uuid,'issue','Phone','123456')#>>'{}',true);
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('test.token',public.ns_pair_device(current_setting('test.code')),true);
select set_config('test.token2',public.ns_pair_device(current_setting('test.code2')),true);
do $$
declare s jsonb; token text:=current_setting('test.token');
begin
  begin
    perform public.ns_pair_device(current_setting('test.code'));
    raise exception 'Code reused' using errcode='XX000';
  exception when raise_exception then null; end;
  s:=public.ns_device_workspace(token,'{"step":2,"strengths":["Quiet surroundings"]}',-1);
  if jsonb_array_length(s->'tasks')<>1 or s#>>'{tasks,0,title}'<>'Child' then raise exception 'Task scope failed'; end if;
  s:=public.ns_device_workspace(current_setting('test.token2'));
  if s#>>'{preferences,step}'<>'2' then raise exception 'Setup missing on second device'; end if;
  begin
    perform public.ns_device_workspace(token,'{"step":3}',-1);
    raise exception 'Accepted stale settings' using errcode='XX000';
  exception when raise_exception then null; end;
  if public.ns_leave_device(token,'000000') or public.ns_leave_device(token,'123456') then raise exception 'PIN cooldown failed'; end if;
  if not public.ns_leave_device(current_setting('test.token2'),'123456') then raise exception 'Valid PIN failed'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.parent'),true);
select public.ns_child_invite(current_setting('test.child')::uuid,current_setting('test.account')||'@example.invalid');
select set_config('request.jwt.claim.sub',current_setting('test.account'),true);
select public.ns_accept_child_invite(current_setting('test.child')::uuid);
do $$
begin
  if (select preferences->>'step' from public.ns_personalization where user_id=auth.uid()) is distinct from '2' then raise exception 'Email linking lost device settings'; end if;
end $$;
select public.ns_device_workspace(current_setting('test.token'),'{"step":3}',0);
select set_config('request.jwt.claim.sub',current_setting('test.parent'),true);
select public.ns_manage_device(current_setting('test.child')::uuid,'revoke',device_id=>((public.ns_manage_device(current_setting('test.child')::uuid,'list')->0)->>'id')::uuid);
do $$
begin
  perform public.ns_device_workspace(current_setting('test.token'));
  raise exception 'Revoked device still works' using errcode='XX000';
exception when insufficient_privilege then null; end $$;
rollback;
