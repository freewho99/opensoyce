import React from 'react';
import { motion } from 'motion/react';
import { Project } from '../types';

interface NutritionLabelProps {
  project: Project;
}

export default function NutritionLabel({ project }: NutritionLabelProps) {
  if (!project || !project.score) {
    return null;
  }
  
  const { score } = project;

  return (
    <div 
      id="nutrition-label"
      className="bg-soy-label border-2 border-soy-bottle p-4 w-full max-w-sm font-mono text-soy-bottle shadow-[4px_4px_0px_#302C26]"
    >
      <div className="border-b-8 border-soy-bottle pb-1 mb-2">
        <h2 className="text-4xl font-bold uppercase tracking-tighter leading-none italic">Open Soyce</h2>
        <p className="text-xs font-bold leading-tight mt-1">THE TRUST LAYER FOR OPEN SOURCE</p>
      </div>

      <div className="border-b border-soy-bottle pb-1 mb-3">
        <div className="flex justify-between items-end">
          <span className="text-sm font-bold uppercase">Project:</span>
          <span className="text-lg font-bold">{project.name}</span>
        </div>
      </div>

      <div className="border-b-4 border-soy-bottle pb-1 mb-3">
        <div className="flex justify-between items-baseline">
          <span className="text-xl font-bold uppercase">Soyce Score</span>
          <span className="text-3xl font-bold">{(score.overall ?? 0).toFixed(1)}</span>
        </div>
        <p className="text-[10px] opacity-70 italic">* Based on weighted health signals</p>
      </div>

      <div className="space-y-2 mb-4">
        <ScoreRow 
          label="Maintenance" 
          value={score.maintenance} 
          rawValue={score.raw?.maintenance} 
          maxRaw={3.0} 
        />
        <ScoreRow 
          label="Security" 
          value={score.security} 
          rawValue={score.raw?.security} 
          maxRaw={2.0} 
        />
        <ScoreRow 
          label="Community" 
          value={score.community} 
          rawValue={score.raw?.community} 
          maxRaw={2.5} 
        />
        <ScoreRow 
          label="Documentation" 
          value={score.documentation} 
          rawValue={score.raw?.documentation} 
          maxRaw={1.5} 
        />
        <ScoreRow 
          label="Activity" 
          value={score.activity || 0} 
          rawValue={score.raw?.activity} 
          maxRaw={1.0} 
        />
      </div>

      <div className="border-t-2 border-soy-bottle pt-2 text-[10px] font-bold uppercase space-y-1">
        <div className="flex justify-between">
          <span>Status:</span>
          <span className={project.status === 'Verified' ? 'text-soy-red' : ''}>{project.status}</span>
        </div>
        <div className="flex justify-between">
          <span>Last Scanned:</span>
          <span>{project.lastScanned}</span>
        </div>
        <div className="flex justify-between">
          <span>License:</span>
          <span>{project.license}</span>
        </div>
        {project.advisories && project.advisories.total > 0 && (
          <div className="flex justify-between">
            <span>Advisories:</span>
            <span className={project.advisories.recentOpen > 0 || (project.advisories.critical ?? 0) > 0 ? 'text-soy-red' : ''}>
              {project.advisories.openCount}/{project.advisories.total} OPEN
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-2 border-t border-soy-bottle text-[8px] italic leading-tight text-center opacity-60">
        NOT A SUBSTITUTE FOR A FULL SECURITY AUDIT. USE AT YOUR OWN RISK.
        SERVING SIZE: 1 REPO.
      </div>
    </div>
  );
}

function ScoreRow({ label, value, rawValue, maxRaw }: { label: string; value: number; rawValue?: number; maxRaw?: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
        <span>{label}</span>
        <span>{rawValue !== undefined && maxRaw !== undefined ? `${rawValue.toFixed(1)}/${maxRaw.toFixed(1)}` : `${Math.round(value)}%`}</span>
      </div>
      <div className="flex h-3 bg-white/30 border border-soy-bottle/20 overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full bg-soy-bottle"
        />
      </div>
    </div>
  );
}
