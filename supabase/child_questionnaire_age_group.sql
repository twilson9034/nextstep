-- Include the existing managed age group in the authorized child snapshot; no new personal data is collected.
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
 'family_challenges',ns_private.challenge_snapshot(house,profile),'family_challenges_allowed',challenges_allowed,'age_group',(select age_group from public.ns_children where id=profile));
end $$;
