-- OpenSoyce Trust Vault — vault_users table.
--
-- PR-V2-A. Per PR-V1-B §2.1.
--
-- OpenSoyce-internal user records, anchored on the immutable GitHub
-- numeric ID (PR-V1-A §3.3). When a user renames their GitHub login,
-- the github_login column updates on next sign-in; github_id never moves.
-- The vault user_id is OpenSoyce-internal and stable across GitHub rename,
-- deletion, or account transfer.
--
-- RLS posture: enabled but no permissive policies. Service role bypasses
-- RLS for all server-side writes (the supabase service_role_key has the
-- BYPASS RLS privilege by default). RLS is defense-in-depth: any future
-- client connecting with a non-service-role JWT gets zero access.

create table if not exists public.vault_users (
  user_id         uuid primary key default gen_random_uuid(),
  github_id       bigint not null unique,
  github_login    text not null,
  display_name    text,
  avatar_url      text,
  created_at      timestamptz not null default now(),
  last_login_at   timestamptz,
  status          text not null default 'active'
                    check (status in ('active','deactivated'))
);

create index if not exists vault_users_github_login_idx
  on public.vault_users (github_login);

alter table public.vault_users enable row level security;

-- Deny-by-default. Service role bypasses; no other principal reads or
-- writes. Future migrations may add scoped SELECT policies (e.g., a user
-- selecting their own row by github_id from a JWT claim) when needed.
