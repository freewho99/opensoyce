-- OpenSoyce Trust Vault — vault_sessions table.
--
-- PR-V2-A. Per PR-V1-B §2.4 + PR-V1-A §2.1.
--
-- Opaque server-side session storage. The session_id is stored in an
-- HttpOnly, Secure, SameSite=Lax cookie named `opensoyce_vault_session`.
-- On every authenticated request, the session middleware looks up this
-- row, advances last_seen_at, and (if expired) deletes the row + returns 401.
--
-- Revocation: instant via DELETE on the row. No token blacklist.
-- Reaper: a scheduled function deletes WHERE expires_at < now(). The
-- scheduled reaper job is NOT part of PR-V2-A scope; expired sessions
-- are detected and rejected by the middleware on access.

create table if not exists public.vault_sessions (
  session_id      uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.vault_users(user_id) on delete cascade,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  last_seen_at    timestamptz not null default now(),
  user_agent      text,
  ip_origin       text
);

create index if not exists vault_sessions_user_expires_idx
  on public.vault_sessions (user_id, expires_at);

create index if not exists vault_sessions_expires_idx
  on public.vault_sessions (expires_at);

alter table public.vault_sessions enable row level security;

-- Deny-by-default. Sessions are read by server-side only, never directly by
-- clients. Service role bypasses.
