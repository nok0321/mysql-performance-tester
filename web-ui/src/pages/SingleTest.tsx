import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { connectionsApi, sqlApi, testsApi } from '../api/client';
import StatCardsGrid from '../components/StatCardsGrid';
import ProgressBar from '../components/ProgressBar';
import PercentilesTable from '../components/PercentilesTable';
import HistogramChart from '../components/HistogramChart';
import ExplainPanel from '../components/ExplainPanel';
import RecommendPanel from '../components/RecommendPanel';
import useTestExecution from '../hooks/useTestExecution';
import type {
  Connection, SqlItem, SingleTestForm,
  WsMessage, RunAction,
} from '../types';

interface Props {
  wsMessages: WsMessage[];
  subscribeTestId: (testId: string) => void;
}

export default function SingleTest({ wsMessages, subscribeTestId }: Props) {
  const { t } = useTranslation();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sqlItems, setSqlItems] = useState<SqlItem[]>([]);

  const [form, setForm] = useState<SingleTestForm>({
    connectionId: '',
    sqlMode: 'library',
    sqlId: '',
    sqlText: '',
    testName: 'Web UI Test',
    testIterations: 20,
    enableWarmup: true,
    warmupPercentage: 20,
    removeOutliers: false,
    outlierMethod: 'iqr',
    enableExplainAnalyze: true,
    enableOptimizerTrace: false,
    enableBufferPoolMonitoring: true,
    enablePerformanceSchema: false,
  });
  const setF = (k: string, v: string | number | boolean) => setForm(f => ({ ...f, [k]: v }));

  const { run, dispatch, setCurrentTestId } = useTestExecution(wsMessages);
  const [activeTab, setActiveTab] = useState('stats');

  useEffect(() => {
    connectionsApi.list().then(setConnections).catch(() => { /* ignore */ });
    sqlApi.list().then(setSqlItems).catch(() => { /* ignore */ });
  }, []);

  const handleRun = async () => {
    const sqlText = form.sqlMode === 'library'
      ? (sqlItems.find(s => s.id === form.sqlId)?.sql || '')
      : form.sqlText;

    if (!form.connectionId) return dispatch({ type: 'error', data: { message: t('singleTest.errorNoConnection') } } as RunAction);
    if (!sqlText.trim()) return dispatch({ type: 'error', data: { message: t('singleTest.errorNoSql') } } as RunAction);

    dispatch({ type: 'start', progress: { phase: 'starting', current: 0, total: form.testIterations, duration: null } });
    setCurrentTestId(null);

    try {
      const { testId } = await testsApi.runSingle({ ...form, sqlText });
      setCurrentTestId(testId);
      subscribeTestId?.(testId);
    } catch (e) {
      dispatch({ type: 'error', data: { message: (e as Error).message } });
    }
  };

  const stats = run.result?.statistics;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 'var(--space-5)', alignItems: 'start' }}>

      {/* Settings panel */}
      <div className="card">
        <div className="card-title mb-4">⚙ {t('singleTest.settingsTitle')}</div>

        <div className="form-group">
          <label className="form-label" htmlFor="st-connection">{t('singleTest.connection')} *</label>
          <select className="form-select" id="st-connection" aria-required="true" value={form.connectionId} onChange={e => setF('connectionId', e.target.value)}>
            <option value="">{t('singleTest.selectConnection')}</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name || `${c.host}/${c.database}`}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="st-name">{t('singleTest.testName')}</label>
          <input className="form-input" id="st-name" value={form.testName} onChange={e => setF('testName', e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">{t('singleTest.sqlInputMethod')}</label>
          <div className="flex gap-2">
            {(['library', 'direct'] as const).map(m => (
              <button key={m} className={`btn btn-sm ${form.sqlMode === m ? 'btn-accent' : 'btn-secondary'}`}
                onClick={() => setF('sqlMode', m)}>
                {m === 'library' ? `📚 ${t('singleTest.library')}` : `✏ ${t('singleTest.directInput')}`}
              </button>
            ))}
          </div>
        </div>

        {form.sqlMode === 'library' ? (
          <div className="form-group">
            <label className="form-label" htmlFor="st-sql-select">{t('singleTest.selectSql')}</label>
            <select className="form-select" id="st-sql-select" value={form.sqlId} onChange={e => setF('sqlId', e.target.value)}>
              <option value="">{t('singleTest.selectSql')}</option>
              {sqlItems.map(s => <option key={s.id} value={s.id}>[{s.category}] {s.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label" htmlFor="st-sql-text">{t('singleTest.sqlLabel')}</label>
            <textarea className="form-textarea" id="st-sql-text" rows={5}
              placeholder="SELECT * FROM users LIMIT 100;"
              value={form.sqlText} onChange={e => setF('sqlText', e.target.value)} />
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="st-iterations">{t('singleTest.iterations')}</label>
          <input className="form-input" id="st-iterations" type="number" min="1" max="1000"
            value={form.testIterations} onChange={e => setF('testIterations', Number(e.target.value))} />
        </div>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
          {([
            ['enableWarmup', t('singleTest.warmup')],
            ['removeOutliers', t('singleTest.removeOutliers')],
            ['enableExplainAnalyze', t('singleTest.explainAnalyze')],
            ['enableOptimizerTrace', t('singleTest.optimizerTrace')],
            ['enableBufferPoolMonitoring', t('singleTest.bufferPool')],
            ['enablePerformanceSchema', t('singleTest.perfSchema')],
          ] as [string, string][]).map(([key, label]) => (
            <div key={key} className="toggle-row">
              <span className="toggle-label">{label}</span>
              <label className="toggle">
                <input type="checkbox" checked={form[key as keyof SingleTestForm] as boolean} onChange={e => setF(key, e.target.checked)} />
                <span className="toggle-slider" />
              </label>
            </div>
          ))}
        </div>

        {form.removeOutliers && (
          <div className="form-group">
            <label className="form-label" htmlFor="st-outlier">{t('singleTest.outlierMethod')}</label>
            <select className="form-select" id="st-outlier" value={form.outlierMethod} onChange={e => setF('outlierMethod', e.target.value)}>
              <option value="iqr">{t('singleTest.iqrMethod')}</option>
              <option value="zscore">{t('singleTest.zscoreMethod')}</option>
              <option value="mad">{t('singleTest.madMethod')}</option>
            </select>
          </div>
        )}

        <button className="btn btn-primary btn-lg" style={{ width: '100%' }}
          onClick={handleRun} disabled={run.runState === 'running'}>
          {run.runState === 'running' ? <><span className="spinner" /> {t('singleTest.running')}</> : `▶ ${t('singleTest.runButton')}`}
        </button>

        {run.errorMsg && <div className="alert alert-error mt-4">⚠ {run.errorMsg}</div>}
      </div>

      {/* Results panel */}
      <div>
        {/* Progress */}
        {run.runState === 'running' && (
          <ProgressBar
            current={run.progress.current}
            total={run.progress.total}
            label={run.progress.phase === 'warmup' ? `🔥 ${t('singleTest.warmupProgress')}` : `📊 ${t('singleTest.measuringProgress')}`}
          >
            {run.progress.duration != null && (
              <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                {t('singleTest.latestDuration', { duration: run.progress.duration?.toFixed(2) })}
              </div>
            )}
          </ProgressBar>
        )}

        {/* Summary stat cards */}
        {stats && (
          <StatCardsGrid items={[
            { label: t('common.mean'), value: stats.basic?.mean, unit: 'ms' },
            { label: t('common.p95'), value: stats.percentiles?.p95, unit: 'ms', highlight: true },
            { label: t('common.p99'), value: stats.percentiles?.p99, unit: 'ms' },
            { label: t('common.cv'), value: stats.spread?.cv, unit: '%' },
          ]} />
        )}

        {/* Detail tabs */}
        {run.result && (
          <div className="card fade-in">
            <div className="tabs">
              {([['stats', `📊 ${t('singleTest.tabStats')}`], ['histogram', `📈 ${t('singleTest.tabDistribution')}`], ['explain', `🔍 ${t('singleTest.tabExplain')}`], ['recommend', `💡 ${t('singleTest.tabRecommend')}`]] as const).map(([id, label]) => (
                <button key={id} className={`tab-btn${activeTab === id ? ' active' : ''}`}
                  aria-label={label} onClick={() => setActiveTab(id)}>{label}</button>
              ))}
            </div>

            {activeTab === 'stats' && (
              <div>
                <div className="card-grid card-grid-2 mb-4">
                  <div>
                    <div className="section-title">{t('singleTest.basicStats')}</div>
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {([
                            [t('common.min'), stats?.basic?.min],
                            [t('common.max'), stats?.basic?.max],
                            [t('common.mean'), stats?.basic?.mean],
                            [t('common.median'), stats?.basic?.median],
                            [t('common.stdDev'), stats?.spread?.stdDev],
                            [t('common.iqr'), stats?.spread?.iqr],
                          ] as [string, number | undefined][]).map(([l, v]) => (
                            <tr key={l}><td className="text-muted">{l}</td><td className="font-mono">{v ?? '-'} ms</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div>
                    <div className="section-title">{t('singleTest.executionCount')}</div>
                    <div className="table-wrap">
                      <table>
                        <tbody>
                          {([
                            [t('singleTest.total'), stats?.count?.total],
                            [t('singleTest.used'), stats?.count?.included],
                            [t('singleTest.outliers'), stats?.count?.outliers],
                          ] as [string, number | undefined][]).map(([l, v]) => (
                            <tr key={l}><td className="text-muted">{l}</td><td className="font-mono">{v ?? '-'} {t('common.times')}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="section-title">{t('common.percentile')}</div>
                <PercentilesTable percentiles={stats?.percentiles} />
              </div>
            )}

            {activeTab === 'histogram' && (
              <HistogramChart distribution={stats?.distribution} />
            )}

            {activeTab === 'explain' && (
              <ExplainPanel explain={run.result.explainAnalyze} />
            )}

            {activeTab === 'recommend' && (
              <RecommendPanel plan={run.result.explainAnalyze?.queryPlan} />
            )}
          </div>
        )}

        {!run.result && !run.runState && (
          <div className="empty-state">
            <div className="empty-icon">▶</div>
            <p>{t('singleTest.emptyState')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
