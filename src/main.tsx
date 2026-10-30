import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MarketingHome from './MarketingHome';
import './index.css';
import { shouldShowMarketingHome } from './lib/routes';

const EntryScreen = shouldShowMarketingHome(window.location.pathname)
  ? MarketingHome
  : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EntryScreen />
  </React.StrictMode>,
);
