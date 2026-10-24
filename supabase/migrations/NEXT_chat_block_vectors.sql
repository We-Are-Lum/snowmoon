-- NEXT_chat_block_vectors.sql — the reading assistant's embedding search: one vector per block of the book
-- (owner, 2026-10-24: "Build the search fix and the claim filter into the live chat on a branch"; branch
-- chat-search-live, docs/proposals/chat-eval/search/).
-- DRAFT, NOT APPLIED. No number yet (owner's rule, 2026-10-22): it takes the next free number at merge time,
-- checked against main and production.
--
-- MUST RUN AS postgres (the role that owns the `studio` schema), in the Supabase SQL Editor.
-- Requires 0001 and 0006. Dry run first: paste everything, but replace the final `commit;` with `rollback;`.
--
-- What it adds:
-- 1. pgvector, in Supabase's `extensions` schema (Supabase ships it; no new service).
-- 2. studio.block_vectors: for each readable block, its embedding by one model (bge-small-en-v1.5, int8, the
--    block with the two before it; src/lib/chat/embed.ts). The vectors are computed on the coding agent's
--    machine and loaded by scripts/embed-blocks.ts --load. They are derived from the book's public text and
--    hold nothing about any person. Readable by studio_writer only (the app reads as studio_writer); no
--    public read, because nothing outside the server needs them.
--
-- Read-back after commit: select model, count(*) from studio.block_vectors group by model;  (0 rows until loaded)

begin;

-- Supabase has this schema already; PGlite (the tests) does not.
create schema if not exists extensions;

create extension if not exists vector with schema extensions;

create table studio.block_vectors (
  work_id text not null references studio.works(id),
  chapter int not null,
  idx int not null,
  -- Which model, weights and window made the vector (EMBED.id), so a new model can be loaded beside the old.
  model text not null check (model ~ '^[a-z0-9.-]{1,60}$'),
  -- The block's content_hash when it was embedded: a re-ingested block whose text changed is re-embedded.
  content_hash text not null,
  embedding extensions.vector(384) not null,
  primary key (work_id, model, chapter, idx),
  foreign key (work_id, chapter, idx) references studio.text_blocks (work_id, chapter, idx) on delete cascade
);

-- About 4,100 rows: an exact scan is fast enough, so no approximate index.

alter table studio.block_vectors enable row level security;
create policy writer_read on studio.block_vectors for select to studio_writer using (true);
create policy writer_insert on studio.block_vectors for insert to studio_writer with check (true);
create policy writer_update on studio.block_vectors for update to studio_writer using (true) with check (true);
create policy writer_delete on studio.block_vectors for delete to studio_writer using (true);
revoke all on studio.block_vectors from anon, authenticated;
grant select, insert, update, delete on studio.block_vectors to studio_writer;
-- The vector type and its distance operator live in `extensions`.
grant usage on schema extensions to studio_writer;

commit;
