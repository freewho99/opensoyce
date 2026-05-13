import React, { useState } from 'react';
import { Search, Package, AlertTriangle, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface DepResult {
  name: string;
  version: string;
  score: number | null;
  status: string;
  lastCommit: string;
  license: string;
  stars: number;
  loading: boolean;
  error?: string;
}

export default function Scanner() {
  const [input, setInput] = useState('');
  const [results, setResults] = useState<DepResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(false);

  const parsePackageJson = (raw: string): Record<string, string> => {
    try {
      const parsed = JSON.parse(raw);
      return { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) };
    } catch {
      throw new Error('Invalid package.json — paste the full file contents');
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-400';
    if (score >= 8) return 'text-emerald-500';
    if (score >= 5) return 'text-amber-500';
    return 'text-rose-500';
  };

  const getScoreLabel = (score: number | null) => {
    if (score === null) return 'UNKNOWN';
    if (score >= 8) return 'HEALTHY';
    if (score >= 5) return 'OK';
    return 'AT RISK';
  };

  const scan = async () => {
    if (!input.trim()) {
      setError('Paste your package.json first');
      return;
    }
    setError('');
    setScanning(true);
    setScanned(false);
    setResults([]);

    let deps: Record<string, string>;
    try {
      deps = parsePackageJson(input);
    } catch (e: any) {
      setError(e.message);
      setScanning(false);
      return;
    }

    const depNames = Object.keys(deps).slice(0, 30); // cap at 30
    if (depNames.length === 0) {
      setError('No dependencies found in package.json');
      setScanning(false);
      return;
    }

    // Initialize results with loading state
    const initial: DepResult[] = depNames.map(name => ({
      name,
      version: deps[name],
      score: null,
      status: 'scanning',
      lastCommit: '—',
      license: '—',
      stars: 0,
      loading: true
    }));
    setResults(initial);

    // Fetch each dep via GitHub API (npm name -> github repo heuristic)
    const updated = [...initial];
    await Promise.all(depNames.map(async (name, i) => {
      try {
        // Try to find the GitHub repo via npm registry
        const npmResp = await fetch(`https://registry.npmjs.org/${name}/latest`);
        const npmData = await npmResp.json();
        const repoUrl = npmData?.repository?.url || '';
        const match = repoUrl.match(/github\.com/([^/]+/[^/.]+)/);
        
        if (!match) {
          updated[i] = { ...updated[i], loading: false, status: 'No GitHub repo', score: null };
          return;
        }
        
        const [owner, repo] = match[1].split('/');
        const ghResp = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        const ghData = await ghResp.json();
        
        if (ghData.message) {
          updated[i] = { ...updated[i], loading: false, status: 'Not found', score: null };
          return;
        }

        const pushedAt = new Date(ghData.pushed_at);
        const now = new Date();
        const daysSince = Math.floor((now.getTime() - pushedAt.getTime()) / 86400000);
        const lastCommit = daysSince === 0 ? 'Today' : daysSince === 1 ? 'Yesterday' : daysSince < 7 ? `${daysSince} days ago` : daysSince < 30 ? `${daysSince} days ago` : `${Math.floor(daysSince/30)} months ago`;

        // Soyce Score: simplified heuristic based on stars, activity, open issues
        const activityScore = daysSince < 7 ? 10 : daysSince < 30 ? 7 : daysSince < 90 ? 4 : 1;
        const starScore = Math.min(10, Math.log10(ghData.stargazers_count + 1) * 3);
        const issueScore = ghData.open_issues_count < 50 ? 10 : ghData.open_issues_count < 200 ? 7 : ghData.open_issues_count < 1000 ? 4 : 2;
        const score = Math.round(((activityScore + starScore + issueScore) / 3) * 10) / 10;

        updated[i] = {
          ...updated[i],
          loading: false,
          score: Math.min(10, score),
          status: ghData.archived ? 'ARCHIVED' : daysSince > 365 ? 'STALE' : 'ACTIVE',
          lastCommit,
          license: ghData.license?.spdx_id || 'None',
          stars: ghData.stargazers_count
        };
      } catch {
        updated[i] = { ...updated[i], loading: false, status: 'Error', score: null };
      }
      setResults([...updated]);
    }));

    setScanning(false);
    setScanned(true);
  };

  const formatStars = (n: number) => n >= 1000 ? (n/1000).toFixed(1) + 'K' : String(n);

  return (
    <div className="min-h-screen bg-[#f5f0e8] font-sans">
      <div className="max-w-5xl mx-auto px-6 py-16">

        {/* Header */}
        <div className="mb-10">
          <div className="inline-block bg-[#e63322] text-white text-xs font-black px-3 py-1 mb-4 tracking-widest">SCANNER</div>
          <h1 className="text-5xl font-black uppercase text-[#302c26] leading-tight mb-3">
            WHAT'S ACTUALLY IN<br />YOUR STACK?
          </h1>
          <p className="text-[#302c26]/70 text-lg max-w-2xl">
            Paste your <code className="bg-[#302c26]/10 px-1 font-mono text-sm">package.json</code> and get a live Soyce Score for every dependency. No installs. No accounts. Just the truth.
          </p>
        </div>

        {/* Input */}
        <div className="border-2 border-[#302c26] bg-white mb-6">
          <div className="border-b-2 border-[#302c26] px-4 py-2 flex items-center gap-2">
            <Package size={14} className="text-[#302c26]/50" />
            <span className="text-xs font-black uppercase tracking-widest text-[#302c26]/50">package.json</span>
          </div>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder='{ "dependencies": { "react": "^18.0.0", "axios": "^1.6.0" } }'
            rows={8}
            className="w-full p-4 font-mono text-sm text-[#302c26] bg-transparent outline-none resize-y"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-rose-600 text-sm font-bold mb-4">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <button
          onClick={scan}
          disabled={scanning}
          className="w-full bg-[#302c26] text-[#f5f0e8] font-black uppercase tracking-widest py-4 text-lg hover:bg-[#e63322] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        >
          {scanning ? (
            <><Loader2 size={18} className="animate-spin" /> SCANNING YOUR STACK...</>
          ) : (
            <><Search size={18} /> SCAN DEPENDENCIES</>
          )}
        </button>

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-black uppercase text-[#302c26]">
                {scanned ? `${results.length} DEPS SCANNED` : 'SCANNING...'}
              </h2>
              {scanned && (
                <div className="text-sm text-[#302c26]/50">
                  {results.filter(r => r.score !== null && r.score >= 8).length} healthy •{' '}
                  {results.filter(r => r.score !== null && r.score < 5).length} at risk
                </div>
              )}
            </div>

            <div className="border-2 border-[#302c26] overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] bg-[#302c26] text-[#f5f0e8] text-xs font-black uppercase tracking-widest">
                <div className="px-4 py-3">PACKAGE</div>
                <div className="px-4 py-3 text-center">SOYCE SCORE</div>
                <div className="px-4 py-3 text-center">STATUS</div>
                <div className="px-4 py-3 text-center">LAST COMMIT</div>
                <div className="px-4 py-3 text-center">STARS</div>
                <div className="px-4 py-3 text-center">LICENSE</div>
              </div>

              {results.map((dep, idx) => (
                <div
                  key={dep.name}
                  className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] border-t-2 border-[#302c26]/20 ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f5f0e8]'}`}
                >
                  <div className="px-4 py-3">
                    <div className="font-black text-[#302c26] text-sm">{dep.name}</div>
                    <div className="text-xs text-[#302c26]/50 font-mono">{dep.version}</div>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-center">
                    {dep.loading ? (
                      <Loader2 size={14} className="animate-spin text-[#302c26]/40" />
                    ) : (
                      <span className={`text-2xl font-black ${getScoreColor(dep.score)}`}>
                        {dep.score !== null ? dep.score.toFixed(1) : '—'}
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-3 flex items-center justify-center">
                    {dep.loading ? null : (
                      <span className={`text-xs font-black px-2 py-1 ${dep.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : dep.status === 'STALE' || dep.status === 'ARCHIVED' ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-500'}`}>
                        {dep.status}
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-3 flex items-center justify-center text-xs text-[#302c26]/60">
                    {dep.loading ? null : dep.lastCommit}
                  </div>
                  <div className="px-4 py-3 flex items-center justify-center text-sm font-bold text-[#302c26]">
                    {dep.loading ? null : dep.stars ? formatStars(dep.stars) : '—'}
                  </div>
                  <div className="px-4 py-3 flex items-center justify-center">
                    {dep.loading ? null : (
                      <span className="text-xs font-mono text-[#302c26]/60">{dep.license}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {scanned && (
              <div className="mt-6 border-2 border-[#e63322] bg-white p-6">
                <div className="text-xs font-black uppercase tracking-widest text-[#e63322] mb-2">WANT DEEPER ANALYSIS?</div>
                <p className="text-[#302c26] font-bold">The Scanner gives you a quick read. The full Soyce Nutrition Label shows maintenance trends, contributor health, license risk, and embeddable badges for your README.</p>
                <button onClick={() => window.location.href = '/lookup'} className="mt-4 bg-[#e63322] text-white font-black uppercase tracking-widest px-6 py-3 hover:bg-[#302c26] transition-colors text-sm">
                  RUN FULL ANALYSIS →
                </button>
              </div>
            )}
          </div>
        )}

        {!scanning && !scanned && results.length === 0 && (
          <div className="mt-10 border-2 border-[#302c26]/20 p-8 text-center">
            <div className="text-4xl mb-4">📦</div>
            <p className="text-[#302c26]/50 font-bold uppercase tracking-wide text-sm">Paste your package.json above and hit scan</p>
            <p className="text-[#302c26]/30 text-xs mt-2">Supports up to 30 dependencies per scan</p>
          </div>
        )}

      </div>
    </div>
  );
}