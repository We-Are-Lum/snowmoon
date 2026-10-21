-- READ-ONLY audit (2026-10-19): last 8 days of writes, checked for values that don't belong to their own row.
-- One SELECT; nothing is written. Each check counts rows; "_bad" lists up to 5 offending ids.
with since as (select now() - interval '8 days' as t),
f as (select * from studio.remix_frames where created_at >= (select t from since)),
b as (select * from studio.storyboards where created_at >= (select t from since) or updated_at >= (select t from since)),
rl as (select * from studio.removal_log where at >= (select t from since)),
wp as (select * from studio.wallet_payments where credited_at >= (select t from since)),
wd as (select * from studio.wallet_debits where at >= (select t from since))
select json_build_object(
 'frames', json_build_object(
   'n', (select count(*) from f),
   'sha_not_in_recipe', (select count(*) from f where recipe->>'output_sha256' is distinct from image_sha256),
   'sha_not_in_url', (select count(*) from f where strpos(image_url, left(image_sha256, 12)) = 0),
   'shot_not_in_recipe', (select count(*) from f where recipe->'shot'->>'id' is distinct from shot_id),
   'cost_not_in_recipe', (select count(*) from f where abs(coalesce((recipe->>'cost_usd')::numeric, -1) - cost_usd) > 0.0001),
   'name_not_in_recipe', (select count(*) from f where recipe->>'by_name' is distinct from by_name),
   'words_not_in_prompt', (select count(*) from f where strpos(prompt, own_words) = 0),
   'no_ask_by_same_person', (select count(*) from f where not exists (select 1 from studio.remix_asks a where a.person = f.person and a.at between f.created_at - interval '10 minutes' and f.created_at + interval '1 minute')),
   'wallet_person_without_account', (select count(*) from f where person < 0 and not exists (select 1 from studio.wallet_accounts w where w.id = -f.person)),
   'cost_out_of_range', (select count(*) from f where cost_usd < 0 or cost_usd > 1),
   'hidden_maker_not_person', (select count(*) from f where hidden_role = 'maker' and hidden_by <> person),
   'hidden_maintainer_not_6786', (select count(*) from f where hidden_role = 'maintainer' and hidden_by <> 6786),
   'hidden_without_who', (select count(*) from f where hidden and (hidden_by is null or hidden_role is null)),
   '_bad', (select json_agg(id) from (select id from f where recipe->>'output_sha256' is distinct from image_sha256 or recipe->'shot'->>'id' is distinct from shot_id or recipe->>'by_name' is distinct from by_name or strpos(prompt, own_words) = 0 or (hidden_role = 'maker' and hidden_by <> person) limit 5) x)),
 'storyboards', json_build_object(
   'n', (select count(*) from b),
   'uses_someone_elses_frame', (select count(*) from b where exists (select 1 from jsonb_array_elements(b.items) it join studio.remix_frames rf on rf.id::text = it->>'frame' where rf.person <> b.person)),
   'frame_of_other_version', (select count(*) from b where exists (select 1 from jsonb_array_elements(b.items) it join studio.remix_frames rf on rf.id::text = it->>'frame' where rf.version_id <> b.version_id)),
   'hidden_maker_not_person', (select count(*) from b where hidden_role = 'maker' and hidden_by <> person),
   'hidden_maintainer_not_6786', (select count(*) from b where hidden_role = 'maintainer' and hidden_by <> 6786),
   'hidden_without_who', (select count(*) from b where hidden and (hidden_by is null or hidden_role is null))),
 'removal_log', json_build_object(
   'n', (select count(*) from rl),
   'by_step_role', (select json_object_agg(k, n) from (select step || '/' || coalesce(role, '-') as k, count(*) as n from rl group by 1) x),
   'author_not_creator', (select count(*) from rl join studio.elements e on e.id = rl.element_id where rl.role = 'author' and rl.by_fid is distinct from e.created_by_fid),
   'element_missing', (select count(*) from rl where not exists (select 1 from studio.elements e where e.id = rl.element_id))),
 'image_asks', json_build_object(
   'n', (select count(*) from studio.image_asks where at >= (select t from since)),
   'bad_fid', (select count(*) from studio.image_asks where at >= (select t from since) and fid <= 0),
   'max_per_fid_day', (select max(n) from (select fid, date_trunc('day', at), count(*) n from studio.image_asks where at >= (select t from since) group by 1, 2) x)),
 'remix_asks', json_build_object('n', (select count(*) from studio.remix_asks where at >= (select t from since))),
 'wallet', json_build_object(
   'payments', (select count(*) from wp),
   'payments_usd', (select sum(usd) from wp),
   'usdc_usd_not_amount', (select count(*) from wp where token = 'USDC' and abs(usd - amount / 1000000.0) > 0.000001),
   'usd_out_of_range', (select count(*) from wp where usd <= 0 or usd > 1000),
   'payment_account_missing', (select count(*) from wp where not exists (select 1 from studio.wallet_accounts w where w.id = wp.account_id)),
   'debits', (select count(*) from wd),
   'debits_usd', (select sum(usd) from wd),
   'debit_out_of_range', (select count(*) from wd where usd <= 0 or usd > 1),
   'debit_account_never_paid', (select count(*) from wd where not exists (select 1 from studio.wallet_payments p where p.account_id = wd.account_id)),
   'accounts_below_zero', (select count(*) from (select a.id from studio.wallet_accounts a group by a.id having coalesce((select sum(usd) from studio.wallet_payments p where p.account_id = a.id), 0) - coalesce((select sum(usd) from studio.wallet_debits d where d.account_id = a.id), 0) < -0.000001) x),
   'prepaid_frames_without_debit', (select count(*) from f where person < 0 and not exists (select 1 from studio.wallet_debits d where d.account_id = -f.person and d.at between f.created_at - interval '10 minutes' and f.created_at + interval '1 minute'))),
 'consents', json_build_object(
   'n', (select count(*) from studio.contributor_consents where created_at >= (select t from since)),
   'by_kind_sha', (select json_object_agg(k, n) from (select kind || '/' || left(consent_text_sha256, 12) as k, count(*) as n from studio.contributor_consents where created_at >= (select t from since) group by 1) x),
   'duplicate_person_kind_sha', (select count(*) from (select fid, kind, consent_text_sha256 from studio.contributor_consents group by 1, 2, 3 having count(*) > 1) x),
   'wallet_fid_without_account', (select count(*) from studio.contributor_consents c where c.fid < 0 and c.created_at >= (select t from since) and not exists (select 1 from studio.wallet_accounts w where w.id = -c.fid)))
)::text as audit;
