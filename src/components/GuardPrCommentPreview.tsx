import React from 'react';
import { ShieldAlert, AlertTriangle, CheckCircle2, GitPullRequest } from 'lucide-react';

type LabelKind = 'USE READY' | 'STABLE' | 'WATCHLIST' | 'RISKY' | 'GRAVEYARD';

function Chip({ label }: { label: LabelKind }) {
  const styles: Record<LabelKind, string> = {
    'USE READY': 'bg-emerald-500 text-white border-black',
    'STABLE': 'bg-soy-label text-soy-bottle border-soy-bottle',
    'WATCHLIST': 'bg-amber-400 text-black border-black',
    'RISKY': 'bg-soy-red text-white border-black',
    'GRAVEYARD': 'bg-black text-soy-red border-soy-red',
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-black uppercase tracking-widest italic border-2 ${styles[label]}`}>
      {label}
    </span>
  );
}

function CountRow({ label, count }: { label: LabelKind; count: number }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-dashed border-soy-bottle/20">
      <Chip label={label} />
      <span className="font-mono font-black text-soy-bottle">{count}</span>
    </div>
  );
}

export default function GuardPrCommentPreview() {
  return (
    <div className="bg-white border-4 border-black shadow-[8px_8px_0px_#000] max-w-3xl mx-auto">
      {/* GH-style header bar */}
      <div className="flex items-center gap-3 bg-soy-bottle text-white px-4 py-3 border-b-4 border-black">
        <div className="w-8 h-8 bg-soy-red border-2 border-black flex items-center justify-center">
          <ShieldAlert size={18} className="text-white" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-black uppercase tracking-widest italic">opensoyce-guard <span className="opacity-50">bot</span></span>
          <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">commented on PR #482</span>
        </div>
        <div className="ml-auto flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest opacity-60">
          <GitPullRequest size={12} /> just now
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Title */}
        <div>
          <h3 className="text-2xl font-black uppercase italic tracking-tighter text-soy-bottle">OPEN SOYCE GUARD</h3>
          <p className="text-sm font-bold uppercase tracking-widest opacity-60 mt-1 italic">
            This PR changes <span className="text-soy-red">14 dependencies</span>.
          </p>
        </div>

        {/* Verdict Summary */}
        <div>
          <div className="text-[11px] font-black uppercase tracking-widest text-soy-bottle/60 mb-2 italic">Verdict Summary</div>
          <div className="border-2 border-soy-bottle bg-soy-label/40 p-4 space-y-1">
            <CountRow label="USE READY" count={7} />
            <CountRow label="STABLE" count={3} />
            <CountRow label="WATCHLIST" count={2} />
            <CountRow label="RISKY" count={1} />
            <div className="flex items-center justify-between pt-1">
              <Chip label="GRAVEYARD" />
              <span className="font-mono font-black text-soy-red">1</span>
            </div>
          </div>
        </div>

        {/* Blocked */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-soy-red" />
            <span className="text-[11px] font-black uppercase tracking-widest text-soy-red italic">Blocked by policy</span>
          </div>
          <div className="border-2 border-soy-red bg-soy-red/5 p-4">
            <div className="flex items-center gap-2 mb-1">
              <code className="font-mono font-black text-soy-bottle">example-package</code>
              <Chip label="GRAVEYARD" />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-70 italic">
              Reason: stale source repo, unresolved critical advisory, low maintainer activity
            </p>
          </div>
        </div>

        {/* Warnings */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-500" />
            <span className="text-[11px] font-black uppercase tracking-widest text-amber-600 italic">Warnings</span>
          </div>
          <div className="border-2 border-amber-400 bg-amber-50 p-4">
            <div className="flex items-center gap-2 mb-1">
              <code className="font-mono font-black text-soy-bottle">ai-helper-sdk</code>
              <Chip label="WATCHLIST" />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest opacity-70 italic">
              Reason: fast-moving SDK, maintainer concentration, recent advisory history
            </p>
          </div>
        </div>

        {/* Next moves */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={14} className="text-emerald-600" />
            <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 italic">Suggested next moves</span>
          </div>
          <ul className="space-y-2 text-xs font-bold uppercase tracking-widest text-soy-bottle">
            <li className="flex items-start gap-2"><span className="text-soy-red">▸</span> Replace graveyard dependency</li>
            <li className="flex items-start gap-2"><span className="text-soy-red">▸</span> Approve exception with reason</li>
            <li className="flex items-start gap-2"><span className="text-soy-red">▸</span> Pin version and watch</li>
          </ul>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t-2 border-dashed border-soy-bottle/20 flex items-center justify-between text-[10px] font-black uppercase tracking-widest opacity-50 italic">
          <span>powered by opensoyce guard</span>
          <span>signed report · sarif export</span>
        </div>
      </div>
    </div>
  );
}
