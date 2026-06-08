-- OpenSoyce Trust Vault — vault_evidence table.
--
-- PR-V2-A. Per PR-V1-B §2.5.
--
-- Private evidence captures. The five-class evidence vocabulary is from
-- the Trust Vault ADR (#67) §1.1.
--
-- IMPORTANT visibility doctrine:
--   The visibility column is locked to 'private' at the SQL CHECK level.
--   PR-V2-A is NOT the atomic visibility-field lift on PUBLIC shapes;
--   that lift remains queued for PR-V2-C. The SQL column here is the
--   persistence-layer enforcement of the private-only invariant.

create table if not exists public.vault_evidence (
  evidence_id     uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.vault_workspaces(workspace_id) on delete cascade,
  evidence_class  text not null check (evidence_class in (
                    'pre_disclosure_cve',
                    'audit_trail',
                    'reviewer_private_justification',
                    'customer_scoped_trust',
                    'internal_review_trail'
                  )),
  subject_kind    text check (subject_kind in ('package','repo')),
  subject_name    text,
  summary         text not null check (length(summary) between 1 and 280),
  body            text,
  proof_anchors   jsonb not null,
  visibility      text not null default 'private'
                    check (visibility = 'private'),
  redaction_state text not null default 'visible'
                    check (redaction_state in ('visible','redacted','hard_deleted')),
  created_at      timestamptz not null default now(),
  created_by      uuid not null references public.vault_users(user_id) on delete restrict,
  redacted_at     timestamptz,
  redacted_by     uuid references public.vault_users(user_id) on delete restrict,
  hard_delete_at  timestamptz,
  constraint vault_evidence_proof_anchors_valid check (public.validate_proof_anchors(proof_anchors)),

  -- Redaction window invariant: when redacted_at is set, hard_delete_at must
  -- be exactly 90 days later (PR-V1-B §4.1).
  constraint vault_evidence_redaction_window check (
    (redacted_at is null and hard_delete_at is null)
    or (redacted_at is not null and hard_delete_at = redacted_at + interval '90 days')
  )
);

create index if not exists vault_evidence_workspace_class_created_idx
  on public.vault_evidence (workspace_id, evidence_class, created_at desc);

create index if not exists vault_evidence_workspace_subject_idx
  on public.vault_evidence (workspace_id, subject_kind, subject_name);

create index if not exists vault_evidence_hard_delete_idx
  on public.vault_evidence (hard_delete_at)
  where hard_delete_at is not null;

alter table public.vault_evidence enable row level security;

-- Deny-by-default. Service role bypasses. Member-role reads pass through
-- the application layer with reason_private equivalent (here: `body`)
-- masking applied at serialization in later sub-sketches' implementation PRs.
