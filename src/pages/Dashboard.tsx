import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { Github, ShieldCheck, Award, Eye, Copy, Check, ArrowUpRight, MessageSquare, Code, ExternalLink, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user, isLoggedIn, login, isLoading: isAuthLoading } = useAuth();
  const [copySuccess, setCopySuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'markdown' | 'html'>('markdown');

  if (!isLoggedIn || !user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-white border-4 border-soy-bottle p-12 shadow-[12px_12px_0px_#E63322] text-center w-full max-w-md">
          <ShieldCheck size={64} className="text-soy-red mx-auto mb-8" />
          <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-4">DASHBOARD ACCESS RESTRICTED</h2>
          <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-8 leading-relaxed">
            ONLY VERIFIED MAINTAINERS CAN ACCESS THE DASHBOARD. PLEASE SIGN IN TO CONTINUE.
          </p>
          <button 
            onClick={() => login()}
            disabled={isAuthLoading}
            className="w-full bg-soy-bottle text-soy-label py-4 text-xl font-black uppercase tracking-widest hover:bg-soy-red transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            <Github size={24} />
            {isAuthLoading ? 'CONNECTING...' : 'SIGN IN WITH GITHUB →'}
          </button>
        </div>
      </div>
    );
  }

  const badgeCode = activeTab === 'markdown' 
    ? `[![OpenSoyce Score](https://api.soyce.io/badge/devuser42/my-app)](https://opensoyce.io/projects/devuser42/my-app)`
    : `<a href="https://opensoyce.io/projects/devuser42/my-app"><img src="https://api.soyce.io/badge/devuser42/my-app" alt="OpenSoyce Score"></a>`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(badgeCode);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const stats = [
    { label: 'CLAIMED REPOS', value: '1' },
    { label: 'AVG SOYCE SCORE', value: '9.3' },
    { label: 'PROFILE VIEWS', value: '2,847', sub: '(THIS MONTH)' },
    { label: 'BADGE IMPRESSIONS', value: '12,450' },
  ];

  const activities = [
    { icon: '🔍', text: 'Score recalculated: 9.3 → 9.3 (no change)', time: '2 days ago' },
    { icon: '✅', text: 'Verification email sent', time: '3 days ago' },
    { icon: '🚩', text: 'Claim submitted for devuser42/my-app', time: '4 days ago' },
    { icon: '👀', text: 'Profile viewed 847 times this week', time: 'ongoing' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div className="flex items-center gap-6">
          <div className="relative">
            <img src={user.avatar_url} alt={user.login} className="w-16 h-16 rounded-full border-4 border-soy-bottle" />
            <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-none p-1 border-2 border-soy-bottle">
              <ShieldCheck size={16} strokeWidth={3} />
            </div>
          </div>
          <div>
            <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none mb-2">MAINTAINER DASHBOARD</h1>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-60">LOGGED IN AS:</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-soy-red underline decoration-2 underline-offset-4">{user.login}</span>
              <span className="bg-emerald-500 text-white px-2 py-0.5 text-[8px] font-black uppercase tracking-widest h-fit">VERIFIED</span>
            </div>
          </div>
        </div>
        <Link 
          to="/claim" 
          className="bg-soy-bottle text-soy-label px-6 py-3 text-xs font-black uppercase tracking-widest hover:bg-soy-red transition-all shadow-[4px_4px_0px_#000]"
        >
          CLAIM ANOTHER REPO
        </Link>
      </header>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        {stats.map((stat, i) => (
          <div key={i} className="bg-black text-white p-6 md:p-8 flex flex-col justify-center border-b-8 border-soy-red shadow-[8px_8px_0px_#302C26]">
            <span className="text-xs font-black uppercase tracking-[.2em] opacity-40 mb-2 truncate">{stat.label}</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl md:text-5xl font-black italic tracking-tighter text-soy-label">{stat.value}</span>
            </div>
            {stat.sub && <span className="text-[8px] font-black uppercase tracking-widest opacity-40 mt-1">{stat.sub}</span>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-12">
        {/* Main Card */}
        <div className="lg:col-span-2 space-y-12">
          <div className="bg-white border-4 border-soy-bottle p-8 md:p-12 shadow-[12px_12px_0px_#000]">
            <div className="flex justify-between items-start mb-12">
              <div>
                <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-2">devuser42/my-app</h2>
                <div className="flex gap-2">
                  <span className="bg-emerald-500 text-white px-2 py-1 text-[10px] font-black uppercase tracking-widest">VERIFIED</span>
                  <span className="bg-amber-400 text-soy-label px-2 py-1 text-[10px] font-black uppercase tracking-widest">PENDING REVIEW</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-6xl font-black italic tracking-tighter text-soy-red leading-none">9.3</div>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-40">SOYCE SCORE</div>
                <div className="mt-2 text-emerald-500 font-black italic text-xs flex items-center justify-end gap-1">
                   <ArrowUpRight size={14} /> +0.3 OVER 30D
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8 mb-12">
              {[
                { label: 'MAINTENANCE', score: 9.5 },
                { label: 'SECURITY', score: 9.0 },
                { label: 'COMMUNITY', score: 9.8 },
                { label: 'DOCUMENTATION', score: 8.9 },
              ].map(dim => (
                <div key={dim.label} className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                    <span className="opacity-40">{dim.label}</span>
                    <span>{(dim.score ?? 0).toFixed(1)}/10</span>
                  </div>
                  <div className="h-2 bg-soy-label/20 w-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${dim.score * 10}%` }}
                      className="h-full bg-soy-red"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 pt-8 border-t-2 border-soy-label">
              <button className="bg-soy-red text-white px-8 py-4 font-black uppercase tracking-widest text-sm hover:bg-soy-bottle transition-all shadow-[4px_4px_0px_#000]">
                GENERATE BADGE
              </button>
              <button className="bg-white border-4 border-soy-bottle px-8 py-4 font-black uppercase tracking-widest text-sm hover:bg-soy-label transition-all">
                DISPUTE SCORE
              </button>
            </div>
          </div>

          {/* Badge Generator Content */}
          <div className="bg-white border-4 border-soy-bottle p-8 md:p-12 shadow-[12px_12px_0px_#302C26]">
            <div className="flex items-center gap-4 mb-8">
              <Code size={32} className="text-soy-red" />
              <h3 className="text-3xl font-black uppercase italic tracking-tighter">YOUR OPENSOYCE BADGE</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-8">
              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-4 italic">LIVE PREVIEW</h4>
                <div className="inline-flex items-stretch border-2 border-soy-bottle shadow-[4px_4px_0px_#000]">
                  <div className="bg-soy-bottle text-white px-3 py-1 text-[10px] font-black uppercase flex items-center">OpenSoyce Score</div>
                  <div className="bg-soy-red text-white px-3 py-1 text-2xl font-black italic flex items-center">9.3 / 10</div>
                </div>
                <p className="mt-8 text-xs font-bold uppercase tracking-widest opacity-40 italic leading-relaxed">
                  DISPLAY THE NUTRITION FACTS OF YOUR PROJECT DIRECTLY IN YOUR README TO BUILD TRUST WITH USERS.
                </p>
              </div>
              <div className="space-y-4">
                <div className="flex gap-4 border-b-2 border-soy-label pb-2">
                  <button 
                    onClick={() => setActiveTab('markdown')}
                    className={`text-[10px] font-black uppercase tracking-widest pb-2 -mb-[10px] ${activeTab === 'markdown' ? 'text-soy-red border-b-4 border-soy-red' : 'opacity-40'}`}
                  >
                    MARKDOWN
                  </button>
                  <button 
                    onClick={() => setActiveTab('html')}
                    className={`text-[10px] font-black uppercase tracking-widest pb-2 -mb-[10px] ${activeTab === 'html' ? 'text-soy-red border-b-4 border-soy-red' : 'opacity-40'}`}
                  >
                    HTML
                  </button>
                </div>
                <div className="bg-soy-label/20 border-2 border-soy-bottle p-4 relative group">
                  <pre className="text-[10px] font-mono whitespace-pre-wrap break-all leading-normal opacity-80">
                    {badgeCode}
                  </pre>
                  <button 
                    onClick={copyToClipboard}
                    className="absolute top-2 right-2 p-2 bg-soy-bottle text-soy-label opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {copySuccess ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Activity */}
        <div className="space-y-12">
          <div className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#000]">
            <h3 className="text-2xl font-black uppercase italic tracking-tight mb-8 border-b-4 border-soy-bottle pb-2">RECENT ACTIVITY</h3>
            <div className="space-y-8">
              {activities.map((activity, i) => (
                <div key={i} className="flex gap-4">
                  <span className="text-2xl shrink-0">{activity.icon}</span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest leading-tight mb-1">{activity.text}</p>
                    <span className="text-[8px] font-bold uppercase tracking-widest opacity-40">{activity.time}</span>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-12 py-4 border-2 border-soy-bottle text-[10px] font-black uppercase tracking-widest hover:bg-soy-label transition-colors">
              VIEW FULL HISTORY
            </button>
          </div>

          <div className="bg-soy-bottle p-8 shadow-[8px_8px_0px_#E63322]">
            <h4 className="text-white text-xl font-black uppercase italic tracking-tighter mb-4">MAINTAINER PERKS</h4>
            <ul className="space-y-4">
              {[
                'Score Dispute Requests',
                'Custom Project Meta Description',
                'Maintainer Only Analytics',
                'Early Access to Audit v2'
              ].map(perk => (
                <li key={perk} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-soy-label opacity-80">
                  <Check size={14} className="text-soy-red" /> {perk}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
