import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MarketingHome from './MarketingHome';
import './index.css';

const isHomepage = window.location.pathname === '/' || window.location.pathname === '';
const hasCheckoutQuery = new URLSearchParams(window.location.search).has('checkout');
const EntryScreen = isHomepage && !hasCheckoutQuery ? MarketingHome : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EntryScreen />
  </React.StrictMode>,
);
