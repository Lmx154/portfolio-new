import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Site, SpacelabPage } from './App.tsx';
import { isSpacelab } from './space/isSpacelab';
import { matchesPrerenderedRoute } from './routeKey';
import './index.css';

const container = document.getElementById('root')!;

if (isSpacelab()) {
  createRoot(container).render(
    <StrictMode>
      <SpacelabPage />
    </StrictMode>
  );
} else {
  const app = (
    <StrictMode>
      <BrowserRouter>
        <Site />
      </BrowserRouter>
    </StrictMode>
  );

  // Hydrate only markup that was prerendered for this exact route (see
  // ./routeKey); dev, CMS preview and host rewrites render fresh as before.
  if (matchesPrerenderedRoute(container.dataset.prerenderedRoute, window.location.pathname)) {
    hydrateRoot(container, app, {
      onRecoverableError: (error, errorInfo) => {
        console.error('[hydrate]', error, errorInfo.componentStack ?? '');
      },
    });
  } else {
    createRoot(container).render(app);
  }
}
