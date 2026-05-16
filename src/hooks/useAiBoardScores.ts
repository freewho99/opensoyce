import { useEffect, useState, useRef } from 'react';
import type { AdvisorySummaryLike } from '../components/SoyceScore';

export type BoardScoreState = {
  status: 'pending' | 'loading' | 'ok' | 'error';
  score?: number;
  advisories?: AdvisorySummaryLike | null;
  lastCommit?: string | null;
  stars?: number | null;
  error?: string;
};

export type BoardKey = string; // `${owner}/${repo}` lowercased

const sessionCache = new Map<BoardKey, BoardScoreState>();

function keyOf(owner: string, repo: string): BoardKey {
  return `${owner}/${repo}`.toLowerCase();
}

async function fetchOne(owner: string, repo: string): Promise<BoardScoreState> {
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner, repo }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: 'error', error: (data && (data.error as string)) || `HTTP ${res.status}` };
    }
    return {
      status: 'ok',
      score: typeof data.total === 'number' ? data.total : 0,
      advisories: data?.meta?.advisories ?? null,
      lastCommit: data?.meta?.lastCommit ?? null,
      stars: data?.meta?.totalStars ?? null,
    };
  } catch (err: any) {
    return { status: 'error', error: err?.message || 'NETWORK_ERROR' };
  }
}

/**
 * Throttled live-score loader for the AI leaderboard / graveyard pages.
 *
 * Concurrency: at most `concurrency` (default 5) in-flight /api/analyze
 * requests at a time. Results are cached in a module-scoped Map for the
 * user's session so navigating between the leaderboard and graveyard
 * doesn't refetch shared entries.
 *
 * On error per entry, the card renders "score unavailable" — a single
 * failure never aborts the whole batch.
 */
export function useAiBoardScores(
  entries: { owner: string; repo: string }[],
  concurrency = 5,
): Record<BoardKey, BoardScoreState> {
  const [state, setState] = useState<Record<BoardKey, BoardScoreState>>(() => {
    const seed: Record<BoardKey, BoardScoreState> = {};
    for (const e of entries) {
      const k = keyOf(e.owner, e.repo);
      seed[k] = sessionCache.get(k) ?? { status: 'pending' };
    }
    return seed;
  });

  // Stable signature so the effect only re-runs when the actual entry list
  // changes (page mount or filter that adds new repos). Reordering or
  // restating the same list should be a no-op.
  const sigRef = useRef<string>('');
  const sig = entries.map(e => keyOf(e.owner, e.repo)).sort().join(',');

  useEffect(() => {
    if (sigRef.current === sig) return;
    sigRef.current = sig;

    let cancelled = false;

    const queue: { owner: string; repo: string; key: BoardKey }[] = [];
    for (const e of entries) {
      const k = keyOf(e.owner, e.repo);
      const cached = sessionCache.get(k);
      if (cached && cached.status === 'ok') {
        setState(prev => ({ ...prev, [k]: cached }));
        continue;
      }
      queue.push({ ...e, key: k });
    }

    if (queue.length === 0) return;

    setState(prev => {
      const next = { ...prev };
      for (const q of queue) next[q.key] = { status: 'loading' };
      return next;
    });

    let cursor = 0;
    const worker = async () => {
      while (!cancelled) {
        const idx = cursor++;
        if (idx >= queue.length) return;
        const job = queue[idx];
        const result = await fetchOne(job.owner, job.repo);
        if (cancelled) return;
        sessionCache.set(job.key, result);
        setState(prev => ({ ...prev, [job.key]: result }));
      }
    };

    const workerCount = Math.max(1, Math.min(concurrency, queue.length));
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i++) workers.push(worker());
    Promise.all(workers).catch(() => {/* per-entry errors already captured */});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, concurrency]);

  return state;
}

export function formatMonthsAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  const months =
    (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  if (months <= 0) return 'this month';
  if (months === 1) return '1 month ago';
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 1 && rem === 0) return '1 year ago';
  if (rem === 0) return `${years} years ago`;
  return `${years}y ${rem}mo ago`;
}
