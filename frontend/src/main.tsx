// import { StrictMode } from 'react'
import React from 'react';
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import FreeBrowse from './components/freebrowse.tsx';
import QaViewer from './components/qa-viewer.tsx';
import { deploymentConfig } from './lib/deployment-config';
import { applyExportLockdown } from './lib/disable-export';
import { ZARR_SUPPORTED } from './lib/zarr';
import {
  createFreeBrowseInstance,
  QA_VIEWER_NIIVUE_OPTIONS,
} from './lib/default-niivue-options';

// Secure deployments: neutralize niivue's save-to-disk API before the app mounts.
if (deploymentConfig.downloadDisabled) {
  applyExportLockdown();
}

// Get base path from Vite's base config (import.meta.env.BASE_URL)
// This is automatically set by Vite based on the `base` config option
const basename = import.meta.env.BASE_URL;

// Use HashRouter for serverless mode (file:// protocol compatibility).
// `deploymentConfig` derives this from VITE_SERVERLESS (lib/deployment-config.ts).
const isServerless = deploymentConfig.serverless;
const Router = isServerless ? HashRouter : BrowserRouter;

// The zarr streaming view has two addresses. A serverless build routes by
// hash, `<base>/#/zarr`; with a backend the route is the path `<base>/zarr`.
// `<base>/zarr/` is also a static stub (public/zarr/index.html) forwarding to
// the hash form, so the plain address works on a static host. Settle on the
// form this build routes by before the router reads the address. (A dev
// server answers `/zarr/` with the app itself, not the stub, hence the first
// case.)
const hashQuery = (hash: string) =>
  hash.includes('?') ? hash.slice(hash.indexOf('?')) : '';
if (!ZARR_SUPPORTED) {
  // No zarr view in this build (the single file). Show the default view
  // instead of a blank page, keeping the query so its loader reports that the
  // store cannot be opened here.
  if (window.location.hash.startsWith('#/zarr')) {
    const query = hashQuery(window.location.hash) || window.location.search;
    window.history.replaceState(null, '', window.location.pathname + query + '#/');
  }
} else if (isServerless) {
  if (!window.location.hash && /\/zarr\/?$/.test(window.location.pathname)) {
    const up = window.location.pathname.endsWith('/') ? '../' : './';
    const target = new URL(up + '#/zarr' + window.location.search, window.location.href);
    window.history.replaceState(null, '', target.pathname + target.hash);
  }
} else if (window.location.hash.startsWith('#/zarr')) {
  const query = hashQuery(window.location.hash) || window.location.search;
  window.history.replaceState(null, '', basename.replace(/\/$/, '') + '/zarr' + query);
}

// The app owns its NiiVue instances (a library host would pass its own).
const nv = createFreeBrowseInstance();
const qaNv = isServerless ? null : createFreeBrowseInstance(QA_VIEWER_NIIVUE_OPTIONS);

createRoot(document.getElementById('root')!).render(
  // disable strict mode for for better niivue development experience
  // <StrictMode>
  <Router basename={isServerless ? undefined : basename}>
    <Routes>
      <Route path="/" element={
         <div className="app-container">
           <div className="main-content">
             <FreeBrowse nv={nv} />
           </div>
         </div>
      } />
      {ZARR_SUPPORTED && (
        <Route path="/zarr" element={
           <div className="app-container">
             <div className="main-content">
               <FreeBrowse nv={nv} mode="zarr" />
             </div>
           </div>
        } />
      )}
      {qaNv && (
        <Route path="/qa" element={
          <div className="app-container">
            <div className="main-content">
              <QaViewer nv={qaNv} />
            </div>
          </div>
        } />
      )}
    </Routes>
  </Router>
  // </StrictMode>,

)
