import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useState, useCallback } from 'react';
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

type NavItem =
  | { section: string; path?: undefined; icon?: undefined; label?: undefined }
  | { path: string; icon: string; label: string; section?: undefined };

const NAV: NavItem[] = [
  { section: 'Setup' },
  { path: '/connections', icon: '🔌', label: '接続管理' },
  { path: '/sql-library', icon: '📝', label: 'SQL ライブラリ' },
  { section: 'Execute' },
  { path: '/single-test', icon: '▶', label: '単一テスト' },
  { path: '/parallel-test', icon: '⚡', label: '並列テスト' },
  { path: '/comparison', icon: 'AB', label: 'A/B 比較' },
  { section: 'Insights' },
  { path: '/reports', icon: '📋', label: 'レポート' },
  { path: '/analytics', icon: '📈', label: 'アナリティクス' },
  { section: 'System' },
  { path: '/settings', icon: '⚙️', label: '設定' },
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>⚡ MySQL Perf</h1>
        <p>Performance Tester</p>
      </div>
      <nav className="sidebar-nav">
        {NAV.map((item, i) =>
          item.section ? (
            <div key={i} className="nav-section-label">{item.section}</div>
          ) : (
            <NavLink
              key={item.path}
              to={item.path!}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          )
        )}
      </nav>
    </aside>
  );
}

const PAGE_META: Record<string, { title: string; subtitle?: string }> = {
  '/connections': { title: '接続管理', subtitle: 'MySQL 接続先の登録と疎通確認' },
  '/sql-library': { title: 'SQL ライブラリ', subtitle: 'テスト用 SQL の登録・管理' },
  '/single-test': { title: '単一テスト', subtitle: 'ウォームアップ付きクエリ性能測定' },
  '/parallel-test': { title: '並列テスト', subtitle: '負荷シミュレーション & QPS 計測' },
  '/comparison': { title: 'A/B 比較テスト', subtitle: '2つのクエリの性能を並べて比較' },
  '/reports': { title: 'レポート', subtitle: '過去のテスト結果を閲覧・エクスポート' },
  '/analytics': { title: 'アナリティクス', subtitle: 'トレンド分析と比較' },
  '/settings': { title: '設定', subtitle: 'デフォルト設定の管理' },
};

function TopBar({ wsConnected }: { wsConnected: boolean }) {
  const location = useLocation();
  const meta = PAGE_META[location.pathname] || { title: 'MySQL Performance Tester' };
  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{meta.title}</div>
        {meta.subtitle && <div className="topbar-subtitle">{meta.subtitle}</div>}
      </div>
      <div className="topbar-spacer" />
      <span className={`ws-badge ${wsConnected ? 'connected' : 'disconnected'}`}>
        {wsConnected ? '● WS Connected' : '○ WS Disconnected'}
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
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
