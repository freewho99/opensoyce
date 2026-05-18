import React from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, Bell, Star, KeyRound, ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';

export default function Settings() {
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

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        <div className="bg-white border-2 border-soy-bottle/40 p-6 shadow-[4px_4px_0px_#000]">
          <div className="flex items-center gap-3 mb-3">
            <Bell size={20} strokeWidth={2.5} className="text-soy-red" />
            <h2 className="text-lg font-black uppercase tracking-widest">Notifications</h2>
          </div>
          <p className="text-sm opacity-70 mb-4">
            Band-drop notifications are managed per-repo through the /claim flow.
            File a rebuttal with the "Notify me when this repo's verdict band drops"
            checkbox to subscribe. The cron walks subscribers daily.
          </p>
          <Link
            to="/claim"
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-red hover:underline"
          >
            Manage via /claim
            <ArrowUpRight size={14} strokeWidth={3} />
          </Link>
        </div>

        <div className="bg-white border-2 border-soy-bottle/40 p-6 shadow-[4px_4px_0px_#000]">
          <div className="flex items-center gap-3 mb-3">
            <Star size={20} strokeWidth={2.5} className="text-soy-red" />
            <h2 className="text-lg font-black uppercase tracking-widest">Watchlist</h2>
          </div>
          <p className="text-sm opacity-70 mb-4">
            The watchlist is stored locally in your browser, no account required.
            Add or remove repos from the watch button on any repo's nutrition label.
          </p>
          <Link
            to="/watchlist"
            className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-soy-red hover:underline"
          >
            View watchlist
            <ArrowUpRight size={14} strokeWidth={3} />
          </Link>
        </div>

        <div className="bg-white border-2 border-soy-bottle/40 p-6 shadow-[4px_4px_0px_#000] opacity-50">
          <div className="flex items-center gap-3 mb-3">
            <KeyRound size={20} strokeWidth={2.5} />
            <h2 className="text-lg font-black uppercase tracking-widest">Personal API token</h2>
          </div>
          <p className="text-sm opacity-70 mb-2">
            For developer use: a personal token for the OpenSoyce API to raise
            per-IP rate limits.
          </p>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
            Coming soon
          </p>
        </div>

        <div className="bg-white border-2 border-soy-bottle/40 p-6 shadow-[4px_4px_0px_#000] opacity-50">
          <div className="flex items-center gap-3 mb-3">
            <SettingsIcon size={20} strokeWidth={2.5} />
            <h2 className="text-lg font-black uppercase tracking-widest">Account profile</h2>
          </div>
          <p className="text-sm opacity-70 mb-2">
            GitHub sign-in is supported today through the Sign In button in the header,
            but persistent account state isn't wired up yet.
          </p>
          <p className="text-[10px] font-black uppercase tracking-widest opacity-60">
            Coming soon
          </p>
        </div>
      </section>

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
