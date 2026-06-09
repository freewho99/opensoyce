-- OpenSoyce Trust Vault — vault_device_codes table.
--
-- PR-V2-D. Per PR-V1-E §1.1 (device-code flow).
--
-- Backs the /api/vault/cli/device-code + /api/vault/cli/device-token
-- pairing handshake. A short-lived row that begins life unpaired and
-- becomes "approved" when the user opens the verification URL in a
-- browser and confirms. The CLI polls until approval or timeout.
--
-- Lifecycle:
--   1. POST /api/vault/cli/device-code creates a row in status='pending'
--      with random device_code + user_code + expires_at = now() + 10 min.
--   2. User opens verification URL, signs in via existing GitHub OAuth,
--      enters user_code; backend writes user_id + flips status='approved'.
--   3. CLI polls /api/vault/cli/device-token at the documented interval;
--      first poll after approval creates a vault_sessions row and returns
--      the session token, then flips status='consumed'.
--   4. Expired rows (now() > expires_at) flip to status='expired' on the
--      next poll; the row stays for audit but never produces a token.
--
-- Index choices: device_code lookups on every poll → unique index. user_code
-- lookups on browser approval form → unique partial index on pending rows.

create table if not exists public.vault_device_codes (
  device_code_id  uuid primary key default gen_random_uuid(),
  device_code     text not null unique check (length(device_code) between 32 and 128),
  user_code       text not null check (length(user_code) between 6 and 32),
  status          text not null default 'pending'
                    check (status in ('pending','approved','consumed','expired','denied')),
  approved_by     uuid references public.vault_users(user_id) on delete restrict,
  api_base        text not null,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  approved_at     timestamptz,
  consumed_at     timestamptz
);

create unique index if not exists vault_device_codes_user_code_pending_idx
  on public.vault_device_codes (user_code)
  where status = 'pending';

create index if not exists vault_device_codes_expires_idx
  on public.vault_device_codes (expires_at)
  where status in ('pending','approved');

alter table public.vault_device_codes enable row level security;

-- Deny-by-default. Service role bypasses; the CLI device-code handlers
-- use the service role to read + write rows. No client-side JWT touches
-- this table.
