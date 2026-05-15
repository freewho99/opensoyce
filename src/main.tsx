import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Analytics } from '@vercel/analytics/react';
import App from './App.tsx';
import './index.css';
import { ProjectProvider } from './context/ProjectContext.tsx';
import { WatchlistProvider } from './context/WatchlistContext.tsx';
import { AuthProvider } from './context/AuthContext.tsx';

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
    <ProjectProvider>
      <AuthProvider>
        <WatchlistProvider>
          <App />
          <Analytics />
        </WatchlistProvider>
      </AuthProvider>
    </ProjectProvider>
  </StrictMode>,
);
