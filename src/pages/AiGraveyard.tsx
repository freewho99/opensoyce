import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertTriangle, Loader2, Skull } from 'lucide-react';
import SoyceScore, { verdictFor } from '../components/SoyceScore';
import { AI_CATEGORY_LABELS, type AiCategory } from '../data/aiEcosystem';
import { AI_GRAVEYARD } from '../data/aiGraveyard';
import { useAiBoardScores, formatMonthsAgo, type BoardScoreState } from '../hooks/useAiBoardScores';
import { trackEvent } from '../utils/analytics';

type FilterKey = 'all' | AiCategory;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'agents', label: AI_CATEGORY_LABELS['agents'] },
  { key: 'llm-frameworks', label: AI_CATEGORY_LABELS['llm-frameworks'] },
  { key: 'training', label: AI_CATEGORY_LABELS['training'] },
];

export default function AiGraveyard() {
  const [filter, setFilter] = useState<FilterKey>('all');

  React.useEffect(() => {
    trackEvent('ai_graveyard_view', { page: '/graveyard/ai' });
  }, []);

  const scores = useAiBoardScores(AI_GRAVEYARD, 5);

  const visible = useMemo(() => {
    if (filter === 'all') return AI_GRAVEYARD;
    return AI_GRAVEYARD.filter(e => e.category === filter);
  }, [filter]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <span className="bg-soy-red text-white px-4 py-2 text-xs font-black uppercase tracking-[0.4em] shadow-[4px_4px_0px_#000]">
          GRAVEYARD WATCH
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 italic">
          Curator's list — live last-commit pulled from /api/analyze.
        </span>
      </div>

      <h1 className="text-5xl md:text-6xl font-black uppercase italic tracking-tighter leading-none mb-4 flex items-center gap-4 flex-wrap">
        Dead AI dependencies still getting installed <Skull className="text-soy-red" size={48} />
      </h1>
      <p className="text-xl font-bold uppercase tracking-wide opacity-70 italic max-w-3xl mb-10">
        These projects show signs of abandonment but still appear in modern lockfiles. Check whether you're shipping them.
      </p>

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
            <GraveyardCard
              key={cacheKey}
              owner={entry.owner}
              repo={entry.repo}
              tagline={entry.tagline}
              category={entry.category}
              lastCommitClaim={entry.lastCommitClaim}
              state={s}
            />
          );
        })}
      </div>

      <div className="mt-16 border-4 border-black p-8 bg-soy-bottle text-soy-label shadow-[6px_6px_0px_#000] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-black uppercase italic tracking-tighter mb-2">Want the full obituary?</h3>
          <p className="text-sm font-medium opacity-80 max-w-2xl">
            See the rest of OpenSoyce's stale-but-popular list — not AI-specific — in the main graveyard.
          </p>
        </div>
        <Link
          to="/graveyard"
          className="bg-soy-red text-white px-8 py-4 text-xs font-black uppercase tracking-widest hover:bg-white hover:text-soy-bottle transition-all flex items-center gap-2 shrink-0"
        >
          MAIN GRAVEYARD <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}

function GraveyardCard({
  owner,
  repo,
  tagline,
  category,
  lastCommitClaim,
  state,
}: {
  owner: string;
  repo: string;
  tagline: string;
  category: AiCategory;
  lastCommitClaim: string;
  state: BoardScoreState | undefined;
  key?: any;
}) {
  const isLoading = !state || state.status === 'pending' || state.status === 'loading';
  const isError = state?.status === 'error';
  const score = state?.status === 'ok' ? state.score ?? 0 : 0;
  const verdict = state?.status === 'ok' ? verdictFor(score, { advisorySummary: state.advisories ?? null }) : null;
  const monthsAgo = state?.status === 'ok' ? formatMonthsAgo(state.lastCommit) : null;

  return (
    <Link
      to={`/lookup?q=${owner}/${repo}`}
      onClick={() => trackEvent('ai_graveyard_card_click', { repo: `${owner}/${repo}`, source: 'ai_graveyard' })}
      className="group bg-white border-4 border-black p-6 shadow-[6px_6px_0px_#000] hover:shadow-[10px_10px_0px_#D12D2D] hover:-translate-y-1 transition-all flex flex-col relative overflow-hidden"
    >
      <Skull
        className="absolute -right-6 -top-6 text-soy-red opacity-5 group-hover:opacity-20 transition-opacity pointer-events-none"
        size={140}
      />

      <div className="relative z-10 flex justify-between items-start gap-3 mb-3">
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

      <p className="relative z-10 text-[11px] font-bold uppercase tracking-widest opacity-60 italic mb-4">
        "{tagline}"
      </p>

      <p className="relative z-10 text-[10px] font-bold uppercase tracking-wider text-soy-red mb-5 leading-relaxed">
        {lastCommitClaim}
      </p>

      <div className="relative z-10 mt-auto pt-4 border-t border-black/10 flex items-center justify-between gap-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-50">
            <Loader2 size={14} className="animate-spin" /> Exhuming…
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

      {!isLoading && !isError && monthsAgo && (
        <p className="relative z-10 mt-3 text-[10px] font-black uppercase tracking-widest opacity-70">
          Last commit: <span className="text-soy-red">{monthsAgo}</span>
        </p>
      )}

      <div className="relative z-10 mt-4 pt-3 border-t border-black/10 text-[9px] font-black uppercase tracking-[0.2em] text-soy-red flex items-center gap-2">
        SCAN LIVE <ArrowRight size={12} />
      </div>
    </Link>
  );
}
