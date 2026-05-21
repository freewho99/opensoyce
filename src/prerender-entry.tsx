// SSR entry for the build-time prerender of /methodology.
// Renders the same component tree as src/main.tsx but with StaticRouter
// in place of BrowserRouter so it can be statically rendered to HTML.
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import App, { AppRoutes } from './App';
import { ProjectProvider } from './context/ProjectContext';
import { WatchlistProvider } from './context/WatchlistContext';
import { AuthProvider } from './context/AuthContext';

// Suppress framer-motion / motion `useReducedMotion` warnings during SSR.
// They don't affect output; useEffect-driven listeners simply never fire on Node.

export function renderPath(path: string): string {
  // Drop the AnimatePresence/Konami chrome inside App() — it requires `window`
  // listeners and is purely client-only. The full provider chain + routes is
  // enough for hydration: the client re-renders <App/> with BrowserRouter,
  // and React reconciles the route tree.
  const tree = (
    <ProjectProvider>
      <AuthProvider>
        <WatchlistProvider>
          <StaticRouter location={path}>
            <AppRoutes />
          </StaticRouter>
        </WatchlistProvider>
      </AuthProvider>
    </ProjectProvider>
  );
  return renderToString(tree);
}

// Reference App so tree-shaking doesn't drop the konami-toast paths from
// the browser bundle inadvertently (they're not actually pulled in here).
export { App };
