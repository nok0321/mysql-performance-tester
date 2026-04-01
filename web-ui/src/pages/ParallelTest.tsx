import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { connectionsApi, testsApi, sqlApi as sqlLibraryApi } from '../api/client';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import StatCardsGrid from '../components/StatCardsGrid';
import ProgressBar from '../components/ProgressBar';
import useTestExecution from '../hooks/useTestExecution';
import type {
  Connection, SqlItem, ParallelTestForm,
  WsMessage, RunAction,
} from '../types';

interface Props {
  wsMessages: WsMessage[];
  subscribeTestId: (testId: string) => void;
}

export default function ParallelTest({ wsMessages, subscribeTestId }: Props) {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sqlSnippets, setSqlSnippets] = useState<SqlItem[]>([]);
  const [form, setForm] = useState<ParallelTestForm>({
    connectionId: '',
    testName: t('parallelTest.defaultName'),
    parallelThreads: 10,
    testIterations: 20,
    parallelDirectory: './parallel',
  });
  const setF = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const [sqlMode, setSqlMode] = useState<'directory' | 'library'>('directory');
  const [selectedSqlIds, setSelectedSqlIds] = useState<string[]>([]);

  const { run, dispatch, setCurrentTestId } = useTestExecution(wsMessages);

  useEffect(() => {
    connectionsApi.list().then(setConnections).catch(() => { /* ignore */ });
    sqlLibraryApi.list().then(setSqlSnippets).catch(() => { /* ignore */ });
  }, []);

  const toggleSqlId = (id: string) => {
    setSelectedSqlIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleRun = async () => {
    if (!form.connectionId) return dispatch({ type: 'error', data: { message: t('parallelTest.errorNoConnection') } } as RunAction);
    if (sqlMode === 'library' && selectedSqlIds.length === 0)
      return dispatch({ type: 'error', data: { message: t('parallelTest.errorNoSql') } } as RunAction);

    dispatch({ type: 'start', progress: { current: 0, total: form.parallelThreads * form.testIterations, duration: null } });
    setCurrentTestId(null);

    try {
      const payload = sqlMode === 'library'
        ? { ...form, sqlIds: selectedSqlIds }
        : { ...form };
      const { testId } = await testsApi.runParallel(payload);
      setCurrentTestId(testId);
      subscribeTestId?.(testId);
    } catch (e) {
      dispatch({ type: 'error', data: { message: (e as Error).message } });
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>

      {/* Settings panel */}
      <div className="card">
        <div className="card-title mb-4">⚡ {t('parallelTest.settingsTitle')}</div>

        <div className="form-group">
          <label className="form-label">{t('singleTest.connection')} *</label>
          <select className="form-select" value={form.connectionId} onChange={e => setF('connectionId', e.target.value)}>
            <option value="">{t('common.select')}</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name || c.host}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">{t('parallelTest.testName')}</label>
          <input className="form-input" value={form.testName} onChange={e => setF('testName', e.target.value)} />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">{t('parallelTest.threads')}</label>
            <input className="form-input" type="number" min="1" max="100"
              value={form.parallelThreads} onChange={e => setF('parallelThreads', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('parallelTest.iterationsPerThread')}</label>
            <input className="form-input" type="number" min="1"
              value={form.testIterations} onChange={e => setF('testIterations', Number(e.target.value))} />
          </div>
        </div>

        {/* SQL source toggle */}
        <div className="form-group">
          <label className="form-label">{t('parallelTest.sqlSource')}</label>
          <div className="flex gap-2" style={{ marginBottom: 'var(--space-3)' }}>
            <button
              className={`btn btn-sm ${sqlMode === 'directory' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSqlMode('directory')}
            >📁 {t('parallelTest.directory')}</button>
            <button
              className={`btn btn-sm ${sqlMode === 'library' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSqlMode('library')}
            >📚 {t('parallelTest.library')}</button>
          </div>

          {sqlMode === 'directory' && (
            <>
              <input className="form-input" placeholder="./parallel"
                value={form.parallelDirectory} onChange={e => setF('parallelDirectory', e.target.value)} />
              <div className="text-xs text-muted" style={{ marginTop: 4 }}>
                {t('parallelTest.dirHint')}
              </div>
            </>
          )}

          {sqlMode === 'library' && (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 6, maxHeight: 220, overflowY: 'auto', padding: 'var(--space-2)' }}>
              {sqlSnippets.length === 0 ? (
                <div className="text-xs text-muted" style={{ padding: 8 }}>
                  {t('parallelTest.libraryEmpty')}
                </div>
              ) : (
                sqlSnippets.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 4px', cursor: 'pointer', borderRadius: 4, transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
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
              ✓ {t('parallelTest.selectedCount', { count: selectedSqlIds.length })}
            </div>
          )}
        </div>

        <button className="btn btn-primary btn-lg" style={{ width: '100%' }}
          onClick={handleRun} disabled={run.runState === 'running'}>
          {run.runState === 'running' ? <><span className="spinner" /> {t('parallelTest.running')}</> : `⚡ ${t('parallelTest.runButton')}`}
        </button>

        {run.errorMsg && <div className="alert alert-error mt-4">{run.errorMsg}</div>}

        <div className="text-xs text-muted mt-4" style={{ marginTop: 'var(--space-4)' }}>
          {t('parallelTest.totalQueries', { count: form.parallelThreads * form.testIterations })}
        </div>
      </div>

      {/* Results panel */}
      <div>
        {run.runState === 'running' && (
          <ProgressBar
            current={run.progress.current}
            total={run.progress.total}
            label={`⚡ ${t('parallelTest.progressLabel')}`}
          >
            {run.liveData.length > 1 && (
              <ResponsiveContainer width="100%" height={140} style={{ marginTop: 16 }}>
                <LineChart data={run.liveData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="t" hide />
                  <YAxis tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 6 }} />
                  <Line type="monotone" dataKey="duration" stroke="var(--color-accent)" dot={false} strokeWidth={2} name={t('parallelTest.latencyLabel')} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ProgressBar>
        )}

        {run.results && (
          <div className="fade-in">
            {Object.entries(run.results).map(([strategy, data]) => {
              const m = data?.metrics;
              if (!m) return null;
              const perFile = m.perFile || {};
              const fileEntries = Object.entries(perFile);
              return (
                <div key={strategy} className="card mb-4">
                  <div className="card-header">
                    <div className="card-title">⚡ {t('common.strategy')}: {strategy}</div>
                    <span className={`badge ${parseFloat(m.queries?.successRate ?? '0') >= 90 ? 'badge-green' : parseFloat(m.queries?.successRate ?? '0') >= 50 ? 'badge-yellow' : 'badge-red'}`}>
                      {t('common.successRate')} {m.queries?.successRate}
                    </span>
                  </div>
                  <StatCardsGrid items={[
                    { label: t('common.qps'), value: m.throughput?.qps, unit: '/s' },
                    { label: t('common.totalQueries'), value: m.queries?.total, unit: t('common.items') },
                    { label: t('common.p95'), value: m.latency?.percentiles?.p95, unit: 'ms' },
                    { label: t('common.duration'), value: m.duration?.seconds?.toFixed(3), unit: 's' },
                  ]} />

                  {fileEntries.length > 0 && (
                    <>
                      <div className="section-title" style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)' }}>
                        📄 {t('parallelTest.fileBreakdown')}
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>{t('common.fileName')}</th>
                              <th style={{ textAlign: 'right' }}>{t('common.success')}</th>
                              <th style={{ textAlign: 'right' }}>{t('common.failure')}</th>
                              <th style={{ textAlign: 'right' }}>{t('common.successRate')}</th>
                              <th style={{ textAlign: 'right' }}>{t('common.mean')} (ms)</th>
                              <th style={{ textAlign: 'right' }}>P50 (ms)</th>
                              <th style={{ textAlign: 'right' }}>{t('common.p95')} (ms)</th>
                              <th style={{ textAlign: 'right' }}>{t('common.p99')} (ms)</th>
                              <th style={{ textAlign: 'right' }}>{t('common.min')} (ms)</th>
                              <th style={{ textAlign: 'right' }}>{t('common.max')} (ms)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fileEntries.map(([fileName, fs]) => (
                              <tr key={fileName}>
                                <td className="font-mono" style={{ fontSize: 'var(--text-xs)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {fileName}
                                </td>
                                <td style={{ textAlign: 'right' }}><span className="badge badge-green">{fs.completed}</span></td>
                                <td style={{ textAlign: 'right' }}>{(fs.failed ?? 0) > 0 ? <span className="badge badge-red">{fs.failed}</span> : <span className="text-muted">0</span>}</td>
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

        {!run.results && !run.runState && (
          <div className="empty-state">
            <div className="empty-icon">⚡</div>
            <p>{t('parallelTest.emptyState')}</p>
            <p className="text-xs mt-4" style={{ marginTop: 8 }}>
              {t('parallelTest.emptyHint')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
