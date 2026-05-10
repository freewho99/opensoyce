import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { 
  BarChart3, Activity, Users, Zap, 
  Trash2, RefreshCw, ArrowLeft, Clock 
} from 'lucide-react';
import { getAnalyticsEvents, clearAnalyticsEvents, AnalyticsEvent } from '../utils/analytics';

export default function Analytics() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);

  const loadData = () => {
    setEvents(getAnalyticsEvents());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleClear = () => {
    if (window.confirm('Are you sure? This will delete all tracked events.')) {
      clearAnalyticsEvents();
      loadData();
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const metrics = useMemo(() => {
    if (events.length === 0) return null;

    const totalEvents = events.length;
    const uniqueSessions = new Set(events.map(e => e.sessionId)).size;
    
    const eventCounts: Record<string, number> = {};
    events.forEach(e => {
      eventCounts[e.event] = (eventCounts[e.event] || 0) + 1;
    });

    const topEvent = Object.entries(eventCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    const lastEvent = events[events.length - 1];

    return {
      totalEvents,
      uniqueSessions,
      topEvent,
      lastEvent,
      eventCounts
    };
  }, [events]);

  const coreMetrics = [
    { name: 'analyze_project_click', why: 'Do people trust the label idea enough to go deeper?' },
    { name: 'fork_click', why: 'Does the remix thesis resonate?' },
    { name: 'submit_project_click', why: 'Do people want to participate?' },
    { name: 'email_subscribe', why: 'Do people want the ritual?' },
    { name: 'methodology_click', why: 'Do people care how scores work?' },
    { name: 'graveyard_click', why: 'Does the contrarian edge pull attention?' }
  ];

  const breakdown = useMemo(() => {
    const use = metrics?.eventCounts['use_click'] || 0;
    const fork = metrics?.eventCounts['fork_click'] || 0;
    const grow = metrics?.eventCounts['grow_click'] || 0;
    const max = Math.max(use, fork, grow, 1);

    return { use, fork, grow, max };
  }, [metrics]);

  const getIntent = (event: string) => {
    if (['methodology_click', 'score_explanation_open', 'signal_source_view'].includes(event)) return 'TRUST';
    if (['submit_project_click', 'badge_claim_click', 'challenge_label_click'].includes(event)) return 'PARTICIPATION';
    if (['graveyard_click', 'stale_project_open', 'analyze_project_click'].includes(event)) return 'JUDGMENT';
    if (['use_click', 'fork_click', 'grow_click', 'remix_case_study_click'].includes(event)) return 'BUILDER';
    if (['hero_explore_click', 'email_subscribe'].includes(event)) return 'DISCOVERY';
    return null;
  };

  const productRadar = useMemo(() => {
    const counts = metrics?.eventCounts || {};
    
    const trust = (counts['methodology_click'] || 0) + (counts['score_explanation_open'] || 0) + (counts['signal_source_view'] || 0);
    const participation = (counts['submit_project_click'] || 0) + (counts['badge_claim_click'] || 0) + (counts['challenge_label_click'] || 0);
    const judgment = (counts['graveyard_click'] || 0) + (counts['stale_project_open'] || 0) + (counts['analyze_project_click'] || 0);
    const builder = (counts['use_click'] || 0) + (counts['fork_click'] || 0) + (counts['grow_click'] || 0) + (counts['remix_case_study_click'] || 0);
    const discovery = (counts['hero_explore_click'] || 0) + (counts['email_subscribe'] || 0);

    const clusters = [
      { name: 'TRUST', count: trust, color: '#3B82F6', intent: 'TRUST INTENT', events: 'methodology_click, ...', insight: 'Do people believe the score?' },
      { name: 'PARTICIPATION', count: participation, color: '#22C55E', intent: 'PARTICIPATION INTENT', events: 'submit_project_click, ...', insight: 'Do people want to contribute?' },
      { name: 'JUDGMENT', count: judgment, color: '#E63322', intent: 'JUDGMENT INTENT', events: 'graveyard_click, ...', insight: 'Do people trust OpenSoyce\'s opinions?' },
      { name: 'BUILDER', count: builder, color: '#F97316', intent: 'BUILDER INTENT', events: 'use_click, ...', insight: 'Do people want to build on top of repos?' },
      { name: 'DISCOVERY', count: discovery, color: '#A855F7', intent: 'DISCOVERY INTENT', events: 'hero_explore_click, ...', insight: 'Are people exploring the ecosystem?' }
    ];

    const dominant = [...clusters].sort((a, b) => b.count - a.count)[0];

    return { clusters, dominantName: (dominant && dominant.count > 0) ? dominant.name : '—' };
  }, [metrics]);

  const conversionPaths = useMemo(() => {
    if (events.length < 2) return [];

    const paths: Record<string, number> = {};
    const sessions = events.reduce((acc, e) => {
      if (!acc[e.sessionId]) acc[e.sessionId] = [];
      acc[e.sessionId].push(e);
      return acc;
    }, {} as Record<string, AnalyticsEvent[]>);

    Object.values(sessions).forEach((sessionEvents) => {
      const sorted = [...(sessionEvents as AnalyticsEvent[])].sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 0; i < sorted.length - 1; i++) {
        const path = `${sorted[i].event} → ${sorted[i+1].event}`;
        paths[path] = (paths[path] || 0) + 1;
      }
    });

    return Object.entries(paths)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([path, count], idx) => {
        const [eventA, eventB] = path.split(' → ');
        return {
          rank: idx + 1,
          path,
          count,
          intentA: getIntent(eventA),
          intentB: getIntent(eventB)
        };
      });
  }, [events]);

  return (
    <div className="bg-[#F5F0E8] min-h-screen">
      {/* HERO */}
      <section className="bg-black py-16 px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#E63322] text-white px-4 py-1 text-[10px] font-black uppercase tracking-[0.4em] mb-8 inline-block"
          >
            INTERNAL — ALPHA ANALYTICS
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-7xl font-black uppercase italic tracking-tighter mb-8 leading-[0.8] text-white"
          >
            MARKET SIGNAL DASHBOARD
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-xl font-bold uppercase tracking-widest text-[#E63322] italic mb-12"
          >
            What are people actually doing? This is the data that matters.
          </motion.p>
          
          <div className="flex flex-wrap justify-center gap-4">
            <button 
              onClick={loadData}
              className="bg-white text-black px-8 py-4 text-xs font-black uppercase tracking-widest border-2 border-white hover:bg-transparent hover:text-white transition-all flex items-center gap-2"
            >
              <RefreshCw size={14} /> REFRESH DATA
            </button>
            <button 
              onClick={handleClear}
              className="border-2 border-[#E63322] text-[#E63322] px-8 py-4 text-xs font-black uppercase tracking-widest hover:bg-[#E63322] hover:text-white transition-all flex items-center gap-2"
            >
              <Trash2 size={14} /> CLEAR ALL DATA
            </button>
          </div>
        </div>
      </section>

      {/* KEY METRICS BAR */}
      <section className="bg-black border-t-2 border-white/10 text-white">
        <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-white/10 border-b border-white/10">
          <div className="p-8 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">TOTAL</div>
            <div className="text-4xl font-black italic">{metrics?.totalEvents || 0}</div>
          </div>
          <div className="p-8 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">SESSIONS</div>
            <div className="text-4xl font-black italic">{metrics?.uniqueSessions || 0}</div>
          </div>
          <div className="p-8 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">TOP EVENT</div>
            <div className="text-xl font-black italic truncate px-4">{metrics?.topEvent || '—'}</div>
          </div>
          <div className="p-8 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">DOMINANT INTENT</div>
            <div className="text-xl font-black italic text-[#E63322]">{productRadar.dominantName}</div>
          </div>
          <div className="p-8 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">LAST EVENT</div>
            <div className="text-xl font-black italic truncate px-4">{metrics?.lastEvent?.event || '—'}</div>
            {metrics?.lastEvent && (
              <div className="text-[10px] opacity-40 uppercase">{formatRelativeTime(metrics.lastEvent.timestamp)}</div>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-20 space-y-24">
        
        {/* PRODUCT RADAR */}
        <section>
          <div className="mb-10">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">PRODUCT RADAR</h2>
            <p className="text-sm font-bold uppercase tracking-widest text-[#E63322]">Intent clusters — not just raw events. This tells you what OpenSoyce actually means to the people using it.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {productRadar.clusters.map(cluster => (
              <div 
                key={cluster.name}
                className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_#000] flex flex-col h-full"
                style={{ borderLeftWidth: '4px', borderLeftColor: cluster.color }}
              >
                <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">{cluster.intent}</div>
                <h3 className="text-xl font-black uppercase tracking-tight mb-4">{cluster.name}</h3>
                <div className="text-5xl font-black italic text-[#E63322] mb-6">{cluster.count}</div>
                <div className="mt-auto space-y-4">
                  <div className="text-[9px] font-mono opacity-40 leading-tight">
                    {cluster.events}
                  </div>
                  <div className="text-xs italic font-bold opacity-60">
                    "{cluster.insight}"
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* TOP CONVERSION PATHS */}
        <section>
          <div className="mb-10">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">TOP CONVERSION PATHS</h2>
            <p className="text-sm font-bold uppercase tracking-widest text-[#E63322]">What journeys are users actually taking?</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {conversionPaths.length > 0 ? (
              conversionPaths.map(path => (
                <div key={path.rank} className="bg-white border-2 border-black p-6 shadow-[6px_6px_0px_#000]">
                  <div className="text-soy-red text-2xl font-black italic mb-2">#{path.rank}</div>
                  <div className="font-mono text-[10px] bg-black/5 p-3 border border-black/10 mb-4 break-all">
                    {path.path}
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <div className="text-[10px] font-black uppercase tracking-widest opacity-40">COUNT</div>
                    <div className="text-xl font-black italic">{path.count}</div>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[8px] font-black uppercase tracking-widest bg-black text-white px-2 py-0.5">
                      {path.intentA || 'OTHER'}
                    </span>
                    <span className="text-[8px] font-black opacity-20">→</span>
                    <span className="text-[8px] font-black uppercase tracking-widest bg-soy-red text-white px-2 py-0.5">
                      {path.intentB || 'OTHER'}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="md:col-span-3 py-12 text-center text-sm font-bold uppercase tracking-widest opacity-40 italic">
                NOT ENOUGH DATA YET. Keep using the product.
              </div>
            )}
          </div>
        </section>

        {/* CORE ALPHA METRICS */}
        <section>
          <div className="mb-10">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">RAW EVENT BREAKDOWN</h2>
            <p className="text-sm font-bold uppercase tracking-widest text-[#E63322]">Individual event counts. Use the PRODUCT RADAR above for the real signal.</p>
          </div>
          
          <div className="bg-white border-2 border-black overflow-hidden shadow-[8px_8px_0px_#000]">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-black text-white text-[10px] font-black uppercase tracking-widest">
                  <th className="p-4">EVENT NAME</th>
                  <th className="p-4 text-right">COUNT</th>
                  <th className="p-4 text-right">% OF TOTAL</th>
                  <th className="p-4 hidden md:table-cell">WHY IT MATTERS</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black/5">
                {coreMetrics.map(m => {
                  const count = metrics?.eventCounts[m.name] || 0;
                  const pct = metrics?.totalEvents ? ((count / metrics.totalEvents) * 100).toFixed(1) : 0;
                  return (
                    <tr key={m.name}>
                      <td className="p-4 font-mono text-xs">{m.name}</td>
                      <td className="p-4 text-right text-3xl font-black italic text-[#E63322]">{count}</td>
                      <td className="p-4 text-right text-sm font-bold opacity-40">{pct}%</td>
                      <td className="p-4 hidden md:table-cell text-xs italic opacity-40">"{m.why}"</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* USE vs FORK vs GROW */}
        <section>
          <div className="mb-10">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">USE vs FORK vs GROW</h2>
            <p className="text-sm font-bold uppercase tracking-widest text-[#E63322]">The answer tells you what business OpenSoyce actually wants to become.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <StatBox label="USE" count={breakdown.use} color="border-emerald-500" />
            <StatBox label="FORK" count={breakdown.fork} color="border-blue-500" />
            <StatBox label="GROW" count={breakdown.grow} color="border-orange-500" />
          </div>

          <div className="space-y-4 max-w-2xl">
            <Bar label="USE" count={breakdown.use} max={breakdown.max} color="bg-emerald-500" />
            <Bar label="FORK" count={breakdown.fork} max={breakdown.max} color="bg-blue-500" />
            <Bar label="GROW" count={breakdown.grow} max={breakdown.max} color="bg-orange-500" />
          </div>
        </section>

        {/* ALL EVENTS LOG */}
        <section>
          <div className="mb-10">
            <h2 className="text-4xl font-black uppercase italic tracking-tighter">EVENT LOG</h2>
            <p className="text-sm font-bold uppercase tracking-widest text-[#E63322]">Every tracked interaction. Most recent first.</p>
          </div>

          <div className="bg-white border-2 border-black overflow-hidden shadow-[8px_8px_0px_#000]">
            <div className="max-height-[400px] overflow-y-auto" style={{ maxHeight: '400px' }}>
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-black text-white text-[10px] font-black uppercase tracking-widest z-10">
                  <tr>
                    <th className="p-4">EVENT</th>
                    <th className="p-4">SESSION</th>
                    <th className="p-4">TIME</th>
                    <th className="p-4">METADATA</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black/5">
                  {events.length > 0 ? (
                    [...events].reverse().slice(0, 100).map((e, i) => (
                      <tr key={i} className="hover:bg-black/5 transition-colors">
                        <td className="p-4 font-mono text-xs font-bold">{e.event}</td>
                        <td className="p-4 font-mono text-[10px] opacity-40">{e.sessionId}</td>
                        <td className="p-4 text-[10px] font-bold uppercase">{formatRelativeTime(e.timestamp)}</td>
                        <td className="p-4 font-mono text-[9px] opacity-40 truncate max-w-[200px]">
                          {Object.keys(e.metadata || {}).length > 0 ? JSON.stringify(e.metadata).slice(0, 60) : '—'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="p-20 text-center text-sm font-bold uppercase tracking-widest opacity-40 italic">
                        NO EVENTS YET. Navigate around the app to generate data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* PAGE NAV */}
        <div className="pt-10 flex flex-col items-center gap-6">
          <Link 
            to="/admin/signals" 
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#E63322] hover:underline transition-all"
          >
            → OPEN SIGNAL INBOX
          </Link>
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest hover:text-[#E63322] transition-colors"
          >
            <ArrowLeft size={14} /> BACK TO HOMEPAGE
          </Link>
        </div>
      </div>
      
      <footer className="py-12 border-t-2 border-black/10 text-center text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
        © 2026 OPENSOYCE LABS. ALL SAUCE RESERVED.
      </footer>
    </div>
  );
}

function StatBox({ label, count, color }: { label: string, count: number, color: string }) {
  return (
    <div className={`bg-white border-2 border-black ${color} p-8 shadow-[6px_6px_0px_#000] text-center`}>
      <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-2">{label}</div>
      <div className="text-5xl font-black italic">{count}</div>
    </div>
  );
}

function Bar({ label, count, max, color }: { label: string, count: number, max: number, color: string }) {
  const width = (count / max) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
        <span>{label}</span>
        <span>{count}</span>
      </div>
      <div className="h-4 bg-black/5 border border-black overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${width}%` }}
          className={`h-full ${color}`}
        />
      </div>
    </div>
  );
}
