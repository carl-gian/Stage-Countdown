import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
// Noto Sans: the Steward font, bundled so it works without internet at the hall.
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/500.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/noto-sans/800.css';
// Inter: still offered for the "own colours" (custom) stage style.
import '@fontsource/inter/400.css';
import '@fontsource/inter/700.css';
import './index.css';

// The stage window keeps its own dark page; the controller follows Windows light/dark (src/styles/steward.css).
if (new URLSearchParams(window.location.search).get('view') === 'stage') {
  document.documentElement.classList.add('is-stage');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
