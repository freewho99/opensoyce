import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Search, ShieldAlert, BookOpen, Layers, Terminal, Cpu, ArrowRight } from 'lucide-react';
import { OTS_PATTERN_DEFINITIONS, OTS_PATTERN_PACKS, OTS_INCIDENTS } from '../data/patterns';

const severityBadgeClass: Record<string, string> = {
  critical: 'bg-soy-red text-white border-soy-bottle',
  high: 'bg-orange-500 text-white border-soy-bottle',
  medium: 'bg-yellow-400 text-soy-bottle border-soy-bottle',
  low: 'bg-blue-400 text-white border-soy-bottle',
  info: 'bg-soy-label text-soy-bottle border-soy-bottle',
};

const packIcons: Record<string, React.ReactNode> = {
  'npm-supply-chain': <Layers className="text-soy-red" size={20} />,
  'github-actions': <Terminal className="text-soy-red" size={20} />,
  'developer-tool': <Cpu className="text-soy-red" size={20} />,
  'ai-agent-workflow': <ShieldAlert className="text-soy-red" size={20} />,
};

export default function Patterns() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPack, setSelectedPack] = useState<string>('all');

  const filteredPatterns = OTS_PATTERN_DEFINITIONS.filter((pattern) => {
    const matchesSearch =
      pattern.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pattern.shortDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
      pattern.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (selectedPack === 'all') {
      return matchesSearch;
    }

    const pack = OTS_PATTERN_PACKS.find((p) => p.id === selectedPack);
    return matchesSearch && (pack?.patternIds.includes(pattern.id) ?? false);
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-12 md:py-20 font-sans text-soy-bottle">
      {/* Header */}
      <header className="mb-16 border-b-8 border-soy-bottle pb-8">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="border-2 border-soy-bottle bg-soy-red text-white px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
            True OTS Feature
          </span>
          <span className="border-2 border-soy-bottle bg-white text-soy-bottle px-3 py-1 text-xs font-black uppercase tracking-widest shadow-[2px_2px_0px_#302C26]">
            v1.0.0
          </span>
        </div>
        <h1 className="text-5xl md:text-8xl font-black uppercase italic tracking-tighter leading-none mb-6">
          OTS PATTERN DICTIONARY
        </h1>
        <p className="text-xl md:text-2xl font-bold max-w-4xl leading-relaxed text-soy-bottle/80 uppercase">
          OpenSoyce does not stop at simple database CVE lookups. We maintain a living library of recurring exploit patterns behind real-world software supply-chain attacks, mapping them directly to evidence and CI policies.
        </p>
      </header>

      {/* Grid Layout: Left Column = Packs & Incidents, Right Column = Patterns List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Sidebar Controls (4 columns) */}
        <aside className="lg:col-span-4 space-y-12">
          {/* Search Box */}
          <div className="border-4 border-soy-bottle bg-white p-6 shadow-[8px_8px_0px_#302C26]">
            <h2 className="text-xl font-black uppercase tracking-tight mb-4 flex items-center gap-2">
              <Search size={20} /> Search Directory
            </h2>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search patterns..."
                className="w-full border-4 border-soy-bottle p-3 pr-10 font-bold uppercase tracking-tight text-sm focus:outline-none focus:bg-soy-label transition-colors"
              />
              <Search className="absolute right-3 top-3.5 text-soy-bottle/40" size={18} />
            </div>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mt-3 text-xs font-black uppercase tracking-widest text-soy-red hover:underline block text-left"
              >
                Clear Search
              </button>
            )}
          </div>

          {/* Pattern Packs Selection */}
          <div className="border-4 border-soy-bottle bg-white p-6 shadow-[8px_8px_0px_#302C26]">
            <h2 className="text-xl font-black uppercase tracking-tight mb-4 flex items-center gap-2">
              <Layers size={20} /> Pattern Packs
            </h2>
            <div className="space-y-3">
              <button
                onClick={() => setSelectedPack('all')}
                className={`w-full text-left p-3 border-2 border-soy-bottle font-black uppercase text-xs tracking-wider transition-all flex justify-between items-center ${
                  selectedPack === 'all'
                    ? 'bg-soy-bottle text-white shadow-[2px_2px_0px_#E63322]'
                    : 'bg-white text-soy-bottle hover:bg-soy-label shadow-[4px_4px_0px_#302C26]'
                }`}
              >
                <span>ALL PATTERNS</span>
                <span className="bg-soy-red text-white text-[9px] px-2 py-0.5 border border-soy-bottle">
                  {OTS_PATTERN_DEFINITIONS.length}
                </span>
              </button>

              {OTS_PATTERN_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => setSelectedPack(pack.id)}
                  className={`w-full text-left p-3 border-2 border-soy-bottle font-black uppercase text-xs tracking-wider transition-all flex flex-col gap-1 ${
                    selectedPack === pack.id
                      ? 'bg-soy-bottle text-white shadow-[2px_2px_0px_#E63322]'
                      : 'bg-white text-soy-bottle hover:bg-soy-label shadow-[4px_4px_0px_#302C26]'
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="flex items-center gap-2">
                      {packIcons[pack.id]}
                      {pack.name.replace(' Pattern Pack', '')}
                    </span>
                    <span className="bg-soy-red text-white text-[9px] px-2 py-0.5 border border-soy-bottle">
                      {pack.patternIds.length}
                    </span>
                  </div>
                  <p className={`text-[10px] normal-case font-bold tracking-normal mt-1 leading-normal ${
                    selectedPack === pack.id ? 'text-white/60' : 'text-soy-bottle/60'
                  }`}>
                    {pack.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Incident Case Studies */}
          <div className="border-4 border-soy-bottle bg-white p-6 shadow-[8px_8px_0px_#302C26]">
            <h2 className="text-xl font-black uppercase tracking-tight mb-4 flex items-center gap-2">
              <BookOpen size={20} /> Case Studies
            </h2>
            <div className="space-y-4">
              {OTS_INCIDENTS.map((incident) => (
                <Link
                  key={incident.id}
                  to={`/incidents/${incident.id}`}
                  className="block p-4 border-2 border-soy-bottle bg-soy-label hover:bg-white transition-all shadow-[4px_4px_0px_#302C26] hover:translate-x-1 hover:translate-y-1 hover:shadow-none"
                >
                  <span className="text-[10px] font-black uppercase text-soy-red tracking-widest block mb-1">
                    {incident.date} • {incident.target}
                  </span>
                  <h3 className="text-sm font-black uppercase italic leading-tight mb-2">
                    {incident.name}
                  </h3>
                  <p className="text-xs font-bold text-soy-bottle/60 line-clamp-2 leading-relaxed">
                    {incident.description}
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-soy-red hover:underline">
                    Read Case Study <ArrowRight size={12} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        {/* Patterns List (8 columns) */}
        <main className="lg:col-span-8 space-y-6">
          <div className="flex justify-between items-center mb-4 border-b-4 border-soy-bottle pb-2">
            <h2 className="text-2xl font-black uppercase tracking-tight italic">
              {selectedPack === 'all' ? 'All Active Patterns' : OTS_PATTERN_PACKS.find(p => p.id === selectedPack)?.name}
            </h2>
            <span className="text-xs font-black uppercase tracking-wider bg-soy-label border-2 border-soy-bottle px-3 py-1 shadow-[2px_2px_0px_#302C26]">
              {filteredPatterns.length} FOUND
            </span>
          </div>

          {filteredPatterns.length === 0 ? (
            <div className="border-4 border-dashed border-soy-bottle/40 p-12 text-center bg-white shadow-[8px_8px_0px_#302C26]">
              <ShieldAlert className="mx-auto text-soy-red/40 mb-4 animate-bounce" size={48} />
              <h3 className="text-2xl font-black uppercase tracking-tight mb-2">No Patterns Match Your Query</h3>
              <p className="text-sm font-bold text-soy-bottle/60 uppercase">
                Try clearing your search query or choosing a different pattern pack.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredPatterns.map((pattern) => (
                <article
                  key={pattern.id}
                  className="border-4 border-soy-bottle bg-white p-6 shadow-[8px_8px_0px_#302C26] hover:shadow-[12px_12px_0px_#E63322] hover:-translate-x-1 hover:-translate-y-1 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Tags */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className={`text-[10px] font-black uppercase border-2 px-2 py-0.5 ${severityBadgeClass[pattern.defaultSeverity]}`}>
                        {pattern.defaultSeverity}
                      </span>
                      <span className="text-[10px] font-black uppercase border-2 border-soy-bottle bg-soy-label text-soy-bottle px-2 py-0.5">
                        {pattern.category}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-xl font-black uppercase italic tracking-tight mb-2 hover:text-soy-red">
                      <Link to={`/patterns/${pattern.id}`}>{pattern.name}</Link>
                    </h3>

                    {/* Description */}
                    <p className="text-sm font-bold text-soy-bottle/70 leading-relaxed mb-4">
                      {pattern.shortDescription}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="border-t border-dashed border-soy-bottle/20 pt-4 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] font-black uppercase text-soy-bottle/40 block">Policy Action</span>
                      <span className="text-xs font-black uppercase text-soy-red">{pattern.defaultPolicyImpact}</span>
                    </div>
                    <Link
                      to={`/patterns/${pattern.id}`}
                      className="border-2 border-soy-bottle bg-white hover:bg-soy-bottle hover:text-white px-3 py-1.5 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_#302C26] transition-all"
                    >
                      Audit Spec
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
