import { useState, useEffect } from 'react';
import { reportsApi } from '../api/client';

function gradeClass(grade) {
  if (!grade) return '';
  const g = grade.replace(/[^A-F+]/g, '').replace('+', 'plus');
  return `grade-${g}`;
}

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    reportsApi.list()
      .then(data => { setReports(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const handleSelect = async (report) => {
    setSelected(report);
    setDetail(null);
    setDetailLoading(true);
    try {
      const data = await reportsApi.get(report.id);
      setDetail(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExport = (format) => {
    window.open(reportsApi.exportUrl(selected.id, format), '_blank');
  };

  const typeBadge = (type) => {
    if (type === 'parallel') return <span className="badge badge-blue">並列</span>;
    if (type === 'batch') return <span className="badge badge-yellow">バッチ</span>;
    return <span className="badge badge-green">単一</span>;
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>

      {/* レポート一覧 */}
      <div>
        <div className="section-title">📋 レポート一覧</div>
        {error && <div className="alert alert-error">{error}</div>}
        {loading ? (
          <div className="empty-state"><div className="spinner spinner-lg" /></div>
        ) : reports.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <p>レポートがありません</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
            {reports.map(r => (
              <div
                key={r.id}
                className="card"
                style={{ cursor: 'pointer', border: selected?.id === r.id ? '1px solid var(--color-accent)' : undefined }}
                onClick={() => handleSelect(r)}
              >
                <div className="flex items-center gap-2 mb-4" style={{ marginBottom: 6 }}>
                  {typeBadge(r.type)}
                  <span className="text-sm truncate" style={{ flex: 1 }}>{r.testName || r.id}</span>
                </div>
                <div className="text-xs text-muted">
                  📅 {new Date(r.createdAt).toLocaleString('ja-JP')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 詳細 */}
      <div>
        {!selected && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <p>左のリストからレポートを選択してください</p>
          </div>
        )}

        {detailLoading && <div className="empty-state"><div className="spinner spinner-lg" /></div>}

        {detail && !detailLoading && (() => {
          const result = detail.result || detail.results?.[0];
          const stats = result?.statistics;
          return (
            <div className="fade-in">
              <div className="card-header mb-4">
                <div>
                  <div className="card-title">{detail.testName || selected.id}</div>
                  <div className="text-xs text-muted">{selected.id}</div>
                </div>
                <div className="flex gap-2">
                  {['json', 'csv', 'html', 'markdown'].map(fmt => (
                    <button key={fmt} className="btn btn-secondary btn-sm" onClick={() => handleExport(fmt)}>
                      ⬇ {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {stats && (
                <>
                  <div className="card-grid card-grid-4 mb-4">
                    {[
                      { label: '平均', value: stats.basic?.mean, unit: 'ms' },
                      { label: 'P95', value: stats.percentiles?.p95, unit: 'ms' },
                      { label: 'P99', value: stats.percentiles?.p99, unit: 'ms' },
                      { label: 'CV', value: stats.spread?.cv, unit: '%' },
                    ].map(s => (
                      <div key={s.label} className="stat-card">
                        <div className="stat-label">{s.label}</div>
                        <div className="stat-value">{s.value ?? '-'}<span className="stat-unit">{s.unit}</span></div>
                      </div>
                    ))}
                  </div>

                  <div className="card">
                    <div className="section-title">パーセンタイル詳細</div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>パーセンタイル</th><th>値 (ms)</th></tr></thead>
                        <tbody>
                          {Object.entries(stats.percentiles || {}).map(([k, v]) => (
                            <tr key={k}><td>{k.toUpperCase()}</td><td className="font-mono">{v}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* 並列テスト結果 */}
              {detail.results && !Array.isArray(detail.results) && (
                <div className="mt-4">
                  <div className="section-title mb-4">⚡ 並列テスト結果</div>
                  {Object.entries(detail.results).map(([strategy, data]) => {
                    const m = data?.metrics;
                    if (!m) return null;
                    const perFile = m.perFile || {};
                    const fileEntries = Object.entries(perFile);
                    return (
                      <div key={strategy} className="card mb-4 fade-in">
                        {/* 戦略サマリー */}
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

                        {/* SQL ファイル別内訳 */}
                        {fileEntries.length > 0 && (
                          <>
                            <div style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
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
                                    <th style={{ textAlign: 'right', color: 'var(--color-accent)' }}>P95 (ms)</th>
                                    <th style={{ textAlign: 'right' }}>P99 (ms)</th>
                                    <th style={{ textAlign: 'right' }}>最小 (ms)</th>
                                    <th style={{ textAlign: 'right' }}>最大 (ms)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {fileEntries.map(([fileName, fs]) => (
                                    <tr key={fileName}>
                                      <td className="font-mono" style={{ fontSize: 'var(--text-xs)' }}>{fileName}</td>
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

                        {fileEntries.length === 0 && (
                          <div className="text-xs text-muted" style={{ marginTop: 'var(--space-2)' }}>
                            📄 SQL ファイル別内訳はありません（再テストで取得できます）
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
