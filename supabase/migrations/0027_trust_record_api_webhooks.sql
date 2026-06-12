-- OpenSoyce Trust Vault (PR-17C) — Trust Record API tokens + webhook
-- subscriptions + delivery log.
--
-- DOCTRINE (17C):
--   The API exposes records; it does not create new trust conclusions.
--   Webhooks notify that a record changed; they do not certify the
--   meaning of the change.
--   Existing evidence builders remain the source of exported truth.
--   Make the record portable, not more opinionated.
--
-- Three small tables, all deny-by-default RLS, all workspace-scoped:
--
--   vault_api_tokens          read-only machine credentials. The raw
--                             token is shown ONCE at mint and never
--                             stored — only its SHA-256 hash. scope is
--                             'read' and nothing else exists in v0; a
--                             token can never write because no write
--                             route consults token auth at all.
--   vault_webhook_subscriptions
--                             where to notify, for which event types.
--                             The signing secret is stored server-side
--                             (service-role-only table, no anon path) —
--                             it must be readable to compute the HMAC
--                             signature on each delivery; it is returned
--                             to the creator exactly once at creation.
--   vault_webhook_deliveries  append-only delivery attempts: what was
--                             sent where, signed how, and what came
--                             back. v0 is one bounded attempt per event
--                             per subscription — no retry queue; the
--                             log IS the honesty about delivery.
--
-- NOT IN THIS MIGRATION, on purpose:
--   - no write-capable token scope (v0 is read-only by construction)
--   - no policy/gate columns, no trust-state columns — these tables
--     carry plumbing, never conclusions
--   - no vault_timeline_events / CEI references (notification is not
--     audit; the record tables remain the audit surfaces)

create table if not exists public.vault_api_tokens (
  token_id          uuid primary key default gen_random_uuid(),

  workspace_id      uuid not null
                      references public.vault_workspaces(workspace_id) on delete cascade,

  -- Human label so a list of tokens is reviewable ("ci-reader", etc.).
  token_name        text not null check (length(token_name) between 1 and 80),

  -- SHA-256 hex of the raw token. The raw token is NEVER stored.
  token_hash        text not null unique check (length(token_hash) = 64),

  -- Read-only is the only scope that exists in v0.
  scope             text not null default 'read' check (scope = 'read'),

  created_by        uuid not null references public.vault_users(user_id),
  created_at        timestamptz not null default now(),
  last_used_at      timestamptz,
  revoked_at        timestamptz
);

create index if not exists vault_api_tokens_workspace_idx
  on public.vault_api_tokens (workspace_id, created_at desc);

alter table public.vault_api_tokens enable row level security;

create table if not exists public.vault_webhook_subscriptions (
  subscription_id   uuid primary key default gen_random_uuid(),

  workspace_id      uuid not null
                      references public.vault_workspaces(workspace_id) on delete cascade,

  -- Delivery target. https only; private/loopback hosts are refused at
  -- create time AND re-checked at delivery time (the module owns the
  -- vocabulary; the schema owns the bounds).
  target_url        text not null check (length(target_url) between 12 and 512),

  -- Which record-change events this subscription wants. Validated
  -- against the module allowlist at write time; non-empty by schema.
  event_types       text[] not null check (array_length(event_types, 1) >= 1),

  -- HMAC-SHA256 signing secret. Returned to the creator exactly once at
  -- creation; readable server-side only (deny-by-default RLS, no anon
  -- path) because every delivery must be signed with it.
  signing_secret    text not null check (length(signing_secret) between 32 and 128),

  created_by        uuid not null references public.vault_users(user_id),
  created_at        timestamptz not null default now(),
  disabled_at       timestamptz
);

create index if not exists vault_webhook_subscriptions_workspace_idx
  on public.vault_webhook_subscriptions (workspace_id, created_at desc);

alter table public.vault_webhook_subscriptions enable row level security;

create table if not exists public.vault_webhook_deliveries (
  delivery_id       uuid primary key default gen_random_uuid(),

  workspace_id      uuid not null
                      references public.vault_workspaces(workspace_id) on delete cascade,
  subscription_id   uuid
                      references public.vault_webhook_subscriptions(subscription_id) on delete set null,

  event_id          uuid not null,
  event_type        text not null check (length(event_type) between 1 and 80),
  target_url        text not null check (length(target_url) between 1 and 512),

  -- The JSON body exactly as signed and sent.
  payload           jsonb not null,

  -- One bounded attempt, logged honestly: ok + status when the target
  -- answered; error text when it did not.
  ok                boolean not null default false,
  status_code       integer,
  error             text check (error is null or length(error) <= 500),

  created_at        timestamptz not null default now()
);

create index if not exists vault_webhook_deliveries_workspace_idx
  on public.vault_webhook_deliveries (workspace_id, created_at desc);

create index if not exists vault_webhook_deliveries_subscription_idx
  on public.vault_webhook_deliveries (subscription_id, created_at desc);

alter table public.vault_webhook_deliveries enable row level security;

-- Deny-by-default. Service role (authenticated vault handlers + the
-- reaper) bypasses; no anon/public read path. Private, workspace-scoped.
