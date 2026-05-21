import React, { createContext, useContext, useState, useEffect } from 'react';
import { WatchlistItem } from '../types';

interface WatchlistContextType {
  watchlist: WatchlistItem[];
  addToWatchlist: (owner: string, repo: string, score: number) => void;
  removeFromWatchlist: (owner: string, repo: string) => void;
  isWatching: (owner: string, repo: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('soyce_watchlist');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error('Failed to load watchlist:', e);
      return [];
    }
  });

  const addToWatchlist = (owner: string, repo: string, score: number) => {
    const newItem: WatchlistItem = {
      owner,
      repo,
      initialScore: score,
      dateAdded: new Date().toISOString()
    };
    const updated = [...watchlist, newItem];
    setWatchlist(updated);
    localStorage.setItem('soyce_watchlist', JSON.stringify(updated));
  };

  const removeFromWatchlist = (owner: string, repo: string) => {
    const updated = watchlist.filter(item => 
      !(item.owner === owner && item.repo === repo)
    );
    setWatchlist(updated);
    localStorage.setItem('soyce_watchlist', JSON.stringify(updated));
  };

  const isWatching = (owner: string, repo: string) => {
    return watchlist.some(item => 
      item.owner.toLowerCase() === owner.toLowerCase() && 
      item.repo.toLowerCase() === repo.toLowerCase()
    );
  };

  return (
    <WatchlistContext.Provider value={{ watchlist, addToWatchlist, removeFromWatchlist, isWatching }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (context === undefined) {
    throw new Error('useWatchlist must be used within a WatchlistProvider');
  }
  return context;
}
