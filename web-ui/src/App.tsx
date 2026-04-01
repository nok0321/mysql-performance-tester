import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocket } from './hooks/useWebSocket';
import type { WsMessage } from './types';

import Connections from './pages/Connections';
import SqlLibrary from './pages/SqlLibrary';
import SingleTest from './pages/SingleTest';
import ParallelTest from './pages/ParallelTest';
import Reports from './pages/Reports';
import Analytics from './pages/Analytics';
import ComparisonTest from './pages/ComparisonTest';
import Settings from './pages/Settings';
import QueryHistory from './pages/QueryHistory';

type NavItem =
  | { section: string; path?: undefined; icon?: undefined; labelKey?: undefined }
  | { path: string; icon: string; labelKey: string; section?: undefined };

const NAV: NavItem[] = [
  { section: 'nav.setup' },
  { path: '/connections', icon: '🔌', labelKey: 'nav.connections' },
  { path: '/sql-library', icon: '📝', labelKey: 'nav.sqlLibrary' },
  { section: 'nav.execute' },
  { path: '/single-test', icon: '▶', labelKey: 'nav.singleTest' },
  { path: '/parallel-test', icon: '⚡', labelKey: 'nav.parallelTest' },
  { path: '/comparison', icon: 'AB', labelKey: 'nav.comparison' },
  { section: 'nav.insights' },
  { path: '/reports', icon: '📋', labelKey: 'nav.reports' },
  { path: '/analytics', icon: '📈', labelKey: 'nav.analytics' },
  { path: '/history', icon: '🕐', labelKey: 'nav.history' },
  { section: 'nav.system' },
  { path: '/settings', icon: '⚙️', labelKey: 'nav.settings' },
];

const PAGE_META_KEYS: Record<string, string> = {
  '/connections': 'connections',
  '/sql-library': 'sqlLibrary',
  '/single-test': 'singleTest',
  '/parallel-test': 'parallelTest',
  '/comparison': 'comparison',
  '/reports': 'reports',
  '/analytics': 'analytics',
  '/history': 'history',
  '/settings': 'settings',
};

function Sidebar() {
  const { t } = useTranslation();
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>⚡ {t('app.logo')}</h1>
        <p>{t('app.logoSub')}</p>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((item, i) =>
          item.section ? (
            <div key={i} className="nav-section-label">{t(item.section)}</div>
          ) : (
            <NavLink
              key={item.path}
              to={item.path!}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {t(item.labelKey!)}
            </NavLink>
          )
        )}
      </nav>
    </aside>
  );
}

function TopBar({ wsConnected }: { wsConnected: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const metaKey = PAGE_META_KEYS[location.pathname];
  const title = metaKey ? t(`pageMeta.${metaKey}.title`) : t('app.defaultTitle');
  const subtitle = metaKey ? t(`pageMeta.${metaKey}.subtitle`) : undefined;
  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{title}</div>
        {subtitle && <div className="topbar-subtitle">{subtitle}</div>}
      </div>
      <div className="topbar-spacer" />
      <span className={`ws-badge ${wsConnected ? 'connected' : 'disconnected'}`}>
        {wsConnected ? `● ${t('app.wsConnected')}` : `○ ${t('app.wsDisconnected')}`}
      </span>
    </header>
  );
}

export default function App() {
  const [wsConnected, setWsConnected] = useState(false);
  const [wsMessages, setWsMessages] = useState<WsMessage[]>([]);

  const handleWsMessage = useCallback((msg: WsMessage) => {
    if (msg.type === 'connected') {
      setWsConnected(true);
    }
    setWsMessages(prev => [...prev.slice(-50), msg]);
  }, []);

  const { subscribeTestId } = useWebSocket(handleWsMessage);

  return (
    <BrowserRouter>
      <div className="layout">
        <Sidebar />
        <div className="main-area">
          <TopBar wsConnected={wsConnected} />
          <main className="page-content fade-in">
            <Routes>
              <Route path="/" element={<SingleTest wsMessages={wsMessages} subscribeTestId={subscribeTestId} />} />
              <Route path="/connections" element={<Connections />} />
              <Route path="/sql-library" element={<SqlLibrary />} />
              <Route path="/single-test" element={<SingleTest wsMessages={wsMessages} subscribeTestId={subscribeTestId} />} />
              <Route path="/parallel-test" element={<ParallelTest wsMessages={wsMessages} subscribeTestId={subscribeTestId} />} />
              <Route path="/comparison" element={<ComparisonTest wsMessages={wsMessages} subscribeTestId={subscribeTestId} />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/history" element={<QueryHistory />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
