import React, { useEffect, useState } from 'react';

interface SauceTracePanelProps {
  owner: string;
  repo: string;
  score: number;
}

export default function SauceTracePanel({
  owner,
  repo,
  score,
}: SauceTracePanelProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  const traces = [
    `git clone https://github.com/${owner}/${repo}.git ... [OK]`,
    `parsing file tree structure ... found package.json, LICENSE, README.md`,
    `evaluating security rules ... dependabot file check complete`,
    `auditing contributors commit cadence ... 12 commit cycles resolved`,
    `running soyce-score calculations ... overall score: ${score.toFixed(1)}/10.0`,
    `SAUCE TRACE: scan completed · 5 pillars · 14 signals analyzed · overall score: ${score.toFixed(1)}/10.0`
  ];

  // Animate initial scan trace receipts
  useEffect(() => {
    setLogs([traces[0]]);
    const interval = setInterval(() => {
      setCurrentIdx((prev) => {
        const next = prev + 1;
        if (next < traces.length) {
          setLogs((prevLogs) => [...prevLogs, traces[next]]);
          return next;
        } else {
          clearInterval(interval);
          return prev;
        }
      });
    }, 1500);

    return () => clearInterval(interval);
  }, [owner, repo, score]);

  const activeTrace = logs[logs.length - 1] || 'initializing scanner ...';

  return (
    <div className="bg-[#100d0b] text-soy-label border-t border-[#3a3028] px-4 py-2 flex items-center justify-between select-none text-[10px] font-mono">
      <div className="flex items-center gap-2 truncate">
        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
        <span className="font-black text-soy-red uppercase tracking-wider shrink-0">SAUCE TRACE:</span>
        <span className="text-soy-label/60 truncate italic">{activeTrace}</span>
      </div>
      <div className="text-soy-label/30 shrink-0 text-[9px] font-bold uppercase tracking-wider hidden sm:block">
        system ok
      </div>
    </div>
  );
}
