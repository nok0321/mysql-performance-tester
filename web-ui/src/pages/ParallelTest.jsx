import { useState, useEffect } from 'react';
import { connectionsApi, testsApi, sqlApi as sqlLibraryApi } from '../api/client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

export default function ParallelTest({ wsMessages, subscribeTestId }) {
  const [connections, setConnections] = useState([]);
  const [sqlSnippets, setSqlSnippets] = useState([]);
  const [form, setForm] = useState({
    connectionId: '',
    testName: '並列テスト',
    parallelThreads: 10,
    testIterations: 20,
    parallelDirectory: './parallel',
  });
  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // SQL ソースモード: 'directory' | 'library'
  const [sqlMode, setSqlMode] = useState('directory');
  const [selectedSqlIds, setSelectedSqlIds] = useState([]);

  const [runState, setRunState] = useState(null);
  const [currentTestId, setCurrentTestId] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState(null);
  const [liveData, setLiveData] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    connectionsApi.list().then(setConnections).catch(() => { });
    sqlLibraryApi.list().then(setSqlSnippets).catch(() => { });
  }, []);

  useEffect(() => {
    if (!currentTestId || !wsMessages.length) return;
    const relevant = wsMessages.filter(m => m.testId === currentTestId);
    if (!relevant.length) return;
    const last = relevant[relevant.length - 1];
    if (last.type === 'progress') {
      setProgress(last.data);
      setLiveData(prev => [...prev.slice(-60), {
        t: prev.length,
        duration: last.data.duration
      }]);
    } else if (last.type === 'complete') {
      setRunState('complete');
      setResults(last.data.results);
    } else if (last.type === 'error') {
      setRunState('error');
      setErrorMsg(last.data.message);
    }
  }, [wsMessages, currentTestId]);

  const toggleSqlId = (id) => {
    setSelectedSqlIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleRun = async () => {
    if (!form.connectionId) return setErrorMsg('接続先を選択してください');
    if (sqlMode === 'library' && selectedSqlIds.length === 0)
      return setErrorMsg('SQL ライブラリから1件以上選択してください');
    setErrorMsg('');
    setResults(null);
    setLiveData([]);
    setCurrentTestId(null);
    setRunState('running');
    setProgress({ current: 0, total: form.parallelThreads * form.testIterations });

    try {
      const payload = sqlMode === 'library'
        ? { ...form, sqlIds: selectedSqlIds }
        : { ...form };
      // サーバーが生成した testId を受け取り、WebSocket フィルタに使う
      const { testId } = await testsApi.runParallel(payload);
      setCurrentTestId(testId);
      subscribeTestId?.(testId);
    } catch (e) {
      setRunState('error');
      setErrorMsg(e.message);
    }
  };

  const progressPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>

      {/* 設定パネル */}
      <div className="card">
        <div className="card-title mb-4">⚡ 並列テスト設定</div>

        <div className="form-group">
          <label className="form-label">接続先 *</label>
          <select className="form-select" value={form.connectionId} onChange={e => setF('connectionId', e.target.value)}>
            <option value="">選択...</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name || c.host}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">テスト名</label>
          <input className="form-input" value={form.testName} onChange={e => setF('testName', e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">並列スレッド数</label>
            <input className="form-input" type="number" min="1" max="100"
              value={form.parallelThreads} onChange={e => setF('parallelThreads', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">各スレッドの実行回数</label>
            <input className="form-input" type="number" min="1"
              value={form.testIterations} onChange={e => setF('testIterations', Number(e.target.value))} />
          </div>
        </div>

        {/* SQL ソース切り替え */}
        <div className="form-group">
          <label className="form-label">SQL ソース</label>
          <div className="flex gap-2" style={{ marginBottom: 'var(--space-3)' }}>
            <button
              className={`btn btn-sm ${sqlMode === 'directory' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSqlMode('directory')}
            >📁 ディレクトリ</button>
            <button
              className={`btn btn-sm ${sqlMode === 'library' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSqlMode('library')}
            >📚 SQL ライブラリ</button>
          </div>

          {sqlMode === 'directory' && (
            <>
              <input className="form-input" placeholder="./parallel"
                value={form.parallelDirectory} onChange={e => setF('parallelDirectory', e.target.value)} />
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                プロジェクト内の相対パスのみ指定可能（絶対パス・ディレクトリ移動は不可）
              </div>
            </>
          )}

          {sqlMode === 'library' && (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, maxHeight: 220, overflowY: 'auto', padding: 'var(--space-2)' }}>
              {sqlSnippets.length === 0 ? (
                <div className="text-xs text-muted" style={{ padding: 8 }}>
                  SQL ライブラリが空です。先に SQL を登録してください。
                </div>
              ) : (
                sqlSnippets.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 4px', cursor: 'pointer', borderRadius: 4, transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <input type="checkbox"
                      checked={selectedSqlIds.includes(s.id)}
                      onChange={() => toggleSqlId(s.id)}
                      style={{ marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <div className="text-sm" style={{ fontWeight: 500 }}>{s.name}</div>
                      <div className="text-xs text-muted">{s.category}{s.description ? ` · ${s.description}` : ''}</div>
                    </div>
                  </label>
                ))
              )}
            </div>
          )}
          {sqlMode === 'library' && selectedSqlIds.length > 0 && (
            <div className="text-xs" style={{ marginTop: 4, color: 'var(--color-accent)' }}>
              ✓ {selectedSqlIds.length} 件選択中
            </div>
          )}
        </div>

        <button className="btn btn-primary btn-lg" style={{ width: '100%' }}
          onClick={handleRun} disabled={runState === 'running'}>
          {runState === 'running' ? <><span className="spinner" /> 実行中...</> : '⚡ 並列テスト実行'}
        </button>

        {errorMsg && <div className="alert alert-error mt-4">{errorMsg}</div>}

        <div className="text-xs text-muted mt-4" style={{ marginTop: 'var(--space-4)' }}>
          総クエリ数: {form.parallelThreads * form.testIterations} 回
        </div>
      </div>

      {/* 結果パネル */}
      <div>
        {runState === 'running' && (
          <div className="card mb-4 fade-in">
            <div className="flex items-center justify-between mb-4">
              <span className="card-title">⚡ 並列実行中...</span>
              <span className="badge badge-blue">{progress.current}/{progress.total} クエリ完了</span>
            </div>
            <div className="progress-wrap">
              <div className="progress-bar" style={{ width: `${progressPct}%` }} />
            </div>
            {liveData.length > 1 && (
              <ResponsiveContainer width="100%" height={140} style={{ marginTop: 16 }}>
                <LineChart data={liveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="t" hide />
                  <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6 }} />
                  <Line type="monotone" dataKey="duration" stroke="var(--color-accent)" dot={false} strokeWidth={2} name="レイテンシ (ms)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {results && (
          <div className="fade-in">
            {Object.entries(results).map(([strategy, data]) => {
              const m = data?.metrics;
              if (!m) return null;
              const perFile = m.perFile || {};
              const fileEntries = Object.entries(perFile);
              return (
                <div key={strategy} className="card mb-4">
                  {/* ─ 戦略サマリー ─ */}
                  <div className="card-header">
                    <div className="card-title">⚡ 戦略: {strategy}</div>
                    <span className={`badge ${parseFloat(m.queries?.successRate) >= 90 ? 'badge-green' : parseFloat(m.queries?.successRate) >= 50 ? 'badge-yellow' : 'badge-red'}`}>
                      成功率 {m.queries?.successRate}
                    </span>
                  </div>
                  <div className="card-grid card-grid-4 mb-4">
                    {[
                      { label: 'QPS', value: m.throughput?.qps, unit: '/s' },
                      { label: '総クエリ', value: m.queries?.total, unit: '件' },
                      { label: 'P95', value: m.latency?.percentiles?.p95, unit: 'ms' },
                      { label: '実行時間', value: m.duration?.seconds?.toFixed(3), unit: 's' },
                    ].map(s => (
                      <div key={s.label} className="stat-card">
                        <div className="stat-label">{s.label}</div>
                        <div className="stat-value">{s.value ?? '-'}<span className="stat-unit">{s.unit}</span></div>
                      </div>
                    ))}
                  </div>

                  {/* ─ SQL 別内訳テーブル ─ */}
                  {fileEntries.length > 0 && (
                    <>
                      <div className="section-title" style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}>
                        📄 SQL ファイル別内訳
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>ファイル名</th>
                              <th style={{ textAlign: 'right' }}>成功</th>
                              <th style={{ textAlign: 'right' }}>失敗</th>
                              <th style={{ textAlign: 'right' }}>成功率</th>
                              <th style={{ textAlign: 'right' }}>平均 (ms)</th>
                              <th style={{ textAlign: 'right' }}>P50 (ms)</th>
                              <th style={{ textAlign: 'right' }}>P95 (ms)</th>
                              <th style={{ textAlign: 'right' }}>P99 (ms)</th>
                              <th style={{ textAlign: 'right' }}>最小 (ms)</th>
                              <th style={{ textAlign: 'right' }}>最大 (ms)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fileEntries.map(([fileName, fs]) => (
                              <tr key={fileName}>
                                <td className="font-mono" style={{ fontSize: 'var(--text-xs)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {fileName}
                                </td>
                                <td style={{ textAlign: 'right' }}><span className="badge badge-green">{fs.completed}</span></td>
                                <td style={{ textAlign: 'right' }}>{fs.failed > 0 ? <span className="badge badge-red">{fs.failed}</span> : <span className="text-muted">0</span>}</td>
                                <td style={{ textAlign: 'right' }}>{fs.successRate}</td>
                                <td className="font-mono" style={{ textAlign: 'right' }}>{fs.latency?.mean ?? '-'}</td>
                                <td className="font-mono" style={{ textAlign: 'right' }}>{fs.latency?.p50 ?? '-'}</td>
                                <td className="font-mono" style={{ textAlign: 'right', color: 'var(--color-accent)' }}>{fs.latency?.p95 ?? '-'}</td>
                                <td className="font-mono" style={{ textAlign: 'right' }}>{fs.latency?.p99 ?? '-'}</td>
                                <td className="font-mono" style={{ textAlign: 'right', color: 'var(--color-success)' }}>{fs.latency?.min ?? '-'}</td>
                                <td className="font-mono" style={{ textAlign: 'right', color: 'var(--color-danger)' }}>{fs.latency?.max ?? '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!results && !runState && (
          <div className="empty-state">
            <div className="empty-icon">⚡</div>
            <p>左のパネルで設定し、並列テストを実行してください</p>
            <p className="text-xs mt-4" style={{ marginTop: 8 }}>
              事前に <code className="font-mono">parallel/</code> ディレクトリに SQL ファイルを配置してください
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
