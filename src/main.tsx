import '@fontsource/oswald/500.css';
import '@fontsource/oswald/600.css';
import '@fontsource/oswald/700.css';
import '@fontsource/roboto-condensed/400.css';
import '@fontsource/roboto-condensed/400-italic.css';
import '@fontsource/roboto-condensed/700.css';
import '@fontsource/lobster/400.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
