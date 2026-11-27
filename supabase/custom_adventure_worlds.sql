-- v0.4.4.6: interest, environment and atmosphere are independent of avatar gear.
-- Empty object preserves automatic legacy selection; explicit choices survive old clients.
alter table public.ns_children add column world_design jsonb not null default '{}'::jsonb;
create function ns_private.valid_world_design(v jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and octet_length(v::text)<1024
 and not exists(select 1 from jsonb_object_keys(case when jsonb_typeof(v)='object' then v else '{}'::jsonb end) k where k not in ('interest','environment','atmosphere','accent'))
 and (not(v?'interest') or v->>'interest' in ('auto','simple','hockey','basketball','soccer','football','baseball','gymnastics','motorsports','space','dragons','knights','wizards','pets','wildlife','dinosaurs','ocean','blocks','construction','engineering','camping','mountains','treasure','art','music','design'))
 and (not(v?'environment') or v->>'environment' in ('auto','simple','ice-arena','outdoor-rink','locker-room','basketball-court','soccer-field','football-field','baseball-diamond','gym','racetrack','moon','space-station','mars','alien-planet','castle','enchanted-forest','pet-park','woodland','dinosaur-valley','underwater','block-village','construction-site','workshop','campsite','mountain-trail','island','art-studio','music-studio','design-studio'))
 and (not(v?'atmosphere') or v->>'atmosphere' in ('day','sunset','night'))
 and (not(v?'accent') or v->>'accent' ~ '^#[0-9a-fA-F]{6}$'),false)
$$;
revoke all on function ns_private.valid_world_design(jsonb) from public,anon,authenticated;
grant execute on function ns_private.valid_world_design(jsonb) to authenticated;
alter table public.ns_children add constraint valid_world_design check(ns_private.valid_world_design(world_design));
grant update(world_design) on public.ns_children to authenticated;
create or replace function ns_private.bump_adventure_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.adventure_theme,new.adventure_avatar,new.adventure_color,new.allow_adventure_customization,new.gamification_enabled,new.avatar_design,new.world_design)
 is distinct from (old.adventure_theme,old.adventure_avatar,old.adventure_color,old.allow_adventure_customization,old.gamification_enabled,old.avatar_design,old.world_design) then
 new.adventure_revision:=old.adventure_revision+1;
 else new.adventure_revision:=old.adventure_revision;end if;
 return new;
end $$;
create or replace function ns_private.adventure_snapshot(profile uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('theme',adventure_theme,'avatar',adventure_avatar,'color',adventure_color,'allowed',allow_adventure_customization,'revision',adventure_revision,'design',avatar_design,'world',world_design)
 from public.ns_children where id=profile
$$;
create function ns_private.child_world_studio(token text,theme text,avatar text,color text,design jsonb,world jsonb,expected_revision int) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.ns_children;
begin
 if token is not null then
 select ch.* into c from public.ns_children ch join ns_private.child_devices d on d.profile=ch.id where length(token)=64 and d.token_hash=sha256(convert_to(token,'UTF8')) and not ch.archived for update of ch;
 elsif auth.uid() is not null then select ch.* into c from public.ns_children ch where ch.linked_user=auth.uid() and not ch.archived for update;
 end if;
 if c.id is null then raise exception 'Child access ended' using errcode='42501';end if;
 if not c.gamification_enabled or not c.allow_adventure_customization then raise exception 'Your parent manages your adventure appearance' using errcode='42501';end if;
 if expected_revision is distinct from c.adventure_revision then raise exception 'Appearance changed. Reload and try again.';end if;
 if not ns_private.valid_avatar_design(design) or not ns_private.valid_world_design(world) then raise exception 'Invalid appearance choices';end if;
 update public.ns_children set adventure_theme=theme,adventure_avatar=avatar,adventure_color=color,avatar_design=design,world_design=world where id=c.id;
 return ns_private.adventure_snapshot(c.id);
end $$;
revoke all on function ns_private.child_world_studio(text,text,text,text,jsonb,jsonb,int) from public,anon,authenticated;
grant execute on function ns_private.child_world_studio(text,text,text,text,jsonb,jsonb,int) to anon,authenticated;
create function public.ns_child_world_studio(theme text,avatar text,color text,design jsonb,world jsonb,expected_revision int,token text default null) returns jsonb language sql security invoker set search_path='' as $$
 select ns_private.child_world_studio(token,theme,avatar,color,design,world,expected_revision)
$$;
revoke all on function public.ns_child_world_studio(text,text,text,jsonb,jsonb,int,text) from public,anon,authenticated;
grant execute on function public.ns_child_world_studio(text,text,text,jsonb,jsonb,int,text) to anon,authenticated;
