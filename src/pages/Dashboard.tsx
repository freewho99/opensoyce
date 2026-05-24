/**
 * Exceptions dashboard (Sprint+3 PR 3).
 *
 * Flow:
 *   1. Mount → probe /api/exceptions?action=whoami.
 *   2. If 401 → show "Sign in with GitHub" CTA. Click generates a UUID state,
 *      stores it in sessionStorage, redirects to GitHub OAuth authorize.
 *   3. GitHub redirects back to /dashboard?code=...&state=... → we POST
 *      { code, state } to /api/exceptions?action=auth-callback, which mints
 *      the osg_session cookie and returns { login }.
 *   4. With a session, fetch my-repos and let the user pick one. Selecting a
 *      repo lists its exceptions and lets the user grant / revoke.
 *
 * CSRF posture (acknowledged weakness): the OAuth state is a client-generated
 * UUID round-tripped through sessionStorage. We verify the returned state
 * matches what we stored, but the backend does NOT verify a signature on it.
 * The OAuth code itself is single-use and bound to redirect_uri, which limits
 * forgery blast radius. Server-signed state is a follow-up.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Github, Shield, Trash2, RefreshCw, AlertTriangle, Plus, LogOut, ChevronRight, Eye, Bell } from 'lucide-react';

type ExceptionRow = {
  id: string;
  owner: string;
  repo: string;
  package_name: string;
  ecosystem: string;
  reason: string;
  expires_at: string;
  granted_by: string;
  created_at: string;
  revoked_at: string | null;
};

type RepoRef = { owner: string; repo: string };

type WatchVerdict = {
  owner: string;
  repo: string;
  label: string;
  scanned_at: string;
};

type WatchedRow = {
  id: string;
  owner_org: string;
  package_name: string;
  ecosystem: string;
  created_at: string;
  verdicts: WatchVerdict[];
};

type WatchChange = {
  owner_org?: string;
  package_name: string;
  ecosystem: string;
  owner: string;
  repo: string;
  prev_label: string;
  new_label: string;
  scanned_at: string;
};

type NotificationsState = {
  configured: boolean;
  updated_by?: string | null;
  updated_at?: string | null;
};

type Phase =
  | 'loading'
  | 'oauth-callback'
  | 'unauth'
  | 'auth'
  | 'error-config';

const ECOSYSTEMS = ['npm', 'pnpm', 'yarn', 'uv', 'poetry', 'mixed'] as const;
const EXPIRY_OPTIONS = [7, 14, 30, 60, 90];
const REASON_MIN = 10;
const REASON_MAX = 2000;
const OAUTH_STATE_KEY = 'dashboard_oauth_state';
// Mirrors api/exceptions.js SLACK_WEBHOOK_URL_PREFIX. Client-side validation
// is advisory only — the backend re-validates and is the source of truth.
const SLACK_WEBHOOK_URL_PREFIX = 'https://hooks.slack.com/services/';
const SLACK_WEBHOOK_URL_MAX = 500;

function classifyStatus(row: ExceptionRow): 'active' | 'expired' | 'revoked' {
  if (row.revoked_at) return 'revoked';
  const expiresMs = Date.parse(row.expires_at);
  if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) return 'expired';
  return 'active';
}

function formatExpires(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

// Tiny relative-time helper. Avoids the bundle cost of Intl.RelativeTimeFormat
// import elsewhere and keeps copy phrased like the rest of the dashboard.
function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diffMs = Date.now() - t;
  const abs = Math.abs(diffMs);
  const suffix = diffMs >= 0 ? 'ago' : 'from now';
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (abs < min) return 'just now';
  if (abs < hr) {
    const n = Math.round(abs / min);
    return `${n} minute${n === 1 ? '' : 's'} ${suffix}`;
  }
  if (abs < day) {
    const n = Math.round(abs / hr);
    return `${n} hour${n === 1 ? '' : 's'} ${suffix}`;
  }
  if (abs < 30 * day) {
    const n = Math.round(abs / day);
    return `${n} day${n === 1 ? '' : 's'} ${suffix}`;
  }
  if (abs < 365 * day) {
    const n = Math.round(abs / (30 * day));
    return `${n} month${n === 1 ? '' : 's'} ${suffix}`;
  }
  const n = Math.round(abs / (365 * day));
  return `${n} year${n === 1 ? '' : 's'} ${suffix}`;
}

// Mirror GuardPrCommentPreview's chip palette. FORKABLE isn't in the comment
// preview's union but the backend label rank includes it, so we map it to the
// soy-label/STABLE band (closest neutral). If the backend returns an unknown
// label, fall back to a neutral chip rather than crashing.
const VERDICT_CHIP_STYLES: Record<string, string> = {
  'USE READY': 'bg-emerald-500 text-white border-black',
  'STABLE': 'bg-soy-label text-soy-bottle border-soy-bottle',
  'FORKABLE': 'bg-soy-label text-soy-bottle border-soy-bottle',
  'WATCHLIST': 'bg-amber-400 text-black border-black',
  'RISKY': 'bg-soy-red text-white border-black',
  'GRAVEYARD': 'bg-black text-soy-red border-soy-red',
};

function VerdictChip({ label }: { label: string }) {
  const cls = VERDICT_CHIP_STYLES[label] || 'bg-white text-soy-bottle border-soy-bottle';
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-black uppercase tracking-widest italic border-2 ${cls}`}>
      {label}
    </span>
  );
}

export default function Dashboard() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [login, setLogin] = useState<string | null>(null);
  // Sprint+6: org memberships baked into the session by the auth-callback. An
  // empty array signals a stale (pre-Sprint+6) session token; we surface a
  // re-auth banner in that state instead of just showing an empty watchlist.
  const [orgs, setOrgs] = useState<string[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [oauthClientId, setOauthClientId] = useState<string | null>(null);
  const [repos, setRepos] = useState<RepoRef[] | null>(null);
  const [reposLoading, setReposLoading] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<RepoRef | null>(null);
  const [exceptions, setExceptions] = useState<ExceptionRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // Grant form state.
  const [pkgName, setPkgName] = useState('');
  const [ecosystem, setEcosystem] = useState<typeof ECOSYSTEMS[number]>('npm');
  const [reason, setReason] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  // Watchlist state (Sprint+4 PR 3).
  const [watched, setWatched] = useState<WatchedRow[] | null>(null);
  const [watchedLoading, setWatchedLoading] = useState(false);
  const [watchedError, setWatchedError] = useState<string | null>(null);
  const [changes, setChanges] = useState<WatchChange[]>([]);
  const [changesExpanded, setChangesExpanded] = useState(false);
  const [watchPkgName, setWatchPkgName] = useState('');
  const [watchEcosystem, setWatchEcosystem] = useState<typeof ECOSYSTEMS[number]>('npm');
  const [watchAdding, setWatchAdding] = useState(false);
  const [watchAddError, setWatchAddError] = useState<string | null>(null);

  // Notifications state (Sprint+5 PR 3). Per-repo Slack webhook config.
  const [notif, setNotif] = useState<NotificationsState | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState<string | null>(null);
  const [notifReadOnly, setNotifReadOnly] = useState(false);
  const [notifWebhookInput, setNotifWebhookInput] = useState('');
  const [notifEditing, setNotifEditing] = useState(false);
  const [notifSaving, setNotifSaving] = useState(false);

  // ------------------------------------------------------------- bootstrap
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1. Detect an OAuth callback (?code= & ?state= in URL).
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');

      if (code && state) {
        setPhase('oauth-callback');
        const stored = sessionStorage.getItem(OAUTH_STATE_KEY);
        if (!stored || stored !== state) {
          setErrorMessage('OAUTH state mismatch — try signing in again.');
          // Strip the bogus query params either way.
          window.history.replaceState({}, '', '/dashboard');
          setPhase('unauth');
          return;
        }
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        try {
          const resp = await fetch('/api/exceptions?action=auth-callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, state }),
          });
          // Strip query params regardless of success so a refresh doesn't
          // re-attempt with the now-consumed code.
          window.history.replaceState({}, '', '/dashboard');
          if (!resp.ok) {
            const body = await resp.json().catch(() => null);
            const msg = body && body.error === 'OAUTH_NOT_CONFIGURED'
              ? 'OpenSoyce is missing its GitHub OAuth credentials. Contact support@opensoyce.com.'
              : body && body.message ? body.message : `Sign-in failed (${resp.status}).`;
            if (cancelled) return;
            setErrorMessage(msg);
            setPhase('unauth');
            return;
          }
          const body = await resp.json();
          if (cancelled) return;
          setLogin(body.login || null);
          setOrgs(Array.isArray(body.orgs) ? body.orgs.filter((o: unknown) => typeof o === 'string') : []);
          setPhase('auth');
          return;
        } catch (e: unknown) {
          if (cancelled) return;
          setErrorMessage('Network error during sign-in. Try again.');
          setPhase('unauth');
          return;
        }
      }

      // 2. Probe whoami for an existing session.
      try {
        const resp = await fetch('/api/exceptions?action=whoami', { credentials: 'same-origin' });
        if (cancelled) return;
        if (resp.ok) {
          const body = await resp.json();
          setLogin(body.login || null);
          // Sprint+6: whoami may or may not echo orgs depending on whether the
          // backend rolled forward. Treat a missing/non-array field as "stale
          // session" (orgs: []) and let the re-auth banner do the talking.
          setOrgs(Array.isArray(body.orgs) ? body.orgs.filter((o: unknown) => typeof o === 'string') : []);
          setPhase('auth');
        } else {
          setPhase('unauth');
        }
      } catch {
        if (cancelled) return;
        setPhase('unauth');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Once we're 'auth', fetch the user's repos.
  useEffect(() => {
    if (phase !== 'auth') return;
    if (repos !== null) return;
    let cancelled = false;
    (async () => {
      setReposLoading(true);
      try {
        const resp = await fetch('/api/exceptions?action=my-repos', { credentials: 'same-origin' });
        if (!resp.ok) {
          if (cancelled) return;
          setRepos([]);
          setReposLoading(false);
          return;
        }
        const body = await resp.json();
        if (cancelled) return;
        setRepos(Array.isArray(body.repos) ? body.repos : []);
      } catch {
        if (cancelled) return;
        setRepos([]);
      } finally {
        if (!cancelled) setReposLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [phase, repos]);

  // Fetch oauth client_id once for the sign-in button.
  useEffect(() => {
    if (oauthClientId !== null) return;
    if (phase !== 'unauth') return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/config');
        if (!resp.ok) return;
        const body = await resp.json();
        if (cancelled) return;
        if (typeof body.githubOauthClientId === 'string') {
          setOauthClientId(body.githubOauthClientId);
        } else {
          setOauthClientId('');
        }
      } catch {
        if (cancelled) return;
        setOauthClientId('');
      }
    })();
    return () => { cancelled = true; };
  }, [phase, oauthClientId]);

  // Fetch exceptions whenever selectedRepo changes.
  const refreshExceptions = useCallback(async (repo: RepoRef) => {
    setListLoading(true);
    setListError(null);
    try {
      const url = `/api/exceptions?owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.repo)}`;
      const resp = await fetch(url, { credentials: 'same-origin' });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setListError((body && body.message) || `Failed to load exceptions (${resp.status}).`);
        setExceptions([]);
      } else {
        const body = await resp.json();
        setExceptions(Array.isArray(body.exceptions) ? body.exceptions : []);
      }
    } catch {
      setListError('Network error loading exceptions.');
      setExceptions([]);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedRepo) return;
    refreshExceptions(selectedRepo);
  }, [selectedRepo, refreshExceptions]);

  // ------------------------------------------------------------- actions
  const handleSignIn = useCallback(() => {
    if (!oauthClientId) {
      setErrorMessage('OpenSoyce is missing its GitHub OAuth client ID. Contact support@opensoyce.com.');
      return;
    }
    const state = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    const redirectUri = `${window.location.origin}/dashboard`;
    const params = new URLSearchParams({
      client_id: oauthClientId,
      redirect_uri: redirectUri,
      // Sprint+6: read:org lets /user/orgs return private org memberships so
      // the auth-callback can bake them into session.orgs. GitHub's OAuth spec
      // requires scopes to be SPACE-separated (not comma-separated — that's a
      // common footgun for this endpoint).
      scope: 'read:user read:org',
      state,
      allow_signup: 'false',
    });
    window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
  }, [oauthClientId]);

  const handleSignOut = useCallback(async () => {
    try {
      await fetch('/api/exceptions?action=logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // best-effort; we still tear down local state.
    }
    setLogin(null);
    setOrgs([]);
    setSelectedOrg(null);
    setRepos(null);
    setSelectedRepo(null);
    setExceptions([]);
    setWatched(null);
    setChanges([]);
    setPhase('unauth');
  }, []);

  const handleGrant = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepo) return;
    setGrantError(null);
    const trimmedReason = reason.trim();
    if (trimmedReason.length < REASON_MIN || trimmedReason.length > REASON_MAX) {
      setGrantError(`Reason must be ${REASON_MIN}–${REASON_MAX} characters after trimming.`);
      return;
    }
    if (!pkgName.trim()) {
      setGrantError('Package name is required.');
      return;
    }
    setGranting(true);
    try {
      const resp = await fetch('/api/exceptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          owner: selectedRepo.owner,
          repo: selectedRepo.repo,
          package_name: pkgName.trim(),
          ecosystem,
          reason: trimmedReason,
          expires_in_days: expiresInDays,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setGrantError((body && body.message) || `Failed to grant exception (${resp.status}).`);
      } else {
        setPkgName('');
        setReason('');
        await refreshExceptions(selectedRepo);
      }
    } catch {
      setGrantError('Network error granting exception.');
    } finally {
      setGranting(false);
    }
  }, [selectedRepo, pkgName, ecosystem, reason, expiresInDays, refreshExceptions]);

  const handleRevoke = useCallback(async (id: string) => {
    if (!selectedRepo) return;
    try {
      const resp = await fetch(`/api/exceptions?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setListError((body && body.message) || `Failed to revoke (${resp.status}).`);
        return;
      }
      await refreshExceptions(selectedRepo);
    } catch {
      setListError('Network error revoking exception.');
    }
  }, [selectedRepo, refreshExceptions]);

  const exportToCSV = useCallback(() => {
    if (exceptions.length === 0) return;
    const headers = ['ID', 'Package Name', 'Ecosystem', 'Status', 'Granted By', 'Expires At', 'Reason', 'Revoked At'];
    const rows = exceptions.map(row => [
      row.id,
      row.package_name,
      row.ecosystem,
      classifyStatus(row),
      row.granted_by,
      row.expires_at,
      row.reason.replace(/"/g, '""'),
      row.revoked_at || ''
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(r => r.map(val => `"${val}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `opensoyce-compliance-log-${selectedRepo?.owner}-${selectedRepo?.repo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [exceptions, selectedRepo]);

  const exportToJSON = useCallback(() => {
    if (exceptions.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exceptions, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `opensoyce-compliance-log-${selectedRepo?.owner}-${selectedRepo?.repo}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [exceptions, selectedRepo]);

  // --------------------------------------------------------- notifications

  // Fetch the per-repo Slack config. The API never returns the URL itself —
  // only { configured, updated_by, updated_at }. State B (not configured) is
  // an empty row, missing row, OR a row whose url was nulled by DISABLE.
  const refreshNotifications = useCallback(async (repo: RepoRef) => {
    setNotifLoading(true);
    setNotifError(null);
    setNotifEditing(false);
    setNotifWebhookInput('');
    try {
      const url = `/api/exceptions?action=notifications-get&owner=${encodeURIComponent(repo.owner)}&repo=${encodeURIComponent(repo.repo)}`;
      const resp = await fetch(url, { credentials: 'same-origin' });
      if (resp.status === 404) {
        setNotifError('Guard isn’t installed on this repo.');
        setNotif(null);
        return;
      }
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setNotifError((body && body.message) || `Failed to load notifications (${resp.status}).`);
        setNotif(null);
        return;
      }
      const body = await resp.json();
      setNotif({
        configured: Boolean(body.configured),
        updated_by: typeof body.updated_by === 'string' ? body.updated_by : null,
        updated_at: typeof body.updated_at === 'string' ? body.updated_at : null,
      });
    } catch {
      setNotifError('Network error loading notifications.');
      setNotif(null);
    } finally {
      setNotifLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedRepo) {
      setNotif(null);
      setNotifError(null);
      setNotifEditing(false);
      setNotifWebhookInput('');
      setNotifReadOnly(false);
      return;
    }
    // Reset read-only flag whenever we navigate to a different repo; it
    // gets set sticky if a write attempt later returns 403.
    setNotifReadOnly(false);
    refreshNotifications(selectedRepo);
  }, [selectedRepo, refreshNotifications]);

  // Save (enable or change). url = null means DISABLE.
  const saveNotifications = useCallback(async (url: string | null) => {
    if (!selectedRepo) return;
    setNotifSaving(true);
    setNotifError(null);
    try {
      const resp = await fetch('/api/exceptions?action=notifications-set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          owner: selectedRepo.owner,
          repo: selectedRepo.repo,
          slack_webhook_url: url,
        }),
      });
      if (resp.status === 403) {
        setNotifReadOnly(true);
        setNotifError('You need write access on this repo to change notifications.');
        return;
      }
      if (resp.status === 404) {
        setNotifError('Guard isn’t installed on this repo.');
        return;
      }
      if (resp.status >= 500) {
        setNotifError('Couldn’t save — try again.');
        return;
      }
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setNotifError((body && body.message) || `Failed to save (${resp.status}).`);
        return;
      }
      // Success path: refetch so we render the canonical server state
      // (rather than guessing locally). This is also where State B -> C
      // and C -> B transitions visibly flip.
      await refreshNotifications(selectedRepo);
    } catch {
      setNotifError('Couldn’t save — try again.');
    } finally {
      setNotifSaving(false);
    }
  }, [selectedRepo, refreshNotifications]);

  const handleNotifSave = useCallback(async () => {
    const trimmed = notifWebhookInput.trim();
    if (!trimmed.startsWith(SLACK_WEBHOOK_URL_PREFIX)) {
      setNotifError(`URL must start with ${SLACK_WEBHOOK_URL_PREFIX}`);
      return;
    }
    if (trimmed.length > SLACK_WEBHOOK_URL_MAX) {
      setNotifError(`URL must be ≤ ${SLACK_WEBHOOK_URL_MAX} chars.`);
      return;
    }
    await saveNotifications(trimmed);
  }, [notifWebhookInput, saveNotifications]);

  const handleNotifDisable = useCallback(async () => {
    await saveNotifications(null);
  }, [saveNotifications]);

  // ----------------------------------------------------------- watchlist

  const refreshWatched = useCallback(async () => {
    setWatchedLoading(true);
    setWatchedError(null);
    try {
      const resp = await fetch('/api/exceptions?action=watchlist-list', { credentials: 'same-origin' });
      if (resp.status === 401) {
        // Session expired mid-session — tear down so the user is prompted to sign in again.
        setLogin(null);
        setOrgs([]);
        setSelectedOrg(null);
        setRepos(null);
        setSelectedRepo(null);
        setExceptions([]);
        setWatched(null);
        setChanges([]);
        setPhase('unauth');
        return;
      }
      if (!resp.ok) {
        setWatchedError('Couldn’t load watchlist — refresh to retry.');
        setWatched([]);
      } else {
        const body = await resp.json();
        setWatched(Array.isArray(body.watched) ? body.watched : []);
      }
    } catch {
      setWatchedError('Couldn’t load watchlist — refresh to retry.');
      setWatched([]);
    } finally {
      setWatchedLoading(false);
    }
  }, []);

  const refreshChanges = useCallback(async () => {
    try {
      const resp = await fetch('/api/exceptions?action=watchlist-changes', { credentials: 'same-origin' });
      if (!resp.ok) {
        // Silent on changes failure — list still loads independently.
        setChanges([]);
        return;
      }
      const body = await resp.json();
      setChanges(Array.isArray(body.changes) ? body.changes : []);
    } catch {
      setChanges([]);
    }
  }, []);

  // Initial fetch on auth.
  useEffect(() => {
    if (phase !== 'auth') return;
    if (watched !== null) return;
    refreshWatched();
    refreshChanges();
  }, [phase, watched, refreshWatched, refreshChanges]);

  const handleWatchAdd = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setWatchAddError(null);
    const trimmed = watchPkgName.trim();
    if (!trimmed) {
      setWatchAddError('Package name is required.');
      return;
    }
    // Sprint+6: org-scoped add. The selected org becomes the row's owner_org.
    // PR 1's backend rejects 403 if it isn't in session.orgs, so this is also
    // a defense-in-depth check — the picker only lists session.orgs anyway.
    if (!selectedOrg) {
      setWatchAddError('Pick an org first.');
      return;
    }
    setWatchAdding(true);
    try {
      const resp = await fetch('/api/exceptions?action=watchlist-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ owner_org: selectedOrg, package_name: trimmed, ecosystem: watchEcosystem }),
      });
      if (resp.status === 201 || resp.status === 200) {
        // 201 == new row, 200 with already_watched == duplicate. Either way
        // we clear the form and refresh; refresh will surface the existing row.
        setWatchPkgName('');
        await refreshWatched();
      } else if (resp.status >= 500) {
        setWatchAddError('Couldn’t add — try again.');
      } else {
        const body = await resp.json().catch(() => null);
        setWatchAddError((body && (body.message || body.error)) || `Failed to add (${resp.status}).`);
      }
    } catch {
      setWatchAddError('Couldn’t add — try again.');
    } finally {
      setWatchAdding(false);
    }
  }, [watchPkgName, watchEcosystem, selectedOrg, refreshWatched]);

  const handleUnwatch = useCallback(async (id: string) => {
    try {
      const resp = await fetch('/api/exceptions?action=watchlist-remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id }),
      });
      if (resp.ok) {
        // Optimistic local removal; the next refresh would do the same but
        // the row disappears instantly this way.
        setWatched(prev => (prev ? prev.filter(w => w.id !== id) : prev));
      } else {
        setWatchedError('Couldn’t remove that watch — refresh and retry.');
      }
    } catch {
      setWatchedError('Couldn’t remove that watch — refresh and retry.');
    }
  }, []);

  // ------------------------------------------------------------- render
  const reasonLen = reason.trim().length;
  const sortedRepos = useMemo(() => repos || [], [repos]);

  // Sprint+6: stable alphabetical sort for the org picker so the default
  // selection is deterministic regardless of the order /user/orgs returned.
  const sortedOrgs = useMemo<string[]>(() => {
    const dedup: string[] = Array.from(new Set(orgs.filter(o => typeof o === 'string' && o.length > 0)));
    dedup.sort((a, b) => a.localeCompare(b));
    return dedup;
  }, [orgs]);

  // Stale-session detection. If we're authed but the session has no orgs,
  // the cookie predates Sprint+6's read:org scope upgrade. The user needs to
  // sign out and back in to grant the new scope and repopulate session.orgs.
  const staleSession = phase === 'auth' && sortedOrgs.length === 0;

  // Default-select the first org alphabetically once orgs land, and keep the
  // selection valid if the orgs list ever changes (e.g. fresh sign-in).
  useEffect(() => {
    if (sortedOrgs.length === 0) {
      if (selectedOrg !== null) setSelectedOrg(null);
      return;
    }
    if (!selectedOrg || !sortedOrgs.includes(selectedOrg)) {
      setSelectedOrg(sortedOrgs[0]);
    }
  }, [sortedOrgs, selectedOrg]);

  // Client-side org filter for the watchlist. The backend already returns
  // rows scoped to session.orgs (via the IN(...) query); this narrows to the
  // currently-picked org so a user in many orgs sees a focused view.
  const visibleWatched = useMemo(() => {
    if (!watched || !selectedOrg) return [];
    return watched.filter(w => w.owner_org === selectedOrg);
  }, [watched, selectedOrg]);

  // Same idea for the degradations banner. MVE: filter to the selected org so
  // the banner matches the list below it.
  const visibleChanges = useMemo(() => {
    if (!selectedOrg) return [];
    return changes.filter(c => !c.owner_org || c.owner_org === selectedOrg);
  }, [changes, selectedOrg]);

  if (phase === 'loading' || phase === 'oauth-callback') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-32 text-center">
        <p className="text-xs font-black uppercase tracking-widest opacity-60">
          {phase === 'oauth-callback' ? 'SIGNING YOU IN…' : 'LOADING DASHBOARD…'}
        </p>
      </div>
    );
  }

  if (phase === 'unauth') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 min-h-[70vh] flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column - Sign In */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="bg-white border-4 border-soy-bottle p-10 shadow-[12px_12px_0px_#E63322] text-center w-full max-w-md">
              <Shield size={64} className="text-soy-red mx-auto mb-6" />
              <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-4">OpenSoyce Exceptions Management Dashboard</h2>
              <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-6 leading-relaxed">
                SIGN IN WITH GITHUB TO MANAGE EXCEPTIONS FOR REPOS WHERE GUARD IS INSTALLED.
              </p>
              {errorMessage && (
                <div className="bg-soy-red text-white border-2 border-soy-bottle p-3 mb-6 text-[10px] font-black uppercase tracking-widest">
                  {errorMessage}
                </div>
              )}
              {oauthClientId === '' ? (
                <div className="bg-soy-red text-white border-4 border-black p-6 shadow-[6px_6px_0px_#000] text-left">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle size={24} className="shrink-0" />
                    <span className="font-black uppercase tracking-widest text-sm">OAUTH NOT CONFIGURED</span>
                  </div>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-4 leading-normal">
                    This instance of OpenSoyce requires GitHub OAuth client credentials. Please set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET in your .env file and restart the server.
                  </p>
                  <a
                    href="https://github.com/settings/developers"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block w-full bg-black text-[#F5F0E8] py-3 text-center text-xs font-black uppercase tracking-widest hover:bg-white hover:text-black border-2 border-black transition-colors"
                  >
                    CONFIGURE GITHUB OAUTH →
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSignIn}
                  disabled={oauthClientId === null}
                  className="w-full bg-soy-bottle text-soy-label py-4 text-lg font-black uppercase tracking-widest hover:bg-soy-red transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  <Github size={20} />
                  {oauthClientId === null ? 'LOADING…' : 'SIGN IN WITH GITHUB'}
                </button>
              )}
            </div>
          </div>

          {/* Right Column - Visual Mockup Preview */}
          <div className="lg:col-span-7 space-y-6">
            <div className="border-4 border-soy-bottle bg-white shadow-[8px_8px_0px_#000] overflow-hidden">
              {/* Window Header */}
              <div className="bg-soy-bottle text-soy-label px-4 py-2 flex items-center justify-between border-b-4 border-soy-bottle select-none">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-soy-red"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60 font-mono">
                  exceptions-live-preview.exe
                </span>
                <div className="w-12"></div>
              </div>

              {/* Mock Content */}
              <div className="p-6 font-mono text-xs space-y-6">
                <div>
                  <h3 className="text-lg font-black uppercase italic mb-1">active exceptions [repo: acme/web-app]</h3>
                  <p className="text-[10px] opacity-60 font-bold uppercase tracking-wider">showing active and historical security overrides</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-soy-bottle text-[10px] font-black uppercase opacity-60 text-left">
                        <th className="pb-2">PACKAGE</th>
                        <th className="pb-2">ECOSYSTEM</th>
                        <th className="pb-2">REASON</th>
                        <th className="pb-2">EXPIRY</th>
                        <th className="pb-2 text-right">STATUS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-soy-bottle/10">
                      <tr className="bg-white">
                        <td className="py-2.5 font-bold text-soy-bottle">@babel/core</td>
                        <td className="py-2.5"><span className="border border-soy-bottle/40 px-1 py-0.5 text-[9px] font-black">npm</span></td>
                        <td className="py-2.5 opacity-80">Transitive vuln verified benign in our dev environment.</td>
                        <td className="py-2.5">Jun 15, 2026</td>
                        <td className="py-2.5 text-right"><span className="bg-emerald-500 text-white border border-black px-1.5 py-0.5 text-[9px] font-black">ACTIVE</span></td>
                      </tr>
                      <tr className="bg-white">
                        <td className="py-2.5 font-bold text-soy-bottle">axios</td>
                        <td className="py-2.5"><span className="border border-soy-bottle/40 px-1 py-0.5 text-[9px] font-black">npm</span></td>
                        <td className="py-2.5 opacity-80">SSRF mitigation handled at network Gateway layer.</td>
                        <td className="py-2.5">Jul 20, 2026</td>
                        <td className="py-2.5 text-right"><span className="bg-emerald-500 text-white border border-black px-1.5 py-0.5 text-[9px] font-black">ACTIVE</span></td>
                      </tr>
                      <tr className="bg-soy-label/20 opacity-50">
                        <td className="py-2.5 font-bold text-soy-bottle line-through">minimist</td>
                        <td className="py-2.5"><span className="border border-soy-bottle/20 px-1 py-0.5 text-[9px] font-black">npm</span></td>
                        <td className="py-2.5 line-through">Prototype pollution prototype bypass.</td>
                        <td className="py-2.5">Expired May 10</td>
                        <td className="py-2.5 text-right"><span className="bg-gray-400 text-white border border-soy-bottle px-1.5 py-0.5 text-[9px] font-black">EXPIRED</span></td>
                      </tr>
                      <tr className="bg-soy-label/20 opacity-50">
                        <td className="py-2.5 font-bold text-soy-bottle line-through">nanoid</td>
                        <td className="py-2.5"><span className="border border-soy-bottle/20 px-1 py-0.5 text-[9px] font-black">npm</span></td>
                        <td className="py-2.5 line-through">Random generator seeding fallback review.</td>
                        <td className="py-2.5">Revoked</td>
                        <td className="py-2.5 text-right"><span className="bg-soy-red text-white border border-black px-1.5 py-0.5 text-[9px] font-black">REVOKED</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="p-4 border-2 border-dashed border-soy-bottle/20 bg-soy-label/10 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Grant new exception:</span>
                  <span className="text-[9px] font-black bg-soy-bottle text-soy-label px-2 py-1 select-none cursor-not-allowed">[ + ADD POLICY ]</span>
                </div>
              </div>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-60 italic text-center lg:text-left">
              * Exceptions allow your build pipelines to pass despite score-caps on specific, audited dependencies.
            </p>
          </div>
        </div>
      </div>
    );
  }


  // phase === 'auth'
  return (
    <div className="max-w-7xl mx-auto px-4 py-12 font-mono">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 border-b-4 border-soy-bottle pb-6">
        <div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-2">
            {selectedRepo ? `OpenSoyce Exceptions Management for ${selectedRepo.owner}/${selectedRepo.repo}` : 'OpenSoyce Exceptions Management Dashboard'}
          </h1>
          <div className="text-[10px] font-black uppercase tracking-widest opacity-60">
            SIGNED IN AS <span className="text-soy-red">@{login}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          className="self-start md:self-auto flex items-center gap-2 border-2 border-soy-bottle px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-soy-bottle hover:text-soy-label transition-colors"
        >
          <LogOut size={14} /> Sign Out
        </button>
      </header>

      {!selectedRepo ? (
        <section className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#000]">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter mb-2">PICK A REPO</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-6">
            REPOS WHERE GUARD IS INSTALLED AND YOU HAVE WRITE OR ADMIN ACCESS.
          </p>
          {reposLoading ? (
            <p className="text-xs font-black uppercase tracking-widest opacity-60">LOADING REPOS…</p>
          ) : sortedRepos.length === 0 ? (
            <div className="bg-soy-label/20 border-2 border-soy-bottle p-6">
              <p className="text-xs font-bold uppercase tracking-widest opacity-70 leading-relaxed">
                NO ELIGIBLE REPOS FOUND. INSTALL THE OPENSOYCE GUARD GITHUB APP ON A REPO
                YOU HAVE WRITE ACCESS TO, THEN COME BACK.
              </p>
            </div>
          ) : (
            <ul className="divide-y-2 divide-soy-label border-2 border-soy-bottle">
              {sortedRepos.map(r => (
                <li key={`${r.owner}/${r.repo}`}>
                  <button
                    type="button"
                    onClick={() => setSelectedRepo(r)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-soy-label transition-colors"
                  >
                    <span className="text-xs font-black uppercase tracking-widest">{r.owner}/{r.repo}</span>
                    <ChevronRight size={16} className="text-soy-red" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-6">
            <button
              type="button"
              onClick={() => setSelectedRepo(null)}
              className="text-[10px] font-black uppercase tracking-widest underline decoration-2 underline-offset-4 hover:text-soy-red"
            >
              ← All repos
            </button>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">/</span>
            <span className="text-xs font-black uppercase tracking-widest">{selectedRepo.owner}/{selectedRepo.repo}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Grant form */}
            <section className="lg:col-span-2 bg-white border-4 border-soy-bottle p-6 shadow-[8px_8px_0px_#000]">
              <h2 className="text-xl font-black uppercase italic tracking-tighter mb-4 flex items-center gap-2">
                <Plus size={20} /> Grant exception
              </h2>
              <form onSubmit={handleGrant} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">Package name</label>
                  <input
                    type="text"
                    value={pkgName}
                    onChange={e => setPkgName(e.target.value)}
                    placeholder="lodash"
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white"
                    maxLength={214}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">Ecosystem</label>
                  <select
                    value={ecosystem}
                    onChange={e => setEcosystem(e.target.value as typeof ECOSYSTEMS[number])}
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white"
                  >
                    {ECOSYSTEMS.map(eco => <option key={eco} value={eco}>{eco}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">
                    Reason <span className="opacity-60">({reasonLen}/{REASON_MAX})</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Approved by security team on 2026-05-18; vendor SBOM attached…"
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white min-h-[120px]"
                    maxLength={REASON_MAX + 100}
                    required
                  />
                  {reasonLen > 0 && reasonLen < REASON_MIN && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-soy-red mt-1">
                      Need at least {REASON_MIN} characters.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">Expires in</label>
                  <select
                    value={expiresInDays}
                    onChange={e => setExpiresInDays(Number(e.target.value))}
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white"
                  >
                    {EXPIRY_OPTIONS.map(d => <option key={d} value={d}>{d} days</option>)}
                  </select>
                </div>
                {grantError && (
                  <div className="bg-soy-red text-white border-2 border-soy-bottle p-3 text-[10px] font-black uppercase tracking-widest flex items-start gap-2">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {grantError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={granting}
                  className="w-full bg-soy-red text-white py-3 text-xs font-black uppercase tracking-widest hover:bg-soy-bottle transition-all disabled:opacity-50 border-2 border-soy-bottle"
                >
                  {granting ? 'GRANTING…' : 'GRANT EXCEPTION'}
                </button>
              </form>
            </section>

            {/* List */}
            <section className="lg:col-span-3 bg-white border-4 border-soy-bottle p-6 shadow-[8px_8px_0px_#000]">
              {/* Compliance Banner */}
              <div className="bg-emerald-50 border-4 border-emerald-600 p-4 mb-6 flex items-start gap-3 shadow-[4px_4px_0px_#10B981] text-left">
                <span className="text-xl shrink-0">🛡️</span>
                <div>
                  <h4 className="font-black text-xs uppercase text-emerald-800 tracking-tight">
                    SOC 2 / ISO 27001 AUDIT READY COMPLIANCE LOG
                  </h4>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 mt-1 leading-relaxed">
                    All exception actions are logged immutably. Expirations and revocations are preserved to satisfy change control audit requirements.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b-2 border-soy-bottle/20 pb-4">
                <h2 className="text-xl font-black uppercase italic tracking-tighter flex items-center gap-2">
                  <Shield size={20} /> Active & Historical Exceptions
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  {exceptions.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={exportToCSV}
                        className="bg-[#00D2FF] text-black border-2 border-black text-[9px] font-black uppercase tracking-widest px-3 py-1.5 shadow-[2px_2px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_#000] transition-all cursor-pointer font-mono"
                      >
                        Export CSV
                      </button>
                      <button
                        type="button"
                        onClick={exportToJSON}
                        className="bg-soy-bottle text-soy-label border-2 border-black text-[9px] font-black uppercase tracking-widest px-3 py-1.5 shadow-[2px_2px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[1px_1px_0px_#000] transition-all cursor-pointer font-mono"
                      >
                        Export JSON
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => selectedRepo && refreshExceptions(selectedRepo)}
                    className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest hover:text-soy-red border-2 border-soy-bottle px-2.5 py-1"
                  >
                    <RefreshCw size={12} /> Refresh
                  </button>
                </div>
              </div>
              {listError && (
                <div className="bg-soy-red text-white border-2 border-soy-bottle p-3 mb-4 text-[10px] font-black uppercase tracking-widest">
                  {listError}
                </div>
              )}
              {listLoading ? (
                <p className="text-xs font-black uppercase tracking-widest opacity-60">LOADING…</p>
              ) : exceptions.length === 0 ? (
                <div className="bg-soy-label/20 border-2 border-soy-bottle p-6">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-70">
                    NO EXCEPTIONS GRANTED YET.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {exceptions.map(row => {
                    const status = classifyStatus(row);
                    const dim = status !== 'active';
                    return (
                      <li
                        key={row.id}
                        className={`border-2 border-soy-bottle p-4 ${dim ? 'bg-soy-label/30 opacity-60' : 'bg-white'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-black uppercase tracking-widest break-all">{row.package_name}</span>
                              <span className="text-[9px] font-bold uppercase tracking-widest bg-soy-label/40 px-1.5 py-0.5">
                                {row.ecosystem}
                              </span>
                              {status === 'expired' && (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-amber-400 text-soy-bottle px-1.5 py-0.5">EXPIRED</span>
                              )}
                              {status === 'revoked' && (
                                <span className="text-[9px] font-black uppercase tracking-widest bg-soy-bottle text-white px-1.5 py-0.5">REVOKED</span>
                              )}
                            </div>
                            <p className="text-xs leading-relaxed mb-2 whitespace-pre-wrap break-words">{row.reason}</p>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-60">
                              Expires {formatExpires(row.expires_at)} · Granted by @{row.granted_by}
                            </p>
                          </div>
                          {status === 'active' && (
                            <button
                              type="button"
                              onClick={() => handleRevoke(row.id)}
                              className="flex items-center gap-1 border-2 border-soy-bottle px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-soy-red hover:text-white hover:border-soy-red transition-colors flex-shrink-0"
                            >
                              <Trash2 size={12} /> Revoke
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* ------------------------------------------ notifications panel */}
          <section className="mt-8 bg-white border-4 border-soy-bottle p-6 shadow-[8px_8px_0px_#000]">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="text-xl font-black uppercase italic tracking-tight flex items-center gap-2">
                <Bell size={20} /> Notifications
              </h2>
              {notif && (
                <span
                  className={`text-[9px] font-black uppercase tracking-widest border-2 px-2 py-0.5 flex-shrink-0 ${
                    notif.configured
                      ? 'bg-emerald-500 text-white border-black'
                      : 'bg-soy-label/40 text-soy-bottle border-soy-bottle'
                  }`}
                >
                  {notif.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                </span>
              )}
            </div>

            {notifLoading ? (
              <p className="text-xs font-black uppercase tracking-widest opacity-60">
                LOADING NOTIFICATION SETTINGS…
              </p>
            ) : (
              <>
                {notifError && (
                  <div className="bg-soy-red text-white border-2 border-soy-bottle p-3 mb-4 text-[10px] font-black uppercase tracking-widest flex items-start gap-2">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {notifError}
                  </div>
                )}

                {notif && notif.configured ? (
                  // ----------------------------------------- State C: configured
                  <div className="space-y-4">
                    <div className="border-2 border-soy-bottle bg-soy-label/10 p-4">
                      <p className="text-sm font-black uppercase tracking-widest mb-1">
                        <span className="text-emerald-600">✓</span> Slack alerts are active
                      </p>
                      {notif.updated_by && notif.updated_at && (
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                          Configured by <span className="text-soy-red">@{notif.updated_by}</span>{' '}
                          on {formatExpires(notif.updated_at)}
                        </p>
                      )}
                    </div>

                    {notifEditing ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-black uppercase tracking-widest mb-1">
                            New Slack webhook URL
                          </label>
                          <input
                            type="url"
                            value={notifWebhookInput}
                            onChange={e => setNotifWebhookInput(e.target.value)}
                            placeholder="https://hooks.slack.com/services/..."
                            className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white"
                            maxLength={SLACK_WEBHOOK_URL_MAX + 50}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleNotifSave}
                            disabled={
                              notifSaving ||
                              notifReadOnly ||
                              !notifWebhookInput.trim().startsWith(SLACK_WEBHOOK_URL_PREFIX)
                            }
                            title={notifReadOnly ? 'You need write access to change this.' : undefined}
                            className="bg-soy-red text-white py-2 px-4 text-[10px] font-black uppercase tracking-widest hover:bg-soy-bottle transition-all disabled:opacity-50 border-2 border-soy-bottle"
                          >
                            {notifSaving ? 'SAVING…' : 'SAVE'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setNotifEditing(false); setNotifWebhookInput(''); setNotifError(null); }}
                            disabled={notifSaving}
                            className="border-2 border-soy-bottle px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-soy-bottle hover:text-soy-label transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleNotifDisable}
                          disabled={notifSaving || notifReadOnly}
                          title={notifReadOnly ? 'You need write access to change this.' : undefined}
                          className="border-2 border-soy-bottle px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-soy-red hover:text-white hover:border-soy-red transition-colors disabled:opacity-50"
                        >
                          {notifSaving ? 'SAVING…' : 'DISABLE'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setNotifEditing(true); setNotifWebhookInput(''); setNotifError(null); }}
                          disabled={notifSaving || notifReadOnly}
                          title={notifReadOnly ? 'You need write access to change this.' : undefined}
                          className="border-2 border-soy-bottle px-4 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-soy-bottle hover:text-soy-label transition-colors disabled:opacity-50"
                        >
                          Change URL
                        </button>
                      </div>
                    )}
                  </div>
                ) : notif ? (
                  // -------------------------------- State B: not configured (or disabled)
                  <div className="space-y-4">
                    <p className="text-xs leading-relaxed">
                      No Slack alerts configured for this repo.
                    </p>
                    {notif.updated_by && notif.updated_at && (
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                        Last disabled by <span className="text-soy-red">@{notif.updated_by}</span>{' '}
                        on {formatExpires(notif.updated_at)}
                      </p>
                    )}
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-widest mb-1">
                        Slack webhook URL
                      </label>
                      <input
                        type="url"
                        value={notifWebhookInput}
                        onChange={e => setNotifWebhookInput(e.target.value)}
                        placeholder="https://hooks.slack.com/services/..."
                        className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white disabled:opacity-50"
                        maxLength={SLACK_WEBHOOK_URL_MAX + 50}
                        disabled={notifReadOnly}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleNotifSave}
                      disabled={
                        notifSaving ||
                        notifReadOnly ||
                        !notifWebhookInput.trim().startsWith(SLACK_WEBHOOK_URL_PREFIX)
                      }
                      title={notifReadOnly ? 'You need write access to change this.' : undefined}
                      className="bg-soy-red text-white py-2 px-4 text-[10px] font-black uppercase tracking-widest hover:bg-soy-bottle transition-all disabled:opacity-50 border-2 border-soy-bottle"
                    >
                      {notifSaving ? 'SAVING…' : 'SAVE'}
                    </button>
                    <p className="text-[10px] leading-relaxed opacity-70 border-t-2 border-dashed border-soy-bottle/30 pt-3">
                      Guard will POST a one-line alert to this URL when a PR ends with a failure
                      conclusion (an un-excepted BLOCK verdict). The URL is stored in Supabase,
                      never displayed back, and never returned by the API.
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </section>
        </>
      )}

      {/* ----------------------------------------------------- watchlist */}
      <section className="mt-12">
        <div className="flex items-center justify-between mb-4 border-b-4 border-soy-bottle pb-3">
          <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-none flex items-center gap-2">
            <Eye size={26} /> Watched packages
          </h2>
          <button
            type="button"
            onClick={() => { refreshWatched(); refreshChanges(); }}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest hover:text-soy-red"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        {/* Sprint+6: stale-session banner. Sits above everything else in the
            watchlist section so the empty-list confusion never gets a chance
            to mislead the user. */}
        {staleSession && (
          <div className="bg-amber-400 text-soy-bottle border-4 border-soy-bottle p-4 mb-6 shadow-[6px_6px_0px_#000] flex items-start gap-3">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-[11px] font-bold uppercase tracking-widest leading-relaxed">
              Your sign-in is on an older permission set and can&apos;t see your organization watchlists.
              {' '}
              <button
                type="button"
                onClick={handleSignOut}
                className="underline decoration-2 underline-offset-4 hover:text-soy-red font-black"
              >
                Sign out
              </button>
              {' '}and back in to upgrade.
            </div>
          </div>
        )}

        {/* Sprint+6: org picker. Always renders when the user has at least one
            org so even a single-org user knows what they're scoped to. */}
        {!staleSession && sortedOrgs.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <label className="text-[10px] font-black uppercase tracking-widest" htmlFor="watchlist-org-picker">
              Showing watchlist for:
            </label>
            <select
              id="watchlist-org-picker"
              value={selectedOrg ?? sortedOrgs[0]}
              onChange={e => setSelectedOrg(e.target.value)}
              className="border-2 border-soy-bottle bg-soy-label/10 px-3 py-1.5 text-xs font-mono font-black uppercase tracking-widest focus:outline-none focus:bg-white"
            >
              {sortedOrgs.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        )}

        {/* Recent degradations banner (filtered to selected org). */}
        {!staleSession && visibleChanges.length > 0 && (
          <div className="bg-soy-red text-white border-4 border-soy-bottle p-4 mb-6 shadow-[6px_6px_0px_#000]">
            <button
              type="button"
              onClick={() => setChangesExpanded(v => !v)}
              className="w-full flex items-center justify-between gap-3 text-left"
            >
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
                <AlertTriangle size={16} /> [!] {visibleChanges.length} watched package{visibleChanges.length === 1 ? '' : 's'} degraded recently
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                {changesExpanded ? 'HIDE' : 'SHOW'}
              </span>
            </button>
            {(changesExpanded || visibleChanges.length <= 3) && (
              <ul className="mt-3 space-y-2 border-t-2 border-white/40 pt-3">
                {visibleChanges.map((c, i) => (
                  <li key={`${c.package_name}-${c.ecosystem}-${c.owner}-${c.repo}-${i}`} className="text-[11px] font-mono">
                    <span className="font-black">{c.package_name}</span>
                    <span className="opacity-80"> ({c.ecosystem})</span>
                    <span className="opacity-80"> &mdash; {c.owner}/{c.repo}: </span>
                    <span className="font-black">{c.prev_label}</span>
                    <span className="opacity-80"> &rarr; </span>
                    <span className="font-black">{c.new_label}</span>
                    <span className="opacity-80"> &middot; {formatRelative(c.scanned_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Watchlist load error */}
        {watchedError && (
          <div className="bg-soy-red text-white border-2 border-soy-bottle p-3 mb-4 text-[10px] font-black uppercase tracking-widest">
            {watchedError}
          </div>
        )}

        {staleSession ? null : watchedLoading && watched === null ? (
          <p className="text-xs font-black uppercase tracking-widest opacity-60 text-center py-8">LOADING WATCHLIST...</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Add form */}
            <section className="lg:col-span-2 bg-white border-4 border-soy-bottle p-6 shadow-[8px_8px_0px_#000]">
              <h3 className="text-xl font-black uppercase italic tracking-tighter mb-4 flex items-center gap-2">
                <Plus size={20} /> Watch a package
              </h3>
              <form onSubmit={handleWatchAdd} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">Package name</label>
                  <input
                    type="text"
                    value={watchPkgName}
                    onChange={e => setWatchPkgName(e.target.value)}
                    placeholder="react"
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white"
                    maxLength={214}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-1">Ecosystem</label>
                  <select
                    value={watchEcosystem}
                    onChange={e => setWatchEcosystem(e.target.value as typeof ECOSYSTEMS[number])}
                    className="w-full border-2 border-soy-bottle bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none focus:bg-white"
                  >
                    {ECOSYSTEMS.map(eco => <option key={eco} value={eco}>{eco}</option>)}
                  </select>
                </div>
                {watchAddError && (
                  <div className="bg-soy-red text-white border-2 border-soy-bottle p-3 text-[10px] font-black uppercase tracking-widest flex items-start gap-2">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {watchAddError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={watchAdding || !selectedOrg}
                  className="w-full bg-soy-red text-white py-3 text-xs font-black uppercase tracking-widest hover:bg-soy-bottle transition-all disabled:opacity-50 border-2 border-soy-bottle"
                >
                  {watchAdding
                    ? 'ADDING...'
                    : selectedOrg
                      ? `ADD TO ${selectedOrg.toUpperCase()} WATCHLIST`
                      : 'PICK AN ORG FIRST'}
                </button>
              </form>
            </section>

            {/* List */}
            <section className="lg:col-span-3 bg-white border-4 border-soy-bottle p-6 shadow-[8px_8px_0px_#000]">
              <h3 className="text-xl font-black uppercase italic tracking-tighter mb-4">
                {selectedOrg ? `${selectedOrg}'s watchlist` : 'Watchlist'}
              </h3>
              {visibleWatched.length === 0 ? (
                <div className="bg-soy-label/20 border-2 border-soy-bottle p-6">
                  <p className="text-xs font-bold uppercase tracking-widest opacity-70 leading-relaxed">
                    {selectedOrg
                      ? `NO PACKAGES WATCHED FOR ${selectedOrg.toUpperCase()} YET. ADD ONE ABOVE.`
                      : 'NO PACKAGES WATCHED.'}
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {visibleWatched.map(w => (
                    <li key={w.id} className="border-2 border-soy-bottle p-4 bg-white">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-black uppercase tracking-widest break-all">{w.package_name}</span>
                            <span className="text-[9px] font-bold uppercase tracking-widest bg-soy-label/40 px-1.5 py-0.5">
                              {w.ecosystem}
                            </span>
                          </div>
                          <p className="text-[9px] font-black uppercase tracking-widest opacity-60">
                            Added {formatRelative(w.created_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleUnwatch(w.id)}
                          className="flex items-center gap-1 border-2 border-soy-bottle px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-soy-red hover:text-white hover:border-soy-red transition-colors flex-shrink-0"
                        >
                          <Trash2 size={12} /> Unwatch
                        </button>
                      </div>
                      {w.verdicts.length === 0 ? (
                        <div className="border-t-2 border-dashed border-soy-bottle/30 pt-3 mt-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-relaxed">
                            NO SCANS YET &mdash; THIS PACKAGE HASN&apos;T BEEN SEEN IN ANY OF YOUR GUARD
                            RUNS. TRIGGER A PR ON A REPO THAT INCLUDES IT.
                          </p>
                        </div>
                      ) : (
                        <div className="border-t-2 border-dashed border-soy-bottle/30 pt-3 mt-2">
                          <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-2">
                            Current verdicts across your repos:
                          </p>
                          <ul className="space-y-1.5">
                            {w.verdicts.map(v => (
                              <li
                                key={`${v.owner}/${v.repo}`}
                                className="flex items-center justify-between gap-2 text-[11px] font-mono flex-wrap"
                              >
                                <span className="font-black truncate">{v.owner}/{v.repo}</span>
                                <span className="flex items-center gap-2 flex-shrink-0">
                                  <VerdictChip label={v.label} />
                                  <span className="opacity-60 text-[10px]">{formatRelative(v.scanned_at)}</span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
