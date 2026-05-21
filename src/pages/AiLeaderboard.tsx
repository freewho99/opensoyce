import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
import SoyceScore, { verdictFor } from '../components/SoyceScore';
import { AI_ECOSYSTEM, AI_CATEGORY_LABELS, type AiCategory } from '../data/aiEcosystem';
import { useAiBoardScores, type BoardScoreState } from '../hooks/useAiBoardScores';
import { trackEvent } from '../utils/analytics';

type FilterKey = 'all' | AiCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'agents', label: AI_CATEGORY_LABELS['agents'] },
  { key: 'llm-frameworks', label: AI_CATEGORY_LABELS['llm-frameworks'] },
  { key: 'vector-db', label: AI_CATEGORY_LABELS['vector-db'] },
  { key: 'inference', label: AI_CATEGORY_LABELS['inference'] },
  { key: 'ml-platform', label: AI_CATEGORY_LABELS['ml-platform'] },
  { key: 'embeddings', label: AI_CATEGORY_LABELS['embeddings'] },
  { key: 'rag', label: AI_CATEGORY_LABELS['rag'] },
  { key: 'training', label: AI_CATEGORY_LABELS['training'] },
];

export default function AiLeaderboard() {
  const [filter, setFilter] = useState<FilterKey>('all');

  React.useEffect(() => {
    trackEvent('ai_leaderboard_view', { page: '/leaderboard/ai' });
  }, []);

  // Fetch live scores for the full curated set on mount. The filter is a
  // pure display concern — we still warm the cache for every category so
  // toggling filters never re-triggers a network round.
  const scores = useAiBoardScores(AI_ECOSYSTEM, 5);

  const visible = useMemo(() => {
    if (filter === 'all') return AI_ECOSYSTEM;
    return AI_ECOSYSTEM.filter(e => e.category === filter);
  }, [filter]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <span className="bg-soy-red text-white px-4 py-2 text-xs font-black uppercase tracking-[0.4em] shadow-[4px_4px_0px_#000]">
          AI ECOSYSTEM LEADERBOARD
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 italic">
          Scores fetched live from /api/analyze. Verdict bands cap on hidden vulns.
        </span>
      </div>

      <h1 className="text-5xl md:text-6xl font-black uppercase italic tracking-tighter leading-none mb-4">
        How healthy is the AI dependency tree?
      </h1>
      <p className="text-xl font-bold uppercase tracking-wide opacity-70 italic max-w-3xl mb-10">
        {AI_ECOSYSTEM.length} curated AI projects across {FILTERS.length - 1} categories. Live nutrition labels — no cherry-picked numbers.
      </p>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-12">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all border-2 border-black shadow-[2px_2px_0px_#000] outline-none ${
              filter === f.key ? 'bg-black text-[#F5F0E8]' : 'bg-white text-black hover:bg-soy-red hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visible.map(entry => {
          const cacheKey = `${entry.owner}/${entry.repo}`.toLowerCase();
          const s = scores[cacheKey];
          return (
            <LeaderboardCard
              key={cacheKey}
              owner={entry.owner}
              repo={entry.repo}
              tagline={entry.tagline}
              category={entry.category}
              state={s}
            />
          );
        })}
      </div>

      {/* Methodology link */}
      <div className="mt-16 border-4 border-black p-8 bg-white shadow-[6px_6px_0px_#000] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-black uppercase italic tracking-tighter mb-2">How is each score calculated?</h3>
          <p className="text-sm font-medium opacity-70 max-w-2xl">
            The Soyce Score blends maintenance, community, security, documentation, and activity signals. Verdict bands are capped when hidden vulns exist.
          </p>
        </div>
        <Link
          to="/methodology"
          className="bg-black text-white px-8 py-4 text-xs font-black uppercase tracking-widest hover:bg-soy-red transition-all flex items-center gap-2 shrink-0"
        >
          READ METHODOLOGY <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function LeaderboardCard({
  owner,
  repo,
  tagline,
  category,
  state,
}: {
  owner: string;
  repo: string;
  tagline: string;
  category: AiCategory;
  state: BoardScoreState | undefined;
  key?: any;
}) {
  const isLoading = !state || state.status === 'pending' || state.status === 'loading';
  const isError = state?.status === 'error';
  const score = state?.status === 'ok' ? state.score ?? 0 : 0;
  const verdict = state?.status === 'ok' ? verdictFor(score, { advisorySummary: state.advisories ?? null }) : null;

  return (
    <Link
      to={`/lookup?q=${owner}/${repo}`}
      onClick={() => trackEvent('ai_leaderboard_card_click', { repo: `${owner}/${repo}`, source: 'ai_leaderboard' })}
      className="group bg-white border-4 border-black p-6 shadow-[6px_6px_0px_#000] hover:shadow-[10px_10px_0px_#D12D2D] hover:-translate-y-1 transition-all flex flex-col"
    >
      <div className="flex justify-between items-start gap-3 mb-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest opacity-40 leading-none mb-1 truncate">{owner} /</span>
          <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none group-hover:text-soy-red transition-all truncate">
            {repo}
          </h3>
        </div>
        <span className="px-2 py-1 bg-black text-white text-[8px] font-black uppercase tracking-[0.15em] border-2 border-black shrink-0">
          {AI_CATEGORY_LABELS[category]}
        </span>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-widest opacity-60 italic mb-5">
        "{tagline}"
      </p>

      <div className="mt-auto pt-4 border-t border-black/10 flex items-center justify-between gap-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-50">
            <Loader2 size={14} className="animate-spin" /> Scanning…
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-soy-red">
            <AlertTriangle size={14} /> Score unavailable
          </div>
        )}
        {!isLoading && !isError && state?.status === 'ok' && (
          <>
            <SoyceScore
              value={score}
              size="sm"
              advisorySummary={state.advisories ?? null}
            />
            <div className="flex flex-col items-end text-right">
              <span className="text-[8px] font-black uppercase tracking-[0.2em] opacity-40">VERDICT</span>
              <span className="text-[10px] font-black uppercase tracking-widest">{verdict}</span>
            </div>
          </>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-black/10 text-[9px] font-black uppercase tracking-[0.2em] text-soy-red flex items-center gap-2">
        SCAN LIVE <ArrowRight size={12} />
      </div>
    </Link>
  );
}
