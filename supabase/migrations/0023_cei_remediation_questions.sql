-- OpenSoyce Component Exposure Intelligence (PR-15B) — the Remediation
-- Question Loop.
--
-- DOCTRINE (15B):
--   The scanner observes.
--   Vulnerability intelligence adds context.
--   The system asks the remediation question.
--   The human decides.
--   The record remembers.
--
--   A remediation question is not a remediation decision.
--   A suggested action is not an approved action.
--   A fix path is not proof of fix.
--   An exception path must still use the exception lane.
--   The reviewer still decides.
--
-- DESIGN: a remediation question is the QUESTION LAYER, not a remediation
-- engine. It turns an observed component risk (a dependency exposure,
-- optionally with vulnerability intelligence attached) into a reviewable
-- operational question. Opening one changes nothing: no exposure status,
-- no exception, no proposal, no reviewer-outcome event. Answering one
-- records a human-selected DIRECTION — it does not execute it. If the
-- human chooses 'propose_exception', the actual proposal must still travel
-- the existing Phase 5 exception lane; there is no parallel exception
-- mechanism here, which is why this table has NO reference to
-- vault_exceptions at all.
--
-- source_exposure_id is NOT NULL on purpose: a question with no observed
-- exposure to attach to creates NO record — the question layer cannot
-- fabricate risk any more than the intelligence layer can fabricate
-- inventory (the 15A property, inherited).
--
-- NOT IN THIS TABLE, on purpose:
--   - no FK to vault_exceptions   (the answer is a direction, never an edge
--     into the decision lane; propose_exception routes through Phase 5)
--   - no proof_anchors            (a question is not evidence)
--   - no vault_timeline_events    (Phase 5 contract untouched)
--   - no overdue/reaper machinery (due_at is recorded context; nothing
--     transitions on it — lifecycle pressure is lane 16)
--   - no severity-driven anything (no policy engine; the human answers)

create table if not exists public.component_remediation_questions (
  question_id          uuid primary key default gen_random_uuid(),

  workspace_id         uuid not null
                         references public.vault_workspaces(workspace_id) on delete cascade,

  -- The observed dependency fact the question is about. REQUIRED: no
  -- exposure, no question.
  source_exposure_id   uuid not null
                         references public.component_exposures(exposure_id) on delete cascade,

  -- The vulnerability-intelligence context that prompted the question,
  -- when there is one. set null on delete: context may be retired, the
  -- question record survives (it keeps the denormalized vuln_id below).
  source_vuln_intel_id uuid
                         references public.component_exposure_vulnerabilities(vuln_intel_id) on delete set null,

  -- Denormalized question-audit fields: what was being asked about, exactly,
  -- at the moment the question was opened.
  package_name         text not null check (length(package_name) between 1 and 400),
  observed_version     text check (observed_version is null or length(observed_version) between 1 and 100),
  vuln_id              text check (vuln_id is null or length(vuln_id) between 1 and 120),

  question_kind        text not null
                         check (question_kind in ('vulnerability_review', 'component_risk_review')),

  status               text not null default 'open'
                         check (status in ('open', 'answered', 'cancelled')),

  -- The human-selected DIRECTION. Null until a human decides. The list is
  -- bounded and humble: every entry is a direction for a person to act on,
  -- never a state transition the system performs.
  selected_outcome     text
                         check (selected_outcome is null or selected_outcome in (
                           'fix_required',
                           'defer',
                           'propose_exception',
                           'not_applicable',
                           'needs_owner_review',
                           'replace_or_remove'
                         )),

  created_by           uuid not null references public.vault_users(user_id),
  answered_by          uuid references public.vault_users(user_id),

  reason_public        text check (reason_public is null or length(reason_public) between 1 and 280),
  reason_private       text check (reason_private is null or length(reason_private) between 1 and 10000),

  -- Recorded context only. Nothing in this PR transitions on due_at; there
  -- is no overdue state and no reaper (lane 16).
  due_at               timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  answered_at          timestamptz,

  -- Answer coherence, enforced by schema: an answered question MUST carry
  -- a human (answered_by), a direction, and a timestamp; an unanswered one
  -- must carry none of them. The system cannot answer its own question.
  constraint component_remediation_questions_answer_coherence check (
    (status = 'answered'
      and selected_outcome is not null
      and answered_by is not null
      and answered_at is not null)
    or
    (status <> 'answered'
      and selected_outcome is null
      and answered_by is null
      and answered_at is null)
  )
);

-- One OPEN question per (workspace, exposure, kind, vulnerability): asking
-- again while the question is open is repetition, not a new question. The
-- 23505 loser gets a 409 pointing at the existing open question. Answered
-- and cancelled questions leave the partial index, so a fact can honestly
-- be re-asked later.
create unique index if not exists component_remediation_questions_open_identity_key
  on public.component_remediation_questions (workspace_id, source_exposure_id, question_kind, coalesce(vuln_id, ''))
  where status = 'open';

create index if not exists component_remediation_questions_workspace_idx
  on public.component_remediation_questions (workspace_id, created_at desc);

create index if not exists component_remediation_questions_exposure_idx
  on public.component_remediation_questions (source_exposure_id, created_at desc);

alter table public.component_remediation_questions enable row level security;

-- Deny-by-default. Service role (authenticated vault-session handlers)
-- bypasses; no anon/public read path. Private, workspace-scoped. The
-- public OTS surfaces never read this table.
