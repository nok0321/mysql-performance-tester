import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { lazy, Suspense, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useWebSocket } from './hooks/useWebSocket';
import type { WsMessage } from './types';
import PageLoader from './components/PageLoader';

const Connections = lazy(() => import('./pages/Connections'));
const SqlLibrary = lazy(() => import('./pages/SqlLibrary'));
const SingleTest = lazy(() => import('./pages/SingleTest'));
const ParallelTest = lazy(() => import('./pages/ParallelTest'));
const Reports = lazy(() => import('./pages/Reports'));
const Analytics = lazy(() => import('./pages/Analytics'));
const ComparisonTest = lazy(() => import('./pages/ComparisonTest'));
const Settings = lazy(() => import('./pages/Settings'));
const QueryHistory = lazy(() => import('./pages/QueryHistory'));
import NotFound from './pages/NotFound';

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
      <nav className="sidebar-nav" aria-label="Main navigation">
        {NAV.map((item, i) =>
          item.section ? (
            <div key={i} className="nav-section-label" aria-hidden="true">{t(item.section)}</div>
          ) : (
            <NavLink
              key={item.path}
              to={item.path!}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              aria-current={undefined}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
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
        <a href="#main-content" className="skip-to-content">Skip to content</a>
        <Sidebar />
        <div className="main-area">
          <TopBar wsConnected={wsConnected} />
          <main id="main-content" className="page-content fade-in" role="main">
            <Suspense fallback={<PageLoader />}>
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
              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
