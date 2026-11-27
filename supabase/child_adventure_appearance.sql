-- v0.4.4.2: cosmetic adventure appearance, independent of XP, tasks and rewards.
alter table public.ns_children
 add column adventure_theme text not null default 'simple' check(adventure_theme in ('simple','space','fantasy','animals','builder','sports')),
 add column adventure_avatar text not null default 'explorer' check(adventure_avatar in ('explorer','astronaut','knight','fox','robot','athlete')),
 add column adventure_color text not null default 'cyan' check(adventure_color in ('cyan','violet','gold','green','rose','blue')),
 add column allow_adventure_customization boolean not null default true,
 add column adventure_revision integer not null default 0;
grant update(adventure_theme,adventure_avatar,adventure_color,allow_adventure_customization) on public.ns_children to authenticated;
create function ns_private.bump_adventure_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.adventure_theme,new.adventure_avatar,new.adventure_color,new.allow_adventure_customization,new.gamification_enabled)
 is distinct from (old.adventure_theme,old.adventure_avatar,old.adventure_color,old.allow_adventure_customization,old.gamification_enabled) then
 new.adventure_revision:=old.adventure_revision+1;
 else new.adventure_revision:=old.adventure_revision;end if;
 return new;
end $$;
revoke all on function ns_private.bump_adventure_revision() from public,anon,authenticated;
create trigger adventure_revision before update on public.ns_children for each row execute function ns_private.bump_adventure_revision();
create function ns_private.adventure_snapshot(profile uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('theme',adventure_theme,'avatar',adventure_avatar,'color',adventure_color,'allowed',allow_adventure_customization,'revision',adventure_revision)
 from public.ns_children where id=profile
$$;
revoke all on function ns_private.adventure_snapshot(uuid) from public,anon,authenticated;
create function ns_private.child_adventure(token text, theme text, avatar text, color text, expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.ns_children;
begin
 if token is not null then
  select ch.* into c from public.ns_children ch join ns_private.child_devices d on d.profile=ch.id
   where length(token)=64 and d.token_hash=sha256(convert_to(token,'UTF8')) and not ch.archived for update of ch;
 elsif auth.uid() is not null then
  select ch.* into c from public.ns_children ch where ch.linked_user=auth.uid() and not ch.archived for update;
 end if;
 if c.id is null then raise exception 'Child access ended' using errcode='42501';end if;
 if not c.gamification_enabled or not c.allow_adventure_customization then raise exception 'Your parent manages your adventure appearance' using errcode='42501';end if;
 if expected_revision is distinct from c.adventure_revision then raise exception 'Appearance changed on another device. Reload and try again.';end if;
 if theme is null or avatar is null or color is null then raise exception 'Choose a theme, avatar and color';end if;
 update public.ns_children set adventure_theme=theme,adventure_avatar=avatar,adventure_color=color where id=c.id;
 return ns_private.adventure_snapshot(c.id);
end $$;
revoke all on function ns_private.child_adventure(text,text,text,text,int) from public,anon,authenticated;
grant execute on function ns_private.child_adventure(text,text,text,text,int) to anon,authenticated;
create function public.ns_child_adventure(theme text,avatar text,color text,expected_revision int,token text default null) returns jsonb
language sql security invoker set search_path='' as $$
 select ns_private.child_adventure(token,theme,avatar,color,expected_revision)
$$;
revoke all on function public.ns_child_adventure(text,text,text,int,text) from public,anon,authenticated;
grant execute on function public.ns_child_adventure(text,text,text,int,text) to anon,authenticated;
-- Include appearance in the already-authorized workspace snapshot. Existing clients ignore this extra field.
create or replace function ns_private.child_engagement(token text, changes jsonb, expected_revision integer, task_id uuid, task_revision integer, step_id text, step_done boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; profile uuid; tasks jsonb;
begin
 result:=ns_private.child_progress(token,changes,expected_revision,task_id,task_revision,step_id,step_done);
 if token is not null then select c.id into profile from public.ns_children c join ns_private.child_devices d on d.profile=c.id where d.token_hash=sha256(convert_to(token,'UTF8')) and not c.archived;
 else select id into profile from public.ns_children where linked_user=auth.uid() and not archived;end if;
 if profile is null then raise exception 'Child access ended' using errcode='42501';end if;
 select coalesce(jsonb_agg(e || jsonb_build_object('reward_points',t.reward_points) order by ord),'[]') into tasks
 from jsonb_array_elements(result->'tasks') with ordinality a(e,ord) join public.ns_tasks t on t.id=(e->>'id')::uuid and t.assignee_child=profile;
 return result||jsonb_build_object('engagement',ns_private.engagement_summary(profile),'tasks',tasks,'adventure',ns_private.adventure_snapshot(profile));
end $$;
