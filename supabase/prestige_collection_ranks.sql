-- Extend stable collectible identifiers to include prestige ranks. Existing IDs and thresholds are unchanged.
create or replace function ns_private.valid_world_design(v jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(v)='object' and octet_length(v::text)<1024
 and not exists(select 1 from jsonb_object_keys(case when jsonb_typeof(v)='object' then v else '{}'::jsonb end) k where k not in ('interest','environment','atmosphere','accent','collection','upgrades'))
 and (not(v?'interest') or v->>'interest' in ('auto','simple','hockey','basketball','soccer','football','baseball','gymnastics','motorsports','space','dragons','knights','wizards','pets','wildlife','dinosaurs','ocean','blocks','construction','engineering','camping','mountains','treasure','art','music','design'))
 and (not(v?'environment') or v->>'environment' in ('auto','simple','ice-arena','outdoor-rink','locker-room','basketball-court','soccer-field','football-field','baseball-diamond','gym','racetrack','moon','space-station','mars','alien-planet','castle','enchanted-forest','pet-park','woodland','dinosaur-valley','underwater','block-village','construction-site','workshop','campsite','mountain-trail','island','art-studio','music-studio','design-studio'))
 and (not(v?'atmosphere') or v->>'atmosphere' in ('day','sunset','night'))
 and (not(v?'accent') or v->>'accent' ~ '^#[0-9a-fA-F]{6}$')
 and (not(v?'collection') or v->>'collection'='none' or v->>'collection' ~ '^(simple|hockey|basketball|soccer|football|baseball|gymnastics|motorsports|space|dragons|knights|wizards|pets|wildlife|dinosaurs|ocean|blocks|construction|engineering|camping|mountains|treasure|art|music|design):[1-7]$')
 and (not(v?'upgrades') or jsonb_typeof(v->'upgrades')='boolean'),false)
$$;

create or replace function ns_private.validate_collection_selection() returns trigger
language plpgsql security definer set search_path='' as $$
declare item text; required_xp integer; earned_xp bigint;
begin
 item:=coalesce(new.world_design->>'collection','none');
 if item='none' then return new;end if;
 if not ns_private.valid_world_design(new.world_design) then raise exception 'Invalid collection selection' using errcode='23514';end if;
 required_xp:=case split_part(item,':',2) when '1' then 100 when '2' then 400 when '3' then 900 when '4' then 1000 when '5' then 3000 when '6' then 6000 when '7' then 10000 else 2147483647 end;
 select coalesce(sum(xp),0) into earned_xp from ns_private.engagement_awards where child_id=new.id;
 if earned_xp<required_xp then raise exception 'This collectible is not unlocked yet' using errcode='23514';end if;
 return new;
end $$;
