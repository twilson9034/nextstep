-- v0.4.4.5: validated character customization, backwards compatible with existing adventure choices.
create function ns_private.valid_avatar_design(v jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and octet_length(v::text)<2048 and
 not exists(select 1 from jsonb_object_keys(case when jsonb_typeof(v)='object' then v else '{}'::jsonb end) k where k not in ('skin','hair','hairColor','eyes','outfit','primary','secondary','helmet','number','position','accessory','companion'))
 and (not(v?'skin') or v->>'skin' in ('#f3d6bb','#d6aa83','#ba855c','#94623f','#70472f','#4d3327'))
 and (not(v?'hair') or v->>'hair' in ('short','swept','curly','long','bald'))
 and (not(v?'hairColor') or v->>'hairColor' in ('#39271d','#765033','#deb678','#211c22','#aa4c2d','#d2d6df'))
 and (not(v?'eyes') or v->>'eyes' in ('#483327','#3f749b','#497757','#88704a'))
 and (not(v?'outfit') or v->>'outfit' in ('casual','hockey','space','knight','builder'))
 and (not(v?'primary') or v->>'primary' ~ '^#[0-9a-fA-F]{6}$')
 and (not(v?'secondary') or v->>'secondary' ~ '^#[0-9a-fA-F]{6}$')
 and (not(v?'helmet') or v->>'helmet' ~ '^#[0-9a-fA-F]{6}$')
 and (not(v?'number') or v->>'number' ~ '^[0-9]{1,2}$')
 and (not(v?'position') or v->>'position' in ('skater','goalie'))
 and (not(v?'accessory') or v->>'accessory' in ('none','glasses','freckles','star'))
 and (not(v?'companion') or v->>'companion' in ('none','fox','robot')),false)
$$;
-- CHECK evaluation also occurs on authorized parent direct updates.
grant execute on function ns_private.valid_avatar_design(jsonb) to authenticated;
alter table public.ns_children add column avatar_design jsonb not null default '{}'::jsonb check(ns_private.valid_avatar_design(avatar_design));
grant update(avatar_design) on public.ns_children to authenticated;
create or replace function ns_private.bump_adventure_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.adventure_theme,new.adventure_avatar,new.adventure_color,new.allow_adventure_customization,new.gamification_enabled,new.avatar_design)
 is distinct from (old.adventure_theme,old.adventure_avatar,old.adventure_color,old.allow_adventure_customization,old.gamification_enabled,old.avatar_design) then
 new.adventure_revision:=old.adventure_revision+1;
 else new.adventure_revision:=old.adventure_revision;end if;
 return new;
end $$;
create or replace function ns_private.adventure_snapshot(profile uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('theme',adventure_theme,'avatar',adventure_avatar,'color',adventure_color,'allowed',allow_adventure_customization,'revision',adventure_revision,'design',avatar_design)
 from public.ns_children where id=profile
$$;
create function ns_private.child_avatar_studio(token text,theme text,avatar text,color text,design jsonb,expected_revision int) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.ns_children;
begin
 if token is not null then
 select ch.* into c from public.ns_children ch join ns_private.child_devices d on d.profile=ch.id where length(token)=64 and d.token_hash=sha256(convert_to(token,'UTF8')) and not ch.archived for update of ch;
 elsif auth.uid() is not null then select ch.* into c from public.ns_children ch where ch.linked_user=auth.uid() and not ch.archived for update;
 end if;
 if c.id is null then raise exception 'Child access ended' using errcode='42501';end if;
 if not c.gamification_enabled or not c.allow_adventure_customization then raise exception 'Your parent manages your adventure appearance' using errcode='42501';end if;
 if expected_revision is distinct from c.adventure_revision then raise exception 'Appearance changed. Reload and try again.';end if;
 if not ns_private.valid_avatar_design(design) then raise exception 'Invalid avatar choices';end if;
 update public.ns_children set adventure_theme=theme,adventure_avatar=avatar,adventure_color=color,avatar_design=design where id=c.id;
 return ns_private.adventure_snapshot(c.id);
end $$;
revoke all on function ns_private.child_avatar_studio(text,text,text,text,jsonb,int) from public,anon,authenticated;
grant execute on function ns_private.child_avatar_studio(text,text,text,text,jsonb,int) to anon,authenticated;
create function public.ns_child_avatar_studio(theme text,avatar text,color text,design jsonb,expected_revision int,token text default null) returns jsonb language sql security invoker set search_path='' as $$
 select ns_private.child_avatar_studio(token,theme,avatar,color,design,expected_revision)
$$;
revoke all on function public.ns_child_avatar_studio(text,text,text,jsonb,int,text) from public,anon,authenticated;
grant execute on function public.ns_child_avatar_studio(text,text,text,jsonb,int,text) to anon,authenticated;
-- Parent preview is read-only; never mint a device credential or impersonate a child.
create function ns_private.parent_child_preview(profile uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.ns_children; prefs jsonb; rev int; tasks jsonb; rewards jsonb;
begin
 select * into c from public.ns_children ch where ch.id=profile and not ch.archived and ns_private.owns_household(ch.household_id);
 if c.id is null or auth.uid() is null then raise exception 'Active child and household owner required' using errcode='42501';end if;
 if c.linked_user is null then select s.preferences,s.revision into prefs,rev from ns_private.child_setup s where s.profile=c.id;
 else select s.preferences,s.revision into prefs,rev from public.ns_personalization s where s.user_id=c.linked_user;end if;
 prefs:=coalesce(prefs,'{}');rev:=coalesce(rev,-1);
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'done',t.done,'revision',t.revision,'subtasks',t.subtasks,'definition_of_done',t.definition_of_done,'reward_points',t.reward_points) order by t.created_at),'[]') into tasks
 from public.ns_tasks t where t.assignee_child=c.id and t.household_id=c.household_id and coalesce((prefs->'modules')?'Tasks',true);
 rewards:=case when c.rewards_enabled then ns_private.reward_snapshot(c.id,false) else null end;
 return jsonb_build_object('name',c.display_name,'age_group',c.age_group,'preferences',prefs,'revision',rev,'tasks',tasks,'show_support',c.show_support,'show_completed_tasks',c.show_completed_tasks,'may_edit_setup',false,'adventure',ns_private.adventure_snapshot(c.id),'engagement',ns_private.engagement_summary(c.id),'achievements',case when c.gamification_enabled then ns_private.achievement_snapshot(c.id) else '[]'::jsonb end,'family_challenges',ns_private.challenge_snapshot(c.household_id,c.id),'family_challenges_allowed',c.allow_family_challenges,'reward_preview',rewards);
end $$;
revoke all on function ns_private.parent_child_preview(uuid) from public,anon,authenticated;
grant execute on function ns_private.parent_child_preview(uuid) to authenticated;
create function public.ns_parent_child_preview(profile uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select ns_private.parent_child_preview(profile)
$$;
revoke all on function public.ns_parent_child_preview(uuid) from public,anon,authenticated;
grant execute on function public.ns_parent_child_preview(uuid) to authenticated;
