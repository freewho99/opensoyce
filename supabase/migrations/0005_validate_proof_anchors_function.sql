-- OpenSoyce Trust Vault — validate_proof_anchors() SQL function.
--
-- PR-V2-A (Phase 5 first implementation PR). Persistence-layer validator
-- only. This function is the SQL CHECK guard for every Vault table that
-- stores audit-anchored evidence: vault_evidence, vault_exceptions, and
-- vault_timeline_events. Each table's proof_anchors JSONB column references
-- this function in its CHECK constraint.
--
-- IMPORTANT DOCTRINE (Phase 5 atomic boundaries):
--   - This function exists at the SQL layer only. It does NOT lift the
--     public Trust Center visibility-field guard. Public-shape hygiene tests
--     (scripts/test-open-source-trust-center.mjs) still ban "visibility" on
--     every public renderer + every linking page. The public lift is atomic
--     to PR-V2-C; this PR is the SQL-layer validator only.
--   - The CLI v0 5-command / 7-flag locks stay intact. PR-V2-A does not
--     touch packages/cli. The CLI lift is atomic to PR-V2-D.
--
-- The function asserts, per the PR-V1-D §1.4 + PR-V1-B §6.2 contract:
--   - proof_anchors is a non-empty JSONB array.
--   - Every element has a proofType from the 5-vocab set:
--       'pr' / 'live-surface' / 'doc-anchor' / 'proof-artifact' / 'private-anchor'
--   - Every 'pr' element has a positive integer pr + 7-or-40-char hex sha,
--     and visibility is absent.
--   - Every 'live-surface' / 'doc-anchor' / 'proof-artifact' element has
--     visibility absent.
--   - Every 'private-anchor' element has visibility = 'private' and an
--     href that starts with '/api/vault/workspaces/'.

create or replace function public.validate_proof_anchors(anchors jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  anchor jsonb;
  proof_type text;
  visibility text;
  pr_value jsonb;
  sha_value text;
  href text;
begin
  -- Must be a non-empty array.
  if anchors is null then return false; end if;
  if jsonb_typeof(anchors) <> 'array' then return false; end if;
  if jsonb_array_length(anchors) = 0 then return false; end if;

  for anchor in select * from jsonb_array_elements(anchors)
  loop
    proof_type := anchor->>'proofType';
    visibility := anchor->>'visibility';
    href := anchor->>'href';

    -- Required fields on every anchor.
    if proof_type is null then return false; end if;
    if (anchor->>'label') is null or length(anchor->>'label') = 0 then return false; end if;
    if href is null or length(href) = 0 then return false; end if;

    if proof_type = 'pr' then
      pr_value := anchor->'pr';
      sha_value := anchor->>'sha';
      if pr_value is null or jsonb_typeof(pr_value) <> 'number' then return false; end if;
      if (pr_value::text)::int <= 0 then return false; end if;
      if sha_value is null then return false; end if;
      if sha_value !~ '^[0-9a-f]{7,40}$' then return false; end if;
      if visibility is not null then return false; end if;

    elsif proof_type in ('live-surface', 'doc-anchor', 'proof-artifact') then
      if visibility is not null then return false; end if;

    elsif proof_type = 'private-anchor' then
      if visibility is null or visibility <> 'private' then return false; end if;
      if href !~ '^/api/vault/workspaces/' then return false; end if;

    else
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.validate_proof_anchors(jsonb) is
  'OpenSoyce Trust Vault — SQL-layer proof_anchors validator. The public Trust Center visibility-field guard is NOT lifted by this function. See migration 0005 header for the atomic-boundary doctrine.';
