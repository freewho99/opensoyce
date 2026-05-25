import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, Bell, Star, KeyRound, ArrowUpRight, Search } from 'lucide-react';
import { motion } from 'motion/react';

export default function Settings() {
  const [search, setSearch] = useState('');

  const activeFeatures = [
    {
      id: 'watchlist',
      title: 'Watchlist',
      icon: Star,
      desc: 'The watchlist is stored locally in your browser, no account required. Add or remove repos from the watch button on any repo\'s nutrition label.',
      current: true,
      link: '/watchlist',
      linkLabel: 'View watchlist'
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: Bell,
      desc: 'Band-drop notifications are managed per-repo through the /claim flow. File a rebuttal with the "Notify me when this repo\'s verdict band drops" checkbox to subscribe. The cron walks subscribers daily.',
      current: true,
      link: '/claim',
      linkLabel: 'Manage via /claim'
    }
  ];

  const futureIntegrations = [
    {
      id: 'profile',
      title: 'Account profile',
      icon: SettingsIcon,
      desc: 'GitHub sign-in is supported today through the Sign In button in the header, but persistent account state isn\'t wired up yet.',
      current: false
    },
    {
      id: 'token',
      title: 'Personal API token',
      icon: KeyRound,
      desc: 'For developer use: a personal token for the OpenSoyce API to raise per-IP rate limits.',
      current: false
    }
  ];

  const filterCards = (cards: typeof activeFeatures) => {
    return cards.filter(c => 
      c.title.toLowerCase().includes(search.toLowerCase()) || 
      c.desc.toLowerCase().includes(search.toLowerCase())
    );
  };

  const filteredActive = filterCards(activeFeatures);
  const filteredFuture = filterCards(futureIntegrations as any);

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <section className="mb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-block bg-soy-red text-white px-6 py-2 text-sm font-black uppercase tracking-widest italic mb-6 shadow-[4px_4px_0px_#000]"
        >
          ACCOUNT
        </motion.div>
        <h1 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter leading-none mb-6 flex items-center gap-4">
          <SettingsIcon size={56} strokeWidth={3} className="text-soy-red" />
          SETTINGS
        </h1>
        <p className="text-xl font-medium opacity-70 max-w-2xl">
          Account preferences and notification settings live here. Most account-scoped features
          aren't built yet -- this page documents what's coming and where today's controls live.
        </p>
      </section>

      {/* Search Bar */}
      <section className="mb-10 relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30 text-black" size={20} />
        <input 
          type="text"
          placeholder="SEARCH CONFIGURATIONS..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white border-4 border-black p-4 pl-12 font-black outline-none focus:ring-4 focus:ring-soy-red transition-all uppercase placeholder-black/30 shadow-[4px_4px_0px_#000]"
        />
      </section>

      {/* Active Features Section */}
      {filteredActive.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-3 h-8 bg-soy-red" />
            <h2 className="text-2xl font-black uppercase italic tracking-tight text-soy-bottle">Active Features</h2>
            <div className="flex-1 h-[3px] bg-soy-bottle" />
            <span className="text-[9px] font-black uppercase tracking-widest bg-green-600 text-white px-3 py-1 border-2 border-black shadow-[2px_2px_0px_#000]">[LIVE]</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredActive.map(c => {
              const Icon = c.icon;
              return (
                <div key={c.id} className="bg-white border-4 border-soy-bottle p-6 shadow-[4px_4px_0px_#000] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <Icon size={20} strokeWidth={2.5} className="text-soy-red" />
                        <h3 className="text-lg font-black uppercase tracking-widest">{c.title}</h3>
                      </div>
                      <span className="bg-green-600 text-white px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border-2 border-black shadow-[2px_2px_0px_#000]">
                        [CURRENT]
                      </span>
                    </div>
                    <p className="text-sm opacity-70 mb-4">{c.desc}</p>
                  </div>
                  {c.link && (
                    <Link
                      to={c.link}
                      className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-red hover:underline mt-auto"
                    >
                      {c.linkLabel}
                      <ArrowUpRight size={14} strokeWidth={3} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Future Integrations Section */}
      {filteredFuture.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-3 h-8 bg-amber-400" />
            <h2 className="text-2xl font-black uppercase italic tracking-tight text-soy-bottle opacity-65">Future Integrations</h2>
            <div className="flex-1 h-[3px] bg-soy-bottle/30" />
            <span className="text-[9px] font-black uppercase tracking-widest bg-amber-400 text-black px-3 py-1 border-2 border-black shadow-[2px_2px_0px_#000]">[COMING SOON]</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredFuture.map(c => {
              const Icon = c.icon;
              return (
                <div key={c.id} className="bg-white border-2 border-soy-bottle/40 p-6 shadow-[4px_4px_0px_#000] opacity-75 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <Icon size={20} strokeWidth={2.5} className="text-gray-500" />
                        <h3 className="text-lg font-black uppercase tracking-widest text-gray-700">{c.title}</h3>
                      </div>
                      <span className="bg-amber-400 text-black px-2.5 py-1 text-[9px] font-black uppercase tracking-widest border-2 border-black shadow-[2px_2px_0px_#000]">
                        [COMING SOON]
                      </span>
                    </div>
                    <p className="text-sm opacity-70">{c.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {filteredActive.length === 0 && filteredFuture.length === 0 && (
        <div className="py-12 text-center border-4 border-dashed border-soy-bottle/20 rounded-lg mb-12">
          <p className="text-xl font-medium opacity-40 uppercase italic tracking-widest">
            No configurations match your search.
          </p>
        </div>
      )}

      <section className="bg-soy-label border-2 border-soy-bottle p-6">
        <p className="text-sm font-bold opacity-80 mb-2">
          Looking for something specific? Most of OpenSoyce works without an account.
        </p>
        <p className="text-xs opacity-60">
          Lookup, Scanner, Methodology, Compare, and the API endpoints all work anonymously.
          Sign-in only matters for the /claim rebuttal flow (which uses GitHub OAuth scoped
          to your verified collaborator status).
        </p>
      </section>
    </div>
  );
}

