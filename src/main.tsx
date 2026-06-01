/// <reference types="vite/client" />
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { Analytics } from '@vercel/analytics/react';
import App from './App.tsx';
import './index.css';
import { ProjectProvider } from './context/ProjectContext.tsx';
import { WatchlistProvider } from './context/WatchlistContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';

// Initialize Sentry as early as possible, env-gated
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    sendDefaultPii: false, // PII off by default for privacy
    environment: import.meta.env.MODE,
  });
}

// Suppress Vite HMR WebSocket errors
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (event.reason && (
      event.reason.message?.includes('WebSocket') || 
      event.reason.message?.includes('HMR')
    )) {
      event.preventDefault();
    }
  });

  const originalError = console.error;
  console.error = (...args) => {
    if (args[0] && typeof args[0] === 'string' && (
      args[0].includes('WebSocket') || 
      args[0].includes('vite')
    )) {
      return;
    }
    originalError.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={<p style={{ padding: 24 }}>Something went wrong. Please refresh.</p>}
    >
      <ProjectProvider>
        <AuthProvider>
          <WatchlistProvider>
            <App />
            <Analytics />
          </WatchlistProvider>
        </AuthProvider>
      </ProjectProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
