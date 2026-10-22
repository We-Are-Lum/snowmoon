-- 0023: confidential clients at Dynamic Client Registration (owner, 2026-10-21). DRAFT, NOT APPLIED.
--
-- MUST RUN AS postgres, in the Supabase SQL Editor, after 0019. Dry run first: replace the final `commit;`
-- with `rollback;`. Tested only in PGlite (npm run test:agents, group Q).
--
-- The owner's words: "Accept confidential clients at registration: issue a client_secret, store only its
-- hash, check it with a constant-time compare at the token endpoint, and support both client_secret_basic and
-- client_secret_post." A client registered with token_endpoint_auth_method client_secret_basic or
-- client_secret_post gets a secret, shown to it once; only its sha256 is kept here. PKCE stays required for
-- everyone. Public clients (auth_method 'none', Claude) are as before; existing rows become 'none'.

begin;

alter table studio.oauth_clients
  add column auth_method text not null default 'none' check (auth_method in ('none', 'client_secret_basic', 'client_secret_post')),
  add column secret_hash text check (secret_hash is null or secret_hash ~ '^[0-9a-f]{64}$');

-- A confidential client always has a secret; a public one never does. Only registered (dcr) clients can be confidential.
alter table studio.oauth_clients add constraint oauth_clients_secret_kind check (
  (auth_method = 'none' and secret_hash is null) or (auth_method <> 'none' and secret_hash is not null and how = 'dcr'));

commit;
