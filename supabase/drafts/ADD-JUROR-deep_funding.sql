-- ADD-JUROR-deep_funding.sql — the owner adds one juror for one character of the remix challenge's deep funding test.
-- Run as postgres in the Supabase SQL Editor, after NEXT_deep_funding_jurors.sql (and NEXT_remix_challenge.sql) are
-- applied. The site never adds jurors (P5b); it only reads this list and checks it again each time.
--
-- Edit the three values on the `with` line: the character's slug (CHALLENGE.characters), its book name (the
-- studio.entities name), and the juror's FID. The insert adds nothing (0 rows) if that FID made any sheet of the
-- character or has a stored entry decision for it, or if the character already has 9 jurors. One statement.

with v (character, name, fid) as (values ('bai', 'Bai', 0))
insert into studio.deep_funding_jurors (challenge, character, fid, added_by)
select 'remix-2026-11', v.character, v.fid, 6786 from v
where v.fid > 0
  and not exists (
    select 1 from studio.elements e join studio.entities en on en.id = e.entity_id
    where e.element_type = 'design' and en.kind = 'character' and en.name = v.name and e.created_by_fid = v.fid)
  and not exists (
    select 1 from studio.challenge_eligibility x join studio.element_versions ev on ev.id = x.version_id
    join studio.elements e on e.id = ev.element_id join studio.entities en on en.id = e.entity_id
    where x.challenge = 'remix-2026-11' and x.fid = v.fid and en.kind = 'character' and en.name = v.name)
  and (select count(*) from studio.deep_funding_jurors j where j.challenge = 'remix-2026-11' and j.character = v.character) < 9
on conflict (challenge, character, fid) do nothing
returning character, fid, added_at;
