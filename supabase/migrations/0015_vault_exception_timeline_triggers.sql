-- OpenSoyce Trust Vault — exception lifecycle → Vault Timeline trigger.
--
-- PR-V2-B. Per PR-V1-C §6 + PR-V1-D §4.
--
-- Every state transition on vault_exceptions emits exactly one
-- vault_timeline_events row, in the SAME SQL transaction. The trigger
-- function reads the row's pre-change and post-change values to construct
-- the summary template + references payload. Visibility is always 'private'
-- (enforced by migration 0012's SQL CHECK).
--
-- The 7 named exception lifecycle event types from PR-V1-C §6.1:
--   exception_proposed   -- (none) → proposed
--   exception_approved   -- proposed → active
--   exception_rejected   -- proposed → rejected (reviewer OR proposer-withdrawal)
--   exception_revoked    -- active → revoked
--   exception_expired    -- active → expired (reaper; no actor)
--   exception_extended   -- active → active (extend) — expires_at updated
--
-- This file defines:
--   - vault_emit_timeline_event_for_exception_insert (AFTER INSERT)
--   - vault_emit_timeline_event_for_exception_update (AFTER UPDATE)
--   - The two triggers attached to vault_exceptions.

create or replace function public.vault_emit_timeline_event_for_exception_insert()
returns trigger
language plpgsql
as $$
declare
  v_summary text;
  v_subject text;
  v_workspace_slug text;
begin
  -- Only the "freshly inserted proposed" case emits exception_proposed.
  -- Any other insert state would have come from an UPDATE; the row is
  -- always created as 'proposed' per PR-V1-C §1.1.
  if new.state <> 'proposed' then
    return new;
  end if;

  -- Look up the workspace slug for the private-anchor href. PR-V1-D §1.2
  -- locks the canonical URL pattern to /api/vault/workspaces/:slug/...,
  -- where :slug is the immutable URL-safe slug (PR-V1-A §3.1), NOT the
  -- workspace_id UUID. Writing the UUID would commit a syntactically-valid-
  -- looking anchor that resolves to a broken route once PR-V2-C ships the
  -- read surface. The trigger runs in the same SQL transaction as the
  -- vault_exceptions INSERT, so the workspace row is guaranteed to exist.
  select w.slug into v_workspace_slug
    from public.vault_workspaces w
    where w.workspace_id = new.workspace_id;
  if v_workspace_slug is null then
    raise exception 'vault_emit_timeline_event_for_exception_insert: workspace % not found', new.workspace_id
      using errcode = 'foreign_key_violation';
  end if;

  v_subject := case new.subject_kind
    when 'package' then new.subject_name
    when 'repo' then new.subject_name
  end;

  v_summary := format(
    'Proposed exception on %s: %s → %s. Reason: %s.',
    v_subject,
    new.original_action,
    new.allowed_action,
    coalesce(new.reason_public, '(reason pending review)')
  );
  -- Cap at 280 chars per PR-V1-B §2.7 CHECK constraint.
  if length(v_summary) > 280 then
    v_summary := substring(v_summary from 1 for 277) || '...';
  end if;

  insert into public.vault_timeline_events (
    workspace_id,
    event_type,
    subject_exception_id,
    summary,
    references_json,
    emitted_by
  ) values (
    new.workspace_id,
    'exception_proposed',
    new.exception_id,
    v_summary,
    jsonb_build_array(
      jsonb_build_object(
        'proofType', 'private-anchor',
        'label', 'Exception proposal',
        'href', '/api/vault/workspaces/' || v_workspace_slug || '/exceptions/' || new.exception_id::text,
        'visibility', 'private'
      )
    ),
    new.proposed_by
  );

  return new;
end;
$$;

create or replace function public.vault_emit_timeline_event_for_exception_update()
returns trigger
language plpgsql
as $$
declare
  v_event_type text;
  v_summary text;
  v_subject text;
  v_actor uuid;
  v_workspace_slug text;
begin
  -- Only emit when the state actually changed, OR when state stayed 'active'
  -- but expires_at moved forward (the extend case).
  if new.state = old.state
     and (new.state <> 'active' or new.expires_at is not distinct from old.expires_at)
  then
    return new;
  end if;

  -- Look up the workspace slug for the private-anchor href. See the matching
  -- comment block in vault_emit_timeline_event_for_exception_insert.
  select w.slug into v_workspace_slug
    from public.vault_workspaces w
    where w.workspace_id = new.workspace_id;
  if v_workspace_slug is null then
    raise exception 'vault_emit_timeline_event_for_exception_update: workspace % not found', new.workspace_id
      using errcode = 'foreign_key_violation';
  end if;

  v_subject := new.subject_name;

  if new.state = 'active' and old.state = 'proposed' then
    v_event_type := 'exception_approved';
    v_actor := new.reviewed_by;
    v_summary := format(
      'Approved exception on %s: %s → %s until %s. Reason: %s.',
      v_subject, new.original_action, new.allowed_action,
      to_char(new.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      coalesce(new.reason_public, '(none)')
    );
  elsif new.state = 'rejected' and old.state = 'proposed' then
    v_event_type := 'exception_rejected';
    v_actor := coalesce(new.reviewed_by, new.proposed_by);
    v_summary := format(
      'Rejected exception on %s. Reason: %s.',
      v_subject,
      coalesce(new.reason_public, '(none provided)')
    );
  elsif new.state = 'revoked' and old.state = 'active' then
    v_event_type := 'exception_revoked';
    v_actor := new.revoked_by;
    v_summary := format(
      'Revoked exception on %s: %s → %s. Revoke reason: %s.',
      v_subject, new.original_action, new.allowed_action,
      coalesce(new.revoke_reason, '(none provided)')
    );
  elsif new.state = 'expired' and old.state = 'active' then
    v_event_type := 'exception_expired';
    v_actor := null; -- reaper-emitted
    v_summary := format(
      'Exception expired on %s at scheduled %s.',
      v_subject,
      to_char(old.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  elsif new.state = 'active' and old.state = 'active'
        and new.expires_at is distinct from old.expires_at then
    v_event_type := 'exception_extended';
    v_actor := new.reviewed_by;
    v_summary := format(
      'Extended exception on %s to new %s.',
      v_subject,
      to_char(new.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  else
    -- Unrecognized transition. Don't emit; the application-layer state
    -- machine guards should have prevented the UPDATE in the first place.
    return new;
  end if;

  if length(v_summary) > 280 then
    v_summary := substring(v_summary from 1 for 277) || '...';
  end if;

  insert into public.vault_timeline_events (
    workspace_id,
    event_type,
    subject_exception_id,
    summary,
    references_json,
    emitted_by
  ) values (
    new.workspace_id,
    v_event_type,
    new.exception_id,
    v_summary,
    jsonb_build_array(
      jsonb_build_object(
        'proofType', 'private-anchor',
        'label', 'Exception ' || v_event_type,
        'href', '/api/vault/workspaces/' || v_workspace_slug || '/exceptions/' || new.exception_id::text,
        'visibility', 'private'
      )
    ),
    v_actor
  );

  return new;
end;
$$;

drop trigger if exists vault_exceptions_emit_proposed on public.vault_exceptions;
create trigger vault_exceptions_emit_proposed
  after insert on public.vault_exceptions
  for each row execute function public.vault_emit_timeline_event_for_exception_insert();

drop trigger if exists vault_exceptions_emit_state_change on public.vault_exceptions;
create trigger vault_exceptions_emit_state_change
  after update on public.vault_exceptions
  for each row execute function public.vault_emit_timeline_event_for_exception_update();
