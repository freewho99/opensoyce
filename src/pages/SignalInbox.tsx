import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { 
  ArrowLeft, Filter, CheckCircle2, XCircle, 
  AlertCircle, Flame, Clock, Inbox,
  MessageSquare, GitPullRequest, Shield
} from 'lucide-react';
import { getAnalyticsEvents } from '../utils/analytics';

type SignalType = 'SUBMISSION' | 'CHALLENGE' | 'CLAIM';
type SignalStatus = 'NEW' | 'REVIEWING' | 'ACCEPTED' | 'REJECTED' | 'NEEDS EVIDENCE' | 'ADDED TO HEAT CHECK';

interface Signal {
  id: string;
  type: SignalType;
  status: SignalStatus;
  timestamp: number;
  data: any;
}

export default function SignalInbox() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [filter, setFilter] = useState<'ALL' | SignalType>('ALL');

  const loadSignals = () => {
    const submissionsRaw = localStorage.getItem('opensoyce_submissions');
    const challengesRaw = localStorage.getItem('opensoyce_challenges');
    const analytics = getAnalyticsEvents();

    const submissions: Signal[] = (submissionsRaw ? JSON.parse(submissionsRaw) : []).map((s: any, i: number) => ({
      id: `sub-${s.timestamp}-${i}`,
      type: 'SUBMISSION',
      status: s.status || 'NEW',
      timestamp: s.timestamp,
      data: s
    }));

    const challenges: Signal[] = (challengesRaw ? JSON.parse(challengesRaw) : []).map((s: any, i: number) => ({
      id: `cha-${s.timestamp}-${i}`,
      type: 'CHALLENGE',
      status: s.status || 'NEW',
      timestamp: s.timestamp,
      data: s
    }));

    const claims: Signal[] = analytics
      .filter(e => e.event === 'badge_claim_click')
      .map((e, i) => ({
        id: `cla-${e.timestamp}-${i}`,
        type: 'CLAIM',
        status: 'NEW', // Claims are events, so they don't have persisted status in this mock setup
        timestamp: e.timestamp,
        data: {
          repo: e.metadata?.repo || 'Unknown Repo',
          session: e.sessionId
        }
      }));

    const allSignals = [...submissions, ...challenges, ...claims].sort((a, b) => b.timestamp - a.timestamp);
    setSignals(allSignals);
  };

  useEffect(() => {
    loadSignals();
  }, []);

  const updateStatus = (id: string, newStatus: SignalStatus) => {
    setSignals(prev => prev.map(s => s.id === id ? { ...s, status: newStatus } : s));
    
    // Attempt to persist status back to localStorage for submissions/challenges
    if (id.startsWith('sub-')) {
      const raw = localStorage.getItem('opensoyce_submissions');
      if (raw) {
        const data = JSON.parse(raw);
        // Find by timestamp as a proxy for the original item in the array
        const timestamp = parseInt(id.split('-')[1]);
        const updated = data.map((item: any) => item.timestamp === timestamp ? { ...item, status: newStatus } : item);
        localStorage.setItem('opensoyce_submissions', JSON.stringify(updated));
      }
    } else if (id.startsWith('cha-')) {
      const raw = localStorage.getItem('opensoyce_challenges');
      if (raw) {
        const data = JSON.parse(raw);
        const timestamp = parseInt(id.split('-')[1]);
        const updated = data.map((item: any) => item.timestamp === timestamp ? { ...item, status: newStatus } : item);
        localStorage.setItem('opensoyce_challenges', JSON.stringify(updated));
      }
    }
  };

  const filteredSignals = useMemo(() => {
    if (filter === 'ALL') return signals;
    return signals.filter(s => s.type === filter);
  }, [signals, filter]);

  const stats = useMemo(() => {
    return {
      total: signals.length,
      submissions: signals.filter(s => s.type === 'SUBMISSION').length,
      challenges: signals.filter(s => s.type === 'CHALLENGE').length,
      claims: signals.filter(s => s.type === 'CLAIM').length,
      pending: signals.filter(s => s.status === 'NEW').length
    };
  }, [signals]);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  };

  return (
    <div className="bg-[#F5F0E8] min-h-screen">
      {/* HERO */}
      <section className="bg-black py-12 px-4 border-b-4 border-black">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-start mb-8">
            <div>
              <div className="bg-soy-red text-white px-3 py-0.5 text-[10px] font-black uppercase tracking-[0.3em] mb-4 inline-block">
                INTERNAL — SIGNAL INBOX
              </div>
              <h1 className="text-5xl font-black uppercase italic tracking-tighter text-white">
                SIGNAL INBOX
              </h1>
              <p className="text-white/60 text-sm font-bold uppercase tracking-widest mt-2">
                Review submissions, challenges, and claims. Stay accurate.
              </p>
            </div>
            <Link 
              to="/analytics" 
              className="text-white text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:text-soy-red transition-colors"
            >
              <ArrowLeft size={16} /> BACK TO ANALYTICS
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatBox label="TOTAL SIGNALS" value={stats.total} />
            <StatBox label="SUBMISSIONS" value={stats.submissions} />
            <StatBox label="CHALLENGES" value={stats.challenges} />
            <StatBox label="CLAIMS" value={stats.claims} />
            <StatBox label="PENDING" value={stats.pending} highlight />
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* FILTER BAR */}
        <div className="flex flex-wrap gap-4 mb-12">
          <FilterBtn active={filter === 'ALL'} onClick={() => setFilter('ALL')} label="ALL" count={stats.total} />
          <FilterBtn active={filter === 'SUBMISSION'} onClick={() => setFilter('SUBMISSION')} label="SUBMISSIONS" count={stats.submissions} />
          <FilterBtn active={filter === 'CHALLENGE'} onClick={() => setFilter('CHALLENGE')} label="CHALLENGES" count={stats.challenges} />
          <FilterBtn active={filter === 'CLAIM'} onClick={() => setFilter('CLAIM')} label="CLAIMS" count={stats.claims} />
        </div>

        {/* SIGNAL CARDS */}
        <div className="space-y-6">
          <AnimatePresence mode="popLayout">
            {filteredSignals.length > 0 ? (
              filteredSignals.map(signal => (
                <motion.div
                  layout
                  key={signal.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_#000] relative"
                >
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                    <div className="flex gap-3">
                      <TypeBadge type={signal.type} />
                      <StatusBadge status={signal.status} />
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-40 flex items-center gap-1">
                      <Clock size={12} /> {formatTime(signal.timestamp)}
                    </div>
                  </div>

                  <div className="mb-8">
                    {signal.type === 'SUBMISSION' && (
                      <SubmissionContent data={signal.data} />
                    )}
                    {signal.type === 'CHALLENGE' && (
                      <ChallengeContent data={signal.data} />
                    )}
                    {signal.type === 'CLAIM' && (
                      <ClaimContent data={signal.data} />
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-6 border-t border-black/10">
                    <ActionBtn onClick={() => updateStatus(signal.id, 'ACCEPTED')} label="ACCEPT" color="hover:bg-emerald-500" />
                    <ActionBtn onClick={() => updateStatus(signal.id, 'REJECTED')} label="REJECT" color="hover:bg-soy-red" />
                    <ActionBtn onClick={() => updateStatus(signal.id, 'REVIEWING')} label="REVIEWING" color="hover:bg-yellow-400" />
                    <ActionBtn onClick={() => updateStatus(signal.id, 'NEEDS EVIDENCE')} label="NEEDS EVIDENCE" color="hover:bg-orange-500" />
                    <ActionBtn onClick={() => updateStatus(signal.id, 'ADDED TO HEAT CHECK')} label="ADD TO HEAT CHECK" color="hover:bg-purple-500" />
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="py-32 text-center">
                <Inbox size={64} className="mx-auto mb-6 opacity-20" />
                <h3 className="text-2xl font-black uppercase italic tracking-tighter opacity-40">
                  NO SIGNALS YET. Share the product and come back.
                </h3>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <footer className="py-12 border-t-2 border-black/10 text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string, value: number, highlight?: boolean }) {
  return (
    <div className={`bg-white/5 border border-white/20 p-4 text-center ${highlight ? 'border-soy-red border-2' : ''}`}>
      <div className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">{label}</div>
      <div className={`text-2xl font-black italic ${highlight ? 'text-soy-red' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function FilterBtn({ active, onClick, label, count }: { active: boolean, onClick: () => void, label: string, count: number }) {
  return (
    <button 
      onClick={onClick}
      className={`px-6 py-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 transition-all ${
        active 
          ? 'bg-soy-red text-white border-2 border-soy-red' 
          : 'bg-white text-black border-2 border-black hover:bg-black hover:text-white'
      }`}
    >
      {label}
      <span className={`px-2 py-0.5 rounded-full text-[8px] ${active ? 'bg-white/20' : 'bg-black/10'}`}>
        {count}
      </span>
    </button>
  );
}

function TypeBadge({ type }: { type: SignalType }) {
  const styles: Record<SignalType, string> = {
    SUBMISSION: 'bg-blue-100 text-blue-700 border-blue-200',
    CHALLENGE: 'bg-red-100 text-red-700 border-red-200',
    CLAIM: 'bg-orange-100 text-orange-700 border-orange-200'
  };
  return (
    <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border ${styles[type]}`}>
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: SignalStatus }) {
  const styles: Record<SignalStatus, string> = {
    'NEW': 'bg-black text-white px-2 py-0.5',
    'REVIEWING': 'bg-yellow-400 text-black px-2 py-0.5',
    'ACCEPTED': 'bg-emerald-500 text-white px-2 py-0.5',
    'REJECTED': 'bg-soy-red text-white px-2 py-0.5',
    'NEEDS EVIDENCE': 'bg-orange-500 text-white px-2 py-0.5',
    'ADDED TO HEAT CHECK': 'bg-purple-500 text-white px-2 py-0.5'
  };
  return <span className={`text-[8px] font-black uppercase tracking-widest ${styles[status]}`}>{status}</span>;
}

function ActionBtn({ label, onClick, color }: { label: string, onClick: () => void, color: string }) {
  return (
    <button 
      onClick={onClick}
      className={`px-3 py-2 border border-black text-[9px] font-black uppercase tracking-widest transition-all hover:text-white ${color}`}
    >
      {label}
    </button>
  );
}

function SubmissionContent({ data }: { data: any }) {
  return (
    <div>
      <h4 className="text-xl font-black uppercase italic tracking-tight mb-2 underline decoration-soy-red decoration-4">
        {data.githubUrl}
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-black opacity-40 uppercase mb-1">CATEGORIES</div>
          <div className="text-sm font-bold uppercase">{data.category}</div>
        </div>
        <div>
          <div className="text-[10px] font-black opacity-40 uppercase mb-1">SUGGESTED LABEL</div>
          <div className="text-sm font-bold uppercase text-soy-red">{data.suggestedLabel}</div>
        </div>
        <div className="md:col-span-2">
          <div className="text-[10px] font-black opacity-40 uppercase mb-1">REASONING</div>
          <p className="text-sm font-bold italic leading-tight">{data.description}</p>
        </div>
        {data.email && (
          <div>
            <div className="text-[10px] font-black opacity-40 uppercase mb-1">CONTACT</div>
            <div className="text-sm font-bold">{data.email}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChallengeContent({ data }: { data: any }) {
  return (
    <div>
      <h4 className="text-xl font-black uppercase italic tracking-tight mb-2 underline decoration-soy-red decoration-4">
        CHALLENGE: {data.repo}
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] font-black opacity-40 uppercase mb-1">TRANSITION</div>
          <div className="text-sm font-bold uppercase flex items-center gap-2">
            <span className="opacity-40">{data.currentLabel}</span>
            <span>→</span>
            <span className="text-soy-red">{data.proposedLabel}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-black opacity-40 uppercase mb-1">BY USER</div>
          <div className="text-sm font-bold uppercase">{data.githubHandle || 'ANONYMOUS'}</div>
        </div>
        <div className="md:col-span-2">
          <div className="text-[10px] font-black opacity-40 uppercase mb-1">EVIDENCE</div>
          <p className="text-sm font-bold italic leading-tight">{data.evidence}</p>
        </div>
      </div>
    </div>
  );
}

function ClaimContent({ data }: { data: any }) {
  return (
    <div>
      <h4 className="text-xl font-black uppercase italic tracking-tight mb-2 underline decoration-soy-red decoration-4">
        CLAIM ATTEMPT: {data.repo}
      </h4>
      <div>
        <div className="text-[10px] font-black opacity-40 uppercase mb-1">SESSION ID</div>
        <div className="text-sm font-mono opacity-60 uppercase">{data.session}</div>
      </div>
    </div>
  );
}
